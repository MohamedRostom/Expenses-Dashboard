import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { categories, expenses, setGlobalFlag, users } from '@desk/db';
import { startHarness, type Harness } from './harness.js';

// T055 / T059: spend pace, fixed costs and sunrise figures (spec 003 US4).

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function j(res: Response): Promise<any> {
  return res.json();
}

const NOW = new Date('2026-09-15T12:00:00Z'); // 16 days left in a 30-day month
const PLACE = {
  name: 'Manchester',
  admin1: 'England',
  country: 'United Kingdom',
  lat: 53.48,
  lon: -2.24,
  timeZone: 'Europe/London',
};

describe('expense and sunrise widgets', () => {
  let h: Harness;
  type U = Awaited<ReturnType<Harness['asUser']>>;

  async function user(email: string, timeZone = 'Europe/London') {
    const u = await h.asUser(email);
    await h.db.update(users).set({ timeZone }).where(eq(users.id, u.userId));
    return u;
  }
  const cat = async (
    userId: string,
    name: string,
    v: { budgetMinor?: number | null; defaultKind?: 'fixed' | 'variable' | null },
  ) =>
    (
      await h.db
        .insert(categories)
        .values({ userId, name, colour: '#000000', ...v })
        .returning()
    )[0]!;
  const spend = (userId: string, categoryId: string, date: string, amount: number) =>
    h.db.insert(expenses).values({
      id: crypto.randomUUID(),
      userId,
      categoryId,
      description: 'x',
      expenseDate: date,
      paidWith: 'card',
      kind: 'variable',
      amountOriginal: amount,
      currencyOriginal: 'GBP',
      rateToDefault: '1',
      rateDate: date,
      rateSource: 'none',
      amountDefault: amount,
      addedVia: 'dashboard',
    });
  async function widget(u: U, kind: string, extra: object = {}) {
    const res = await u.post('/widgets', { kind, settings: {}, ...extra });
    expect(res.status).toBe(201);
  }
  async function figures(u: U, kind: string) {
    return (await j(await u.get('/widgets'))).widgets.find(
      (w: { kind: string }) => w.kind === kind,
    );
  }
  async function seedReading(opts: { polar?: 'day' | 'night' } = {}) {
    h.weatherFake.usePolar(opts.polar ?? null);
    const f = await h.weatherFake.forecast(PLACE.lat, PLACE.lon, PLACE.timeZone);
    h.weatherFake.usePolar(null);
    await h.db.execute(sql`
      INSERT INTO weather_readings (lat, lon, time_zone, current, daily, fetched_at, last_active_at)
      VALUES (${PLACE.lat}, ${PLACE.lon}, ${PLACE.timeZone}, ${JSON.stringify(f.current)}::jsonb,
        ${JSON.stringify(f.daily)}::jsonb, ${NOW.toISOString()}, ${NOW.toISOString()})
      ON CONFLICT (lat, lon) DO UPDATE SET current = EXCLUDED.current, daily = EXCLUDED.daily,
        fetched_at = EXCLUDED.fetched_at, error = NULL`);
    return f;
  }

  beforeAll(async () => {
    h = await startHarness();
    for (const k of ['weather', 'sunrise', 'spend_pace', 'fixed_costs'])
      await setGlobalFlag(h.db, `widgets.${k}`, true);
  }, 120_000);
  afterAll(async () => {
    await h.close();
  });
  beforeEach(async () => {
    h.clock.set(NOW);
    await h.db.execute(sql`DELETE FROM weather_readings`);
  });

  it('spend pace spentMinor equals the /summary/month tiles value', async () => {
    const u = await user('we-pace@example.com');
    const rent = await cat(u.userId, 'Rent', { budgetMinor: 100000, defaultKind: 'fixed' });
    const food = await cat(u.userId, 'Food', { budgetMinor: 50000 });
    await spend(u.userId, rent.id, '2026-09-01', 60000);
    await spend(u.userId, food.id, '2026-09-05', 15000);
    await spend(u.userId, food.id, '2026-08-20', 99999); // other month
    await widget(u, 'spend_pace');
    const w = await figures(u, 'spend_pace');
    const month = await j(await u.get('/summary/month?month=2026-09'));
    expect(w.state).toBe('ready');
    expect(w.figures.spentMinor).toBe(month.spent);
    expect(w.figures).toEqual({
      spentMinor: 75000,
      budgetMinor: 150000,
      pct: 50,
      daysLeft: 16,
      dailyToBudgetMinor: Math.floor(75000 / 16),
      overBudget: false,
    });
    expect(w.asOf).toBe(NOW.toISOString());
  });

  it('spend pace with no budget is empty but still carries the spend so far', async () => {
    const u = await user('we-nobudget@example.com');
    const food = await cat(u.userId, 'Food', { budgetMinor: null });
    await spend(u.userId, food.id, '2026-09-05', 15000);
    await widget(u, 'spend_pace');
    const w = await figures(u, 'spend_pace');
    expect(w.state).toBe('empty');
    expect(w.figures).toMatchObject({ spentMinor: 15000, budgetMinor: null, pct: null });
  });

  it('fixed costs lists only unrecorded fixed categories with their usual basis', async () => {
    const u = await user('we-fixed@example.com');
    const rent = await cat(u.userId, 'Rent', { defaultKind: 'fixed' });
    const net = await cat(u.userId, 'Internet', { budgetMinor: 3000, defaultKind: 'fixed' });
    await cat(u.userId, 'Food', { defaultKind: 'variable' });
    await spend(u.userId, rent.id, '2026-09-01', 90000);
    await widget(u, 'fixed_costs');
    const w = await figures(u, 'fixed_costs');
    expect(w.state).toBe('ready');
    expect(w.figures).toEqual({
      remaining: [{ categoryId: net.id, name: 'Internet', usualMinor: 3000, usualBasis: 'budget' }],
      totalExpectedMinor: 3000,
      allRecorded: false,
    });
  });

  it('a fixed category with no history has usualMinor null; previous month gives "previous"', async () => {
    const u = await user('we-fixed2@example.com');
    const a = await cat(u.userId, 'Gym', { defaultKind: 'fixed' });
    const b = await cat(u.userId, 'Phone', { defaultKind: 'fixed' });
    await spend(u.userId, b.id, '2026-08-10', 2500);
    await widget(u, 'fixed_costs');
    const w = await figures(u, 'fixed_costs');
    expect(w.figures.remaining).toEqual(
      expect.arrayContaining([
        { categoryId: a.id, name: 'Gym', usualMinor: null, usualBasis: 'none' },
        { categoryId: b.id, name: 'Phone', usualMinor: 2500, usualBasis: 'previous' },
      ]),
    );
    expect(w.figures.totalExpectedMinor).toBe(2500);
  });

  it('fixed costs with every fixed category recorded is allRecorded; none at all is empty', async () => {
    const u = await user('we-fixed3@example.com');
    const rent = await cat(u.userId, 'Rent', { defaultKind: 'fixed' });
    await spend(u.userId, rent.id, '2026-09-01', 90000);
    await widget(u, 'fixed_costs');
    expect((await figures(u, 'fixed_costs')).figures).toMatchObject({
      remaining: [],
      allRecorded: true,
    });
    const v = await user('we-fixed4@example.com');
    await cat(v.userId, 'Food', { defaultKind: 'variable' });
    await widget(v, 'fixed_costs');
    expect((await figures(v, 'fixed_costs')).state).toBe('empty');
  });

  it('adding an expense changes both widgets on the next GET, with no weather call', async () => {
    const u = await user('we-live@example.com');
    const net = await cat(u.userId, 'Internet', { budgetMinor: 3000, defaultKind: 'fixed' });
    await widget(u, 'spend_pace');
    await widget(u, 'fixed_costs');
    const calls = { ...h.weatherFake.calls };
    expect((await figures(u, 'spend_pace')).figures.spentMinor).toBe(0);
    expect((await figures(u, 'fixed_costs')).figures.allRecorded).toBe(false);
    await spend(u.userId, net.id, '2026-09-14', 3000);
    expect((await figures(u, 'spend_pace')).figures.spentMinor).toBe(3000);
    expect((await figures(u, 'fixed_costs')).figures.allRecorded).toBe(true);
    expect(h.weatherFake.calls).toEqual(calls);
  });

  it('sunrise figures come from daily[0]; showZone only when the zones differ', async () => {
    const f = await seedReading();
    const utc = await user('we-sun-utc@example.com', 'UTC');
    await widget(utc, 'sunrise', { place: PLACE });
    const w = await figures(utc, 'sunrise');
    expect(w.state).toBe('ready');
    expect(w.figures).toMatchObject({
      place: 'Manchester',
      sunrise: f.daily[0]!.sunrise,
      sunset: f.daily[0]!.sunset,
      daylightSeconds: f.daily[0]!.daylightSeconds,
      placeTimeZone: 'Europe/London',
      showZone: true,
      attribution: 'Weather data by Open-Meteo.com',
    });
    expect(w.figures.polar).toBeUndefined();
    const same = await user('we-sun-same@example.com', 'Europe/London');
    await widget(same, 'sunrise', { place: PLACE });
    expect((await figures(same, 'sunrise')).figures.showZone).toBe(false);
  });

  it('polar day: polar day, no times, 24 h, still ready', async () => {
    await seedReading({ polar: 'day' });
    const u = await user('we-polar@example.com');
    await widget(u, 'sunrise', { place: PLACE });
    const w = await figures(u, 'sunrise');
    expect(w.state).toBe('ready');
    expect(w.figures).toMatchObject({
      polar: 'day',
      sunrise: null,
      sunset: null,
      daylightSeconds: 86400,
    });
  });

  it('polar night: polar night, zero daylight', async () => {
    await seedReading({ polar: 'night' });
    const u = await user('we-polarn@example.com');
    await widget(u, 'sunrise', { place: PLACE });
    expect((await figures(u, 'sunrise')).figures).toMatchObject({
      polar: 'night',
      daylightSeconds: 0,
    });
  });

  it('removing the weather widget keeps the place while the sunrise widget references it (regression)', async () => {
    await seedReading();
    const u = await user('we-keep@example.com');
    await widget(u, 'weather', { place: PLACE });
    await widget(u, 'sunrise');
    const wx = await figures(u, 'weather');
    expect((await u.delete(`/widgets/${wx.id}`)).status).toBe(204);
    expect((await figures(u, 'sunrise')).figures.place).toBe('Manchester');
  });
});
