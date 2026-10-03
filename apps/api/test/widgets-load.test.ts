import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { sql } from 'drizzle-orm';
import { fxRates, setGlobalFlag } from '@desk/db';
import { startHarness, type Harness } from './harness.js';

// T061 (SC-003, server half): a full strip of eight widgets answers GET /widgets from cached rates
// and weather readings alone, well inside the load budget. No network: everything is seeded.

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
const CODES = ['EUR', 'USD', 'JPY', 'CHF', 'CAD', 'AUD'];
const BUDGET_MS = 150;

describe('widgets load (SC-003)', () => {
  let h: Harness;

  beforeAll(async () => {
    h = await startHarness();
    for (const k of ['currency', 'weather', 'sunrise', 'spend_pace', 'fixed_costs']) {
      await setGlobalFlag(h.db, `widgets.${k}`, true);
    }
    h.clock.set(NOW);
    // 31 weekdays of cached rates per pair (default currency GBP).
    for (const base of CODES) {
      for (let d = 0; d < 31; d++) {
        const rateDate = new Date(NOW.getTime() - d * 86_400_000).toISOString().slice(0, 10);
        await h.db.insert(fxRates).values({
          rateDate,
          base,
          quote: 'GBP',
          rate: (0.5 + d / 1000).toFixed(6),
          source: 'frankfurter',
        });
      }
    }
    const f = await h.weatherFake.forecast(PLACE.lat, PLACE.lon, PLACE.timeZone);
    await h.db.execute(sql`
      INSERT INTO weather_readings (lat, lon, time_zone, current, daily, fetched_at, last_active_at)
      VALUES (${PLACE.lat}, ${PLACE.lon}, ${PLACE.timeZone}, ${JSON.stringify(f.current)}::jsonb,
        ${JSON.stringify(f.daily)}::jsonb, ${NOW.toISOString()}, ${NOW.toISOString()})`);
  }, 120_000);

  afterAll(async () => {
    await h.close();
  });

  it('eight cached widgets answer GET /widgets in under 150 ms (median of 5) and stay private', async () => {
    const a = await h.asUser('wl-a@example.com');
    const make = async (body: object) => expect((await a.post('/widgets', body)).status).toBe(201);
    await make({ kind: 'currency', settings: { currencies: CODES } });
    await make({ kind: 'currency', settings: { currencies: CODES } });
    await make({ kind: 'weather', settings: {}, place: PLACE });
    await make({ kind: 'sunrise', settings: {}, place: PLACE });
    await make({ kind: 'spend_pace' });
    await make({ kind: 'fixed_costs' });
    await make({ kind: 'currency', settings: { currencies: ['EUR', 'USD'] } });
    await make({ kind: 'currency', settings: { currencies: ['JPY'] } });

    await a.get('/widgets'); // warm up
    const times: number[] = [];
    for (let i = 0; i < 5; i++) {
      const t0 = performance.now();
      const res = await a.get('/widgets');
      times.push(performance.now() - t0);
      expect(res.status).toBe(200);
      expect((await j(res)).widgets).toHaveLength(8);
    }
    times.sort((x, y) => x - y);
    expect(times[2]).toBeLessThan(BUDGET_MS);

    const b = await h.asUser('wl-b@example.com');
    expect((await j(await b.get('/widgets'))).widgets).toEqual([]);
  });
});
