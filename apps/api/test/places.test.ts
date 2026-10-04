import { sql } from 'drizzle-orm';
import type { LogEvent } from '../src/adapters/logger.js';
import { startHarness, type Harness } from './harness.js';
import { pauseWeatherUntil, weatherPausedUntil } from '../src/services/source-usage.js';

type Cand = { name: string; admin1: string | null; country: string; lat: number; lon: number };

describe('places API (T034)', () => {
  let h: Harness;
  const lines: LogEvent[] = [];
  const callLines = () => lines.filter((e) => e.event === 'widget_source_call');
  const t0 = new Date('2026-09-18T10:00:00Z');

  beforeAll(async () => {
    h = await startHarness(undefined, { logger: { log: (e) => void lines.push(e) } });
  });
  afterAll(async () => {
    await h.close();
  });
  beforeEach(async () => {
    h.clock.set(t0);
    lines.length = 0;
    h.weatherFake.calls.search = 0;
    h.weatherFake.calls.forecast = 0;
    await h.db.execute(sql`DELETE FROM geocode_cache`);
    await h.db.execute(sql`DELETE FROM widget_source_usage`);
    await h.db.execute(sql`DELETE FROM audit_log WHERE action = 'place.device_location_used'`);
    await h.db.execute(sql`DELETE FROM places`);
    await h.db.execute(sql`DELETE FROM flags WHERE key = 'widgets.weather_paused_until'`);
  });

  const usage = async (source: string) =>
    (
      (await h.db.execute(
        sql`SELECT coalesce(sum(calls), 0)::int AS n FROM widget_source_usage WHERE source = ${source}`,
      )) as unknown as { n: number }[]
    )[0]!.n;

  it('rejects a query under three characters with 422', async () => {
    const a = await h.asUser('ps-short@test');
    expect((await a.get('/places/search?q=Ma')).status).toBe(422);
  });

  it('requires a session', async () => {
    expect((await h.app.request('/places/search?q=Manch')).status).toBe(401);
    const csrf = { cookie: '__Host-desk_csrf=t', 'x-csrf-token': 't' };
    const res = await h.app.request('/places/resolve', {
      method: 'POST',
      headers: csrf,
      body: '{}',
    });
    expect(res.status).toBe(401);
  });

  it('returns both homonyms and counts one open_meteo.search call', async () => {
    const a = await h.asUser('ps-a@test');
    const res = await a.get('/places/search?q=Manch');
    expect(res.status).toBe(200);
    const { candidates } = (await res.json()) as { candidates: Cand[] };
    expect(candidates.map((c) => c.admin1).sort()).toEqual(['England', 'New Hampshire']);
    expect(candidates.every((c) => c.country)).toBe(true);
    expect(await usage('open_meteo.search')).toBe(1);
    expect(callLines()).toHaveLength(1);
    expect(callLines()[0]).toMatchObject({ source: 'open_meteo.search', outcome: 'ok' });
    expect(JSON.stringify(callLines())).not.toMatch(/Manch|userId|ps-a@test/);
  });

  it('a 429 on search logs one failure line with cause limit_reached', async () => {
    const a = await h.asUser('ps-429@test');
    h.weatherFake.pauseSource(60_000);
    try {
      expect((await a.get('/places/search?q=Lond')).status).toBe(503);
    } finally {
      h.weatherFake.pauseSource(0);
    }
    expect(callLines()).toHaveLength(1);
    expect(callLines()[0]).toMatchObject({ outcome: 'failure', cause: 'limit_reached' });
  });

  it('serves a second user from geocode_cache without a source call', async () => {
    const a = await h.asUser('ps-c1@test');
    const b = await h.asUser('ps-c2@test');
    await a.get('/places/search?q=Manch');
    const res = await b.get('/places/search?q=%20MANCH%20');
    expect(((await res.json()) as { candidates: Cand[] }).candidates).toHaveLength(2);
    expect(h.weatherFake.calls.search).toBe(1);
    expect(await usage('open_meteo.search')).toBe(1);
  });

  it('refetches a cache row older than 24 hours', async () => {
    const a = await h.asUser('ps-old@test');
    await a.get('/places/search?q=Manch');
    await h.db.execute(
      sql`UPDATE geocode_cache SET fetched_at = ${new Date(t0.getTime() - 25 * 3600_000).toISOString()}`,
    );
    await a.get('/places/search?q=Manch');
    expect(h.weatherFake.calls.search).toBe(2);
  });

  it('answers 429 rate_limited on the eleventh search in a minute', async () => {
    const a = await h.asUser('ps-rl@test');
    for (let i = 0; i < 10; i++) expect((await a.get('/places/search?q=Manch')).status).toBe(200);
    const res = await a.get('/places/search?q=Manch');
    expect(res.status).toBe(429);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('rate_limited');
  });

  it('answers 503 source_paused while the pause flag is in the future', async () => {
    const a = await h.asUser('ps-pause@test');
    await pauseWeatherUntil(h.db, new Date(t0.getTime() + 3600_000));
    const res = await a.get('/places/search?q=Manch');
    expect(res.status).toBe(503);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('source_paused');
    expect(h.weatherFake.calls.search).toBe(0);
  });

  it('resolve: nearest cached place within 0.05 degrees, nothing persisted, audit without coordinates', async () => {
    const a = await h.asUser('ps-res@test');
    const { candidates } = (await (await a.get('/places/search?q=Manch')).json()) as {
      candidates: Cand[];
    };
    const uk = candidates.find((c) => c.admin1 === 'England')!;
    const forecastBefore = h.weatherFake.calls.forecast;
    const res = await a.post('/places/resolve', { lat: uk.lat + 0.01, lon: uk.lon - 0.01 });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { candidates: Cand[]; approximate?: boolean };
    expect(body.candidates).toHaveLength(1);
    expect(body.candidates[0]!.admin1).toBe('England');
    expect(body.approximate).toBeFalsy();
    expect(h.weatherFake.calls.forecast).toBe(forecastBefore);
    await expectNoPlaceAndCleanAudit(a.userId);
  });

  it("resolve: matches the user's own places row", async () => {
    const a = await h.asUser('ps-own@test');
    await h.db.execute(sql`INSERT INTO places (user_id, name, admin1, country, time_zone, lat, lon)
      VALUES (${a.userId}, 'Homeville', NULL, 'UK', 'Europe/London', 51.5, -0.12)`);
    const res = await a.post('/places/resolve', { lat: 51.5, lon: -0.12 });
    const body = (await res.json()) as { candidates: Cand[] };
    expect(body.candidates[0]!.name).toBe('Homeville');
    expect(body.candidates[0]!.admin1).toBeNull();
  });

  it("never uses another user's places", async () => {
    const a = await h.asUser('ps-iso-a@test');
    const b = await h.asUser('ps-iso-b@test');
    await h.db.execute(sql`INSERT INTO places (user_id, name, admin1, country, time_zone, lat, lon)
      VALUES (${b.userId}, 'Secretville', NULL, 'UK', 'Europe/London', 10, 10)`);
    const res = await a.post('/places/resolve', { lat: 10, lon: 10 });
    const body = (await res.json()) as { candidates: Cand[]; approximate?: boolean };
    expect(body.candidates.map((c) => c.name)).not.toContain('Secretville');
    expect(body.approximate).toBe(true);
  });

  it('resolve: approximate via the zone city when nothing is near', async () => {
    const a = await h.asUser('ps-apx@test');
    h.weatherFake.addPlace({
      name: 'London',
      admin1: 'England',
      country: 'United Kingdom',
      lat: 51.51,
      lon: -0.13,
      timeZone: 'Europe/London',
    });
    // The fake resolves 'auto' to the nearest known place's zone, here London.
    const res = await a.post('/places/resolve', { lat: 51.9, lon: -0.9 });
    const body = (await res.json()) as { candidates: Cand[]; approximate?: boolean };
    expect(body.approximate).toBe(true);
    expect(body.candidates.map((c) => c.name)).toContain('London');
    expect(h.weatherFake.calls.forecast).toBe(1);
    expect(await usage('open_meteo.forecast')).toBe(1);
    expect(callLines().filter((e) => e.source === 'open_meteo.forecast')).toHaveLength(1);
    await expectNoPlaceAndCleanAudit(a.userId);
  });

  it('limits resolve to 10 per minute per user', async () => {
    const a = await h.asUser('ps-rrl@test');
    for (let i = 0; i < 10; i++) {
      expect((await a.post('/places/resolve', { lat: 51.9, lon: -0.9 })).status).toBe(200);
    }
    expect((await a.post('/places/resolve', { lat: 51.9, lon: -0.9 })).status).toBe(429);
  });

  it('weatherPausedUntil returns the date only while in the future', async () => {
    expect(await weatherPausedUntil(h.db, t0)).toBeNull();
    const until = new Date(t0.getTime() + 60_000);
    await pauseWeatherUntil(h.db, until);
    expect(await weatherPausedUntil(h.db, t0)).toEqual(until);
    expect(await weatherPausedUntil(h.db, new Date(t0.getTime() + 61_000))).toBeNull();
  });

  async function expectNoPlaceAndCleanAudit(userId: string) {
    const places = (await h.db.execute(sql`SELECT 1 FROM places`)) as unknown as unknown[];
    expect(places).toHaveLength(0);
    const rows = (await h.db.execute(
      sql`SELECT user_id, subject, details FROM audit_log WHERE action = 'place.device_location_used'`,
    )) as unknown as { user_id: string; subject: string; details: unknown }[];
    expect(rows).toHaveLength(1);
    expect(rows[0]!.user_id).toBe(userId);
    expect(rows[0]!.subject).toBe(userId);
    expect(rows[0]!.details ?? null).toBeNull();
  }
});
