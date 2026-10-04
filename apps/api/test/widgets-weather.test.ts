import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { setGlobalFlag, users } from '@desk/db';
import { startHarness, type Harness } from './harness.js';
import type { LogEvent } from '../src/adapters/logger.js';

// T035 (figures half) / T044: weather figures builder (spec 003 US2).

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function j(res: Response): Promise<any> {
  return res.json();
}

const NOW = new Date('2026-09-30T12:00:00Z');
const PLACE = {
  name: 'Manchester',
  admin1: 'England',
  country: 'United Kingdom',
  lat: 53.48,
  lon: -2.24,
  timeZone: 'Europe/London',
};

describe('weather figures', () => {
  let h: Harness;

  async function seedReading(
    opts: { fetchedAt?: Date; error?: string | null; empty?: boolean } = {},
  ) {
    const f = await h.weatherFake.forecast(PLACE.lat, PLACE.lon, PLACE.timeZone);
    const at = (opts.fetchedAt ?? NOW).toISOString();
    await h.db.execute(sql`
      INSERT INTO weather_readings (lat, lon, time_zone, current, daily, fetched_at, last_active_at, error)
      VALUES (${PLACE.lat}, ${PLACE.lon}, ${PLACE.timeZone},
        ${opts.empty ? null : JSON.stringify(f.current)}::jsonb,
        ${opts.empty ? null : JSON.stringify(f.daily)}::jsonb,
        ${at}, ${NOW.toISOString()}, ${opts.error ?? null})
      ON CONFLICT (lat, lon) DO UPDATE SET current = EXCLUDED.current, daily = EXCLUDED.daily,
        fetched_at = EXCLUDED.fetched_at, error = EXCLUDED.error`);
    return f;
  }
  async function pause(until: string | null) {
    await h.db.execute(sql`
      INSERT INTO flags (key, description, default_on, value)
      VALUES ('widgets.weather_paused_until', 'test', false,
              ${until === null ? null : JSON.stringify(until)}::jsonb)
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`);
  }
  async function weatherOf(u: Awaited<ReturnType<Harness['asUser']>>) {
    return (await j(await u.get('/widgets'))).widgets.find(
      (w: { kind: string }) => w.kind === 'weather',
    );
  }
  async function withWidget(email: string) {
    const u = await h.asUser(email);
    const res = await u.post('/widgets', { kind: 'weather', settings: {}, place: PLACE });
    expect(res.status).toBe(201);
    return u;
  }

  beforeAll(async () => {
    h = await startHarness();
    await setGlobalFlag(h.db, 'widgets.weather', true);
    await setGlobalFlag(h.db, 'widgets.sunrise', true);
  }, 120_000);
  afterAll(async () => {
    await h.close();
  });
  beforeEach(async () => {
    h.clock.set(NOW);
    await h.db.execute(sql`DELETE FROM weather_readings`);
    await pause(null);
  });

  it('a fresh reading is ready with condition, icon, today high/low, 3-day outlook and attribution', async () => {
    const f = await seedReading();
    const w = await weatherOf(await withWidget('ww-fresh@example.com'));
    expect(w.state).toBe('ready');
    expect(w.asOf).toBe(f.current.observedAt);
    expect(w.figures).toMatchObject({
      place: 'Manchester',
      temperatureC: f.current.temperatureC,
      todayMaxC: f.daily[0]!.maxC,
      todayMinC: f.daily[0]!.minC,
      observedAt: f.current.observedAt,
      attribution: 'Weather data by Open-Meteo.com',
    });
    expect(typeof w.figures.condition).toBe('string');
    expect(typeof w.figures.icon).toBe('string');
    expect(w.figures.staleSince).toBeUndefined();
    expect(w.figures.outlook).toEqual(
      f.daily.slice(1, 4).map((d) => ({
        date: d.date,
        maxC: d.maxC,
        minC: d.minC,
        icon: expect.any(String),
        condition: expect.any(String),
      })),
    );
  });

  it('a reading older than one hour is stale with staleSince', async () => {
    const old = new Date(NOW.getTime() - 2 * 3600_000);
    await seedReading({ fetchedAt: old });
    const w = await weatherOf(await withWidget('ww-stale@example.com'));
    expect(w.state).toBe('stale');
    expect(w.figures.staleSince).toBe(old.toISOString());
  });

  it('while the source is paused: stale with source_limit_reached and the last figures', async () => {
    await seedReading();
    await pause(new Date(NOW.getTime() + 3600_000).toISOString());
    const w = await weatherOf(await withWidget('ww-paused@example.com'));
    expect(w).toMatchObject({ state: 'stale', cause: 'source_limit_reached' });
    expect(w.figures.temperatureC).toEqual(expect.any(Number));
  });

  it('an error row keeps the last figures with source_unreachable', async () => {
    await seedReading({ error: 'source_unreachable' });
    const w = await weatherOf(await withWidget('ww-error@example.com'));
    expect(w.state).toBe('stale');
    expect(w.cause).toBe('source_unreachable');
    expect(w.figures.temperatureC).toEqual(expect.any(Number));
  });

  it('an error row with no figures yet is an error with source_unreachable', async () => {
    await seedReading({ error: 'source_unreachable', empty: true });
    const w = await weatherOf(await withWidget('ww-error2@example.com'));
    expect(w).toMatchObject({ state: 'error', cause: 'source_unreachable' });
    expect(w.figures).toBeUndefined();
  });

  it('no reading and no error is empty', async () => {
    const u = await withWidget('ww-none@example.com');
    await h.db.execute(sql`DELETE FROM weather_readings`); // an inline fetch may have filled it
    expect((await weatherOf(u)).state).toBe('empty');
  });

  it('a widget without a place is error / place_not_found', async () => {
    const u = await withWidget('ww-noplace@example.com');
    await h.db.execute(
      sql`UPDATE widgets SET place_id = NULL WHERE user_id = ${u.userId} AND kind = 'weather'`,
    );
    const w = await weatherOf(u);
    expect(w).toMatchObject({ state: 'error', cause: 'place_not_found' });
  });

  it('two users with the same rounded place share one reading row', async () => {
    await seedReading();
    const a = await withWidget('ww-share-a@example.com');
    const b = await withWidget('ww-share-b@example.com');
    const [wa, wb] = [await weatherOf(a), await weatherOf(b)];
    expect(wa.figures.temperatureC).toBe(wb.figures.temperatureC);
    const rows = (await h.db.execute(
      sql`SELECT count(*)::int AS n FROM weather_readings`,
    )) as unknown as { n: number }[];
    expect(rows[0]!.n).toBe(1);
  });

  // T087: a client-supplied zone never reaches the shared reading.
  it("user A's bogus zone does not decide user B's zone for the same cell", async () => {
    const a = await h.asUser('ww-zone-a@example.com');
    const bogus = { ...PLACE, timeZone: 'Pacific/Auckland' };
    expect((await a.post('/widgets', { kind: 'sunrise', settings: {}, place: bogus })).status).toBe(
      201,
    );
    const b = await h.asUser('ww-zone-b@example.com');
    expect((await b.post('/widgets', { kind: 'sunrise', settings: {}, place: PLACE })).status).toBe(
      201,
    );
    const [r] = (await h.db.execute(sql`SELECT time_zone FROM weather_readings`)) as unknown as {
      time_zone: string;
    }[];
    expect(r!.time_zone).toBe('Europe/London');
    for (const u of [a, b]) {
      const w = (await j(await u.get('/widgets'))).widgets.find(
        (x: { kind: string }) => x.kind === 'sunrise',
      );
      expect(w.figures.placeTimeZone).toBe('Europe/London');
    }
  });

  it('temperatureUnit round-trips PATCH /me to GET /widgets', async () => {
    const u = await h.asUser('ww-unit@example.com');
    expect((await u.patch('/me', { temperatureUnit: 'F' })).status).toBe(200);
    expect((await j(await u.get('/widgets'))).temperatureUnit).toBe('F');
    await h.db.update(users).set({ temperatureUnit: 'C' }).where(eq(users.id, u.userId));
  });
});

describe('inline first reading', () => {
  let h: Harness;
  const lines: LogEvent[] = [];
  const at = (i: number) => ({ ...PLACE, name: `P${i}`, lat: 10 + i, lon: 20 });

  beforeAll(async () => {
    h = await startHarness(undefined, { logger: { log: (e) => void lines.push(e) } });
    await setGlobalFlag(h.db, 'widgets.weather', true);
  }, 120_000);
  afterAll(async () => {
    await h.close();
  });

  // T088
  it('the eleventh place change in a minute makes no forecast call and still answers 200', async () => {
    h.clock.set(NOW);
    h.weatherFake.calls.forecast = 0;
    const u = await h.asUser('ww-limit@example.com');
    const created = await u.post('/widgets', { kind: 'weather', settings: {}, place: at(0) });
    expect(created.status).toBe(201);
    const id = (await j(created)).widget.id;
    for (let i = 1; i < 10; i++) {
      expect((await u.patch(`/widgets/${id}`, { place: at(i) })).status).toBe(200);
    }
    expect(h.weatherFake.calls.forecast).toBe(10);
    expect((await u.patch(`/widgets/${id}`, { place: at(10) })).status).toBe(200);
    expect(h.weatherFake.calls.forecast).toBe(10);
  });

  // T089
  it('a failing readings upsert is logged as widget_first_reading_failed and the request still succeeds', async () => {
    h.clock.set(new Date(NOW.getTime() + 3_600_000)); // fresh limiter window
    await h.db.execute(sql`
      CREATE OR REPLACE FUNCTION wr_boom() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'upsert boom'; END $$ LANGUAGE plpgsql`);
    await h.db.execute(
      sql`CREATE TRIGGER wr_boom BEFORE INSERT ON weather_readings FOR EACH ROW EXECUTE FUNCTION wr_boom()`,
    );
    try {
      const u = await h.asUser('ww-log@example.com');
      const res = await u.post('/widgets', { kind: 'weather', settings: {}, place: at(50) });
      expect(res.status).toBe(201);
      expect(lines.filter((e) => e['event'] === 'widget_first_reading_failed')).toHaveLength(1);
    } finally {
      await h.db.execute(sql`DROP TRIGGER wr_boom ON weather_readings`);
    }
  });
});
