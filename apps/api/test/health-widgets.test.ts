import { sql } from 'drizzle-orm';
import { emitSourceSummary, recordSourceCall } from '../src/services/source-usage.js';
import type { Logger, LogEvent } from '../src/adapters/logger.js';
import { startHarness, type Harness } from './harness.js';

const PAUSE_KEY = 'widgets.weather_paused_until';

describe('GET /healthz/widgets (FR-019)', () => {
  let harness: Harness;
  const events: LogEvent[] = [];
  const stub: Logger = { log: (e) => void events.push(e) };
  const t0 = new Date('2026-09-18T10:00:00Z');

  beforeAll(async () => {
    harness = await startHarness();
  });
  afterAll(async () => {
    await harness.close();
  });
  beforeEach(async () => {
    events.length = 0;
    await harness.db.execute(sql`DELETE FROM widget_source_usage`);
    await harness.db.execute(sql`DELETE FROM widget_source_state`);
    await harness.db.execute(sql`DELETE FROM weather_readings`);
    await setPause(null);
  });

  async function setPause(value: string | null) {
    await harness.db.execute(sql`
      INSERT INTO flags (key, description, default_on, value)
      VALUES (${PAUSE_KEY}, 'test', false, ${value === null ? null : JSON.stringify(value)}::jsonb)
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`);
  }
  async function probe() {
    const res = await harness.app.request('/healthz/widgets');
    return { status: res.status, body: await res.json() };
  }
  const fail = (at = t0) => recordSourceCall(harness.db, 'open-meteo', false, at, stub);
  const ok = (at = t0) => recordSourceCall(harness.db, 'open-meteo', true, at, stub);

  it('is 200 { status: ok } with no other key and no session', async () => {
    expect(await probe()).toEqual({ status: 200, body: { status: 'ok' } });
  });

  it('is 503 degraded while weather_paused_until is in the future', async () => {
    harness.clock.set(t0);
    await setPause('2026-09-18T12:00:00.000Z');
    expect(await probe()).toEqual({ status: 503, body: { status: 'degraded' } });
  });

  it('is 200 after two failures and 503 after the third, even a day later', async () => {
    harness.clock.set(t0);
    await fail();
    await fail();
    expect((await probe()).status).toBe(200);
    await fail();
    expect((await probe()).status).toBe(503);
    harness.clock.set(new Date('2026-09-19T10:00:00Z'));
    expect((await probe()).status).toBe(503);
  });

  it('recovers with one success', async () => {
    harness.clock.set(t0);
    await fail();
    await fail();
    await fail();
    await ok();
    expect((await probe()).status).toBe(200);
  });

  it('counts calls and failures per UTC day and logs one call line each', async () => {
    await ok();
    await fail();
    await fail();
    await fail();
    const rows = (await harness.db.execute(
      sql`SELECT calls, failures FROM widget_source_usage WHERE source = 'open-meteo' AND day = '2026-09-18'`,
    )) as unknown as { calls: number; failures: number }[];
    expect(rows[0]).toEqual({ calls: 4, failures: 3 });
    const calls = events.filter((e) => e.event === 'widget_source_call');
    expect(calls).toHaveLength(4);
    expect(calls[0]).toMatchObject({ source: 'open-meteo', outcome: 'ok' });
    expect(calls[3]).toMatchObject({ outcome: 'failure', cause: 'failing' });
    expect(calls[1]?.cause).toBeUndefined();
  });

  it('summary lines carry counts and no user id or place', async () => {
    await ok();
    await fail();
    await harness.db.execute(sql`
      INSERT INTO weather_readings (lat, lon, time_zone) VALUES (51.51, -0.13, 'Europe/London')`);
    events.length = 0;
    await emitSourceSummary(harness.db, stub, t0);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      event: 'widget_source_summary',
      source: 'open-meteo',
      calls: 2,
      failures: 1,
      consecutiveFailures: 1,
      cachedPlaces: 1,
      hashedUserId: null,
    });
    const line = JSON.stringify(events[0]);
    expect(line).not.toMatch(/51\.51|-0\.13|London|userId/);
  });
});
