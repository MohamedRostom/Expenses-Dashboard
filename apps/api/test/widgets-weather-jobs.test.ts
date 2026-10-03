import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { sql } from 'drizzle-orm';
import { setGlobalFlag } from '@desk/db';
import { startHarness, type Harness } from './harness.js';
import { widgetsWeatherRefreshJob, ensureWidgetJobs } from '../src/jobs/widgets-weather-refresh.js';
import { widgetsPurgeJob } from '../src/jobs/widgets-purge.js';
import { weatherPausedUntil } from '../src/services/source-usage.js';
import type { Logger, LogEvent } from '../src/adapters/logger.js';

// T043 / T073 / T035 (jobs half): refresh + purge jobs and the inline first reading.

const LONDON = {
  name: 'London',
  admin1: 'England',
  country: 'United Kingdom',
  lat: 51.51,
  lon: -0.13,
  timeZone: 'Europe/London',
};
const ctx = { updateProgress: async () => {} };
type Row = Record<string, unknown>;

describe('widgets weather jobs', () => {
  let h: Harness;
  const t0 = new Date('2026-09-18T10:00:00Z');
  const enqueued: { name: string; runAfter?: Date | undefined }[] = [];
  const enqueue = async (name: string, _p: unknown, opts?: { runAfter?: Date }) => {
    enqueued.push({ name, runAfter: opts?.runAfter });
    return 'id';
  };
  const run = () =>
    widgetsWeatherRefreshJob({ db: h.db, source: h.weatherFake, clock: h.clock, enqueue })({}, ctx);
  const rows = async (q: ReturnType<typeof sql>) => (await h.db.execute(q)) as unknown as Row[];
  const usage = async (source: string) =>
    Number(
      (
        await rows(
          sql`SELECT coalesce(sum(calls), 0)::int AS n FROM widget_source_usage WHERE source = ${source}`,
        )
      )[0]!['n'],
    );

  async function user(email: string, activeAgoH: number | null) {
    const u = await h.asUser(email);
    await h.db.execute(
      sql`UPDATE users SET last_active_at = ${activeAgoH === null ? null : new Date(t0.getTime() - activeAgoH * 3600_000).toISOString()}::timestamptz WHERE id = ${u.userId}`,
    );
    return u;
  }
  const place = (userId: string, lat: string, lon: string) =>
    h.db.execute(sql`
      INSERT INTO places (user_id, name, country, time_zone, lat, lon)
      VALUES (${userId}, 'P', 'GB', 'Europe/London', ${lat}, ${lon})`);
  const reading = (lat: string, lon: string, ageMin: number) =>
    h.db.execute(sql`
      INSERT INTO weather_readings (lat, lon, time_zone, current, daily, fetched_at)
      VALUES (${lat}, ${lon}, 'Europe/London', '{"temperatureC":1,"weatherCode":0,"observedAt":"x"}'::jsonb,
              '[]'::jsonb, ${new Date(t0.getTime() - ageMin * 60_000).toISOString()}::timestamptz)`);

  beforeAll(async () => {
    h = await startHarness();
    await setGlobalFlag(h.db, 'widgets.weather', true);
    await setGlobalFlag(h.db, 'widgets.sunrise', true);
  }, 120_000);
  afterAll(async () => {
    await h.close();
  });
  beforeEach(async () => {
    h.clock.set(t0);
    h.weatherFake.calls.search = 0;
    h.weatherFake.calls.forecast = 0;
    h.weatherFake.pauseSource(0);
    h.weatherFake.failAll(false);
    enqueued.length = 0;
    await h.db.execute(sql`DELETE FROM widgets`);
    await h.db.execute(sql`DELETE FROM places`);
    await h.db.execute(sql`DELETE FROM weather_readings`);
    await h.db.execute(sql`DELETE FROM widget_source_usage`);
    await h.db.execute(sql`DELETE FROM widget_source_state`);
    await h.db.execute(sql`DELETE FROM geocode_cache`);
    await h.db.execute(sql`DELETE FROM flags WHERE key = 'widgets.weather_paused_until'`);
    await h.db.execute(sql`DELETE FROM audit_log WHERE action = 'weather.quota_pause'`);
  });

  describe('refresh', () => {
    it('fetches places with no reading or one older than 1h, for users active in 24h only', async () => {
      const a = await user('wj-a@test', 1);
      const old = await user('wj-old@test', 25);
      await place(a.userId, '51.51', '-0.13'); // no reading
      await place(a.userId, '48.86', '2.35'); // stale reading
      await reading('48.86', '2.35', 90);
      await place(a.userId, '40.71', '-74.01'); // fresh reading
      await reading('40.71', '-74.01', 10);
      await place(old.userId, '35.68', '139.69'); // owner inactive 25h
      await run();
      expect(h.weatherFake.calls.forecast).toBe(2);
      expect(await usage('open_meteo.forecast')).toBe(2);
      const got = await rows(sql`SELECT lat::text FROM weather_readings ORDER BY lat`);
      expect(got.map((r) => r['lat'])).toEqual(['40.71', '48.86', '51.51']);
    });

    it('fetches once per rounded place shared by two users', async () => {
      const a = await user('wj-s1@test', 1);
      const b = await user('wj-s2@test', 2);
      await place(a.userId, '51.51', '-0.13');
      await place(b.userId, '51.51', '-0.13');
      await run();
      expect(h.weatherFake.calls.forecast).toBe(1);
    });

    it('stores current, daily, time zone and the freshest owner activity; clears error', async () => {
      const a = await user('wj-ok@test', 3);
      await place(a.userId, '51.51', '-0.13');
      await h.db.execute(
        sql`INSERT INTO weather_readings (lat, lon, time_zone, fetched_at, error)
            VALUES ('51.51', '-0.13', 'Europe/London', ${new Date(t0.getTime() - 2 * 3600_000).toISOString()}::timestamptz, 'source_unreachable')`,
      );
      await run();
      const [r] = await rows(sql`
        SELECT current, jsonb_array_length(daily) AS days, time_zone, error,
               fetched_at = ${t0.toISOString()}::timestamptz AS fresh,
               last_active_at = ${new Date(t0.getTime() - 3 * 3600_000).toISOString()}::timestamptz AS active
        FROM weather_readings`);
      expect(r!['current']).toMatchObject({ temperatureC: expect.any(Number) });
      expect(r).toMatchObject({
        days: 4,
        time_zone: 'Europe/London',
        error: null,
        fresh: true,
        active: true,
      });
    });

    it('a 429 pauses the source until retry-after, audits it and stops the pass', async () => {
      const a = await user('wj-429@test', 1);
      await place(a.userId, '51.51', '-0.13');
      await place(a.userId, '48.86', '2.35');
      h.weatherFake.pauseSource(120_000);
      await run();
      expect(h.weatherFake.calls.forecast).toBe(1);
      const until = await weatherPausedUntil(h.db, t0);
      expect(until!.getTime() - t0.getTime()).toBeGreaterThan(100_000);
      expect(
        await rows(sql`SELECT 1 FROM audit_log WHERE action = 'weather.quota_pause'`),
      ).toHaveLength(1);
    });

    it('skips entirely while paused', async () => {
      const a = await user('wj-paused@test', 1);
      await place(a.userId, '51.51', '-0.13');
      await h.db.execute(sql`
        INSERT INTO flags (key, description, default_on, value)
        VALUES ('widgets.weather_paused_until', 't', false, ${JSON.stringify(new Date(t0.getTime() + 3600_000).toISOString())}::jsonb)
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`);
      await run();
      expect(h.weatherFake.calls.forecast).toBe(0);
    });

    it('a 5xx sets error and keeps the old current and daily', async () => {
      const a = await user('wj-5xx@test', 1);
      await place(a.userId, '51.51', '-0.13');
      await reading('51.51', '-0.13', 90);
      h.weatherFake.failAll(true);
      await run();
      const [r] = await rows(
        sql`SELECT error, current->>'temperatureC' AS t FROM weather_readings`,
      );
      expect(r).toEqual({ error: 'source_unreachable', t: '1' });
      expect(await usage('open_meteo.forecast')).toBe(1);
    });

    it('re-enqueues itself one minute later', async () => {
      await run();
      expect(enqueued).toEqual([
        { name: 'widgets.weather_refresh', runAfter: new Date(t0.getTime() + 60_000) },
      ]);
    });
  });

  describe('purge', () => {
    it('deletes idle readings, old geocode cache and old usage, logs one summary per source, re-enqueues +1 day', async () => {
      const ago = (d: number) => new Date(t0.getTime() - d * 86_400_000).toISOString();
      await h.db.execute(sql`
        INSERT INTO weather_readings (lat, lon, time_zone, last_active_at) VALUES
          ('1.00', '1.00', 'UTC', ${ago(8)}::timestamptz), ('2.00', '2.00', 'UTC', ${ago(6)}::timestamptz)`);
      await h.db.execute(sql`
        INSERT INTO geocode_cache (query, results, fetched_at) VALUES
          ('old', '[]'::jsonb, ${new Date(t0.getTime() - 25 * 3600_000).toISOString()}::timestamptz),
          ('new', '[]'::jsonb, ${new Date(t0.getTime() - 23 * 3600_000).toISOString()}::timestamptz)`);
      await h.db.execute(sql`
        INSERT INTO widget_source_usage (day, source, calls) VALUES
          (${ago(91).slice(0, 10)}::date, 'open_meteo.search', 1), (${ago(89).slice(0, 10)}::date, 'open_meteo.search', 1)`);
      await h.db.execute(sql`
        INSERT INTO widget_source_state (source, consecutive_failures) VALUES ('open_meteo.search', 0), ('open_meteo.forecast', 0)`);
      const events: LogEvent[] = [];
      const logger: Logger = { log: (e) => void events.push(e) };
      await widgetsPurgeJob({ db: h.db, clock: h.clock, enqueue, logger })({}, ctx);
      expect(
        (await rows(sql`SELECT lat::text FROM weather_readings`)).map((r) => r['lat']),
      ).toEqual(['2.00']);
      expect((await rows(sql`SELECT query FROM geocode_cache`)).map((r) => r['query'])).toEqual([
        'new',
      ]);
      expect(await rows(sql`SELECT 1 FROM widget_source_usage`)).toHaveLength(1);
      expect(events.filter((e) => e['event'] === 'widget_source_summary')).toHaveLength(2);
      expect(enqueued).toEqual([
        { name: 'widgets.purge', runAfter: new Date(t0.getTime() + 86_400_000) },
      ]);
    });
  });

  describe('ensureWidgetJobs', () => {
    it('enqueues each job once, deduped by queued or running rows', async () => {
      await h.db.execute(
        sql`DELETE FROM jobs WHERE name IN ('widgets.weather_refresh', 'widgets.purge')`,
      );
      const real = async (name: string) => {
        await h.db.execute(
          sql`INSERT INTO jobs (name, payload, run_after) VALUES (${name}, '{}'::jsonb, now())`,
        );
        return 'id';
      };
      await ensureWidgetJobs(h.db, real, t0);
      await ensureWidgetJobs(h.db, real, t0);
      const n = await rows(
        sql`SELECT name FROM jobs WHERE name IN ('widgets.weather_refresh', 'widgets.purge') ORDER BY name`,
      );
      expect(n.map((r) => r['name'])).toEqual(['widgets.purge', 'widgets.weather_refresh']);
    });
  });

  describe('job chain stays single', () => {
    const NAMES = ['widgets.weather_refresh', 'widgets.purge'];
    const queued = async () =>
      rows(
        sql`SELECT name FROM jobs WHERE name IN ('widgets.weather_refresh', 'widgets.purge') AND status = 'queued'`,
      );
    const realEnqueue = async (name: string) => {
      await h.db.execute(
        sql`INSERT INTO jobs (name, payload, run_after) VALUES (${name}, '{}'::jsonb, now())`,
      );
      return 'id';
    };
    beforeEach(async () => {
      await h.db.execute(sql`DELETE FROM jobs WHERE name IN (${NAMES[0]}, ${NAMES[1]})`);
    });

    it('a pass that throws does not rethrow and still leaves exactly one queued job', async () => {
      const boom = {
        ...h.weatherFake,
        forecast: async () => {
          throw new Error('boom');
        },
      } as unknown as typeof h.weatherFake;
      const a = await user('wj-throw@test', 1);
      await place(a.userId, '51.51', '-0.13');
      // a DB failure inside the pass (not a source failure) must not escape either
      const badDb = new Proxy(h.db, {
        get: (t, k, r) =>
          k === 'execute'
            ? async () => {
                throw new Error('db down');
              }
            : Reflect.get(t, k, r),
      });
      await widgetsWeatherRefreshJob({
        db: badDb,
        source: boom,
        clock: h.clock,
        enqueue: realEnqueue,
      })({}, ctx);
      await widgetsPurgeJob({ db: badDb, clock: h.clock, enqueue: realEnqueue })({}, ctx);
      expect((await queued()).map((r) => r['name']).sort()).toEqual([
        'widgets.purge',
        'widgets.weather_refresh',
      ]);
    });

    it('two concurrent ensures leave exactly one queued row per name', async () => {
      await Promise.all([
        ensureWidgetJobs(h.db, realEnqueue, t0),
        ensureWidgetJobs(h.db, realEnqueue, t0),
      ]);
      expect((await queued()).map((r) => r['name']).sort()).toEqual([
        'widgets.purge',
        'widgets.weather_refresh',
      ]);
    });

    it('a running row older than 10 minutes counts as absent; a recent one does not', async () => {
      const running = (ageMin: number) =>
        h.db.execute(sql`
          INSERT INTO jobs (name, payload, status, started_at)
          VALUES ('widgets.purge', '{}'::jsonb, 'running', ${new Date(t0.getTime() - ageMin * 60_000).toISOString()}::timestamptz)`);
      await running(2);
      await ensureWidgetJobs(h.db, realEnqueue, t0);
      expect((await queued()).filter((r) => r['name'] === 'widgets.purge')).toHaveLength(0);
      await h.db.execute(sql`DELETE FROM jobs WHERE name = 'widgets.purge'`);
      await running(30);
      await ensureWidgetJobs(h.db, realEnqueue, t0);
      expect((await queued()).filter((r) => r['name'] === 'widgets.purge')).toHaveLength(1);
    });
  });

  describe('outage backoff', () => {
    const failures = (agoMin: number) =>
      h.db.execute(sql`
        INSERT INTO widget_source_state (source, consecutive_failures, last_failure_at)
        VALUES ('open_meteo.forecast', 3, ${new Date(t0.getTime() - agoMin * 60_000).toISOString()}::timestamptz)
        ON CONFLICT (source) DO UPDATE SET consecutive_failures = 3, last_failure_at = EXCLUDED.last_failure_at`);
    afterAll(async () => {
      await h.db.execute(sql`DELETE FROM widget_source_state WHERE source = 'open_meteo.forecast'`);
    });

    it('job pass makes no forecast calls 2 minutes after 3 failures, but does after 11', async () => {
      const a = await user('wj-backoff@test', 1);
      await place(a.userId, '51.51', '-0.13');
      await failures(2);
      await run();
      expect(h.weatherFake.calls.forecast).toBe(0);
      await failures(11);
      await run();
      expect(h.weatherFake.calls.forecast).toBe(1);
    });
  });

  describe('inline first reading', () => {
    it('POST /widgets with a place gets a reading straight away; PATCH to a new place too', async () => {
      const a = await h.asUser('wj-inline@test');
      const res = await a.post('/widgets', { kind: 'weather', place: LONDON });
      expect(res.status).toBe(201);
      expect(h.weatherFake.calls.forecast).toBe(1);
      expect(await rows(sql`SELECT 1 FROM weather_readings WHERE lat = 51.51`)).toHaveLength(1);
      const w = ((await res.json()) as { widget: { id: string } }).widget;
      const patched = await a.patch(`/widgets/${w.id}`, {
        place: { ...LONDON, name: 'Paris', lat: 48.86, lon: 2.35 },
      });
      expect(patched.status).toBe(200);
      expect(h.weatherFake.calls.forecast).toBe(2);
    });

    it('does not refetch an existing reading, and a failing source does not fail the request', async () => {
      const a = await h.asUser('wj-inline2@test');
      await a.post('/widgets', { kind: 'weather', place: LONDON });
      await a.post('/widgets', { kind: 'sunrise', place: LONDON });
      expect(h.weatherFake.calls.forecast).toBe(1);
      h.weatherFake.failAll(true);
      const res = await a.post('/widgets', {
        kind: 'weather',
        place: { ...LONDON, name: 'Paris', lat: 48.86, lon: 2.35 },
      });
      expect(res.status).toBe(201);
    });
  });
});
