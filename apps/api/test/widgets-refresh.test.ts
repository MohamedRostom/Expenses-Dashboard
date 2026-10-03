import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { sql } from 'drizzle-orm';
import { setGlobalFlag } from '@desk/db';
import { startHarness, type Harness } from './harness.js';

// T067: POST /widgets/refresh marks the caller's weather readings due.

const LONDON = {
  name: 'London',
  admin1: 'England',
  country: 'United Kingdom',
  lat: 51.51,
  lon: -0.13,
  timeZone: 'Europe/London',
};
const PARIS = {
  name: 'Paris',
  admin1: null,
  country: 'France',
  lat: 48.86,
  lon: 2.35,
  timeZone: 'Europe/Paris',
};

describe('POST /widgets/refresh', () => {
  let h: Harness;

  beforeAll(async () => {
    h = await startHarness();
    await setGlobalFlag(h.db, 'widgets.weather', true);
    await setGlobalFlag(h.db, 'widgets.sunrise', true);
  }, 120_000);

  afterAll(async () => {
    await h.close();
  });

  const seedReading = (lat: string, lon: string) =>
    h.db.execute(sql`
      INSERT INTO weather_readings (lat, lon, time_zone, fetched_at)
      VALUES (${lat}, ${lon}, 'UTC', now() - interval '10 minutes')
      ON CONFLICT (lat, lon) DO UPDATE SET fetched_at = excluded.fetched_at`);
  const fetchedAgo = async (lat: string, lon: string) =>
    Number(
      (
        (await h.db.execute(
          sql`SELECT extract(epoch FROM now() - fetched_at) AS s FROM weather_readings WHERE lat = ${lat} AND lon = ${lon}`,
        )) as unknown as { s: string }[]
      )[0]!.s,
    );

  it('queues the readings behind the caller places, marks only those due, and is limited to 1/min', async () => {
    const a = await h.asUser('refresh-a@example.com');
    const b = await h.asUser('refresh-b@example.com');
    await a.post('/widgets', { kind: 'weather', place: LONDON });
    await a.post('/widgets', { kind: 'sunrise', place: LONDON }); // same place: counted once
    await b.post('/widgets', { kind: 'weather', place: PARIS });
    await seedReading('51.51', '-0.13');
    await seedReading('48.86', '2.35');

    const res = await a.post('/widgets/refresh');
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ queued: 1 });
    expect(await fetchedAgo('51.51', '-0.13')).toBeGreaterThan(3600);
    expect(await fetchedAgo('48.86', '2.35')).toBeLessThan(3600);

    const again = await a.post('/widgets/refresh');
    expect(again.status).toBe(429);
    expect(((await again.json()) as { error: { code: string } }).error.code).toBe('rate_limited');
  });

  it('answers queued 0 when the caller has no readings', async () => {
    const u = await h.asUser('refresh-none@example.com');
    const res = await u.post('/widgets/refresh');
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ queued: 0 });
  });
});
