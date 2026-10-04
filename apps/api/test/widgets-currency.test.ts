import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { fxRates, jobs, setGlobalFlag, users } from '@desk/db';
import { FakeRates } from '@desk/connectors/rates';
import type { LogEvent } from '../src/adapters/logger.js';
import { startHarness, type Harness } from './harness.js';
import { widgetsRatesBackfillJob } from '../src/jobs/widgets-rates-backfill.js';
import { ratesWarmJob } from '../src/jobs/rates.js';
import { currencyChangeJob, NULL_ROW_SOURCE } from '../src/jobs/currency-change.js';

// T025: currency widget (spec 003 US1) — backfill job, figures builder, edge rows.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function j(res: Response): Promise<any> {
  return res.json();
}

const ctx = { updateProgress: async () => {} };
const WED = new Date('2026-09-30T12:00:00Z');
const SAT = new Date('2026-09-26T10:00:00Z');

describe('currency widget', () => {
  let h: Harness;
  const rates = new FakeRates();
  const lines: LogEvent[] = [];
  const backfill = () =>
    widgetsRatesBackfillJob(h.db, rates, h.clock, { log: (e) => void lines.push(e) });
  const callLines = () => lines.filter((e) => e.event === 'widget_source_call');

  const queued = async () =>
    (await h.db.select().from(jobs).where(eq(jobs.name, 'widgets.rates_backfill'))).map(
      (r) => r.payload as { base: string; quote: string },
    );
  const usage = async () =>
    (await h.db.execute(
      sql`SELECT COALESCE(sum(calls),0)::int AS calls, COALESCE(sum(failures),0)::int AS failures
          FROM widget_source_usage WHERE source = 'frankfurter.range'`,
    )) as unknown as { calls: number; failures: number }[];
  const seed = (rateDate: string, base: string, quote: string, rate: string) =>
    h.db.insert(fxRates).values({ rateDate, base, quote, rate, source: 'frankfurter' });
  async function seedEurGbp() {
    h.clock.set(WED);
    await backfill()({ base: 'EUR', quote: 'GBP' }, ctx);
  }
  async function setUser(email: string, patch: Partial<typeof users.$inferInsert>) {
    const u = await h.asUser(email);
    await h.db.update(users).set(patch).where(eq(users.id, u.userId));
    return u;
  }
  async function figures(u: Awaited<ReturnType<Harness['asUser']>>) {
    return (await j(await u.get('/widgets'))).widgets[0];
  }

  beforeAll(async () => {
    h = await startHarness(rates);
    await setGlobalFlag(h.db, 'widgets.currency', true);
  }, 120_000);

  afterAll(async () => {
    await h.close();
  });

  it('POST enqueues one backfill per pair and the job upserts the 31-day fixture and counts the call', async () => {
    h.clock.set(WED);
    lines.length = 0;
    const u = await h.asUser('wc-create@example.com');
    const before = (await usage())[0]!.calls;
    const res = await u.post('/widgets', { kind: 'currency', settings: { currencies: ['EUR'] } });
    expect(res.status).toBe(201);
    expect(await queued()).toEqual([
      { base: 'EUR', quote: 'GBP', key: 'widgets.rates_backfill:EUR:GBP' },
    ]);

    // a second user with the same pair does not queue a second job
    const u2 = await h.asUser('wc-create2@example.com');
    await u2.post('/widgets', { kind: 'currency', settings: { currencies: ['EUR'] } });
    expect(await queued()).toHaveLength(1);

    await backfill()({ base: 'EUR', quote: 'GBP' }, ctx);
    const rows = await h.db.select().from(fxRates).where(eq(fxRates.base, 'EUR'));
    expect(rows.length).toBeGreaterThanOrEqual(20);
    expect(rows.every((r) => r.source === 'frankfurter' && r.quote === 'GBP')).toBe(true);
    expect(rows.map((r) => r.rateDate)).not.toContain('2026-09-26'); // Saturday absent
    expect((await usage())[0]!.calls).toBe(before + 1);
    expect(callLines()).toHaveLength(1);
    expect(callLines()[0]).toMatchObject({ source: 'frankfurter.range', outcome: 'ok' });

    // history now reaches back 30 days: a further add enqueues nothing new
    await h.db.delete(jobs).where(eq(jobs.name, 'widgets.rates_backfill'));
    await u2.post('/widgets', { kind: 'currency', settings: { currencies: ['EUR', 'USD'] } });
    expect((await queued()).map((p) => p.base)).not.toContain('EUR');
  });

  it('rejects a seventh code, the default and an unsupported code naming the code', async () => {
    const u = await h.asUser('wc-422@example.com');
    for (const [codes, named] of [
      [['USD', 'EUR', 'JPY', 'CHF', 'CAD', 'AUD', 'NZD'], null],
      [['GBP'], 'GBP'],
      [['XXZ'], 'XXZ'],
    ] as const) {
      const res = await u.post('/widgets', { kind: 'currency', settings: { currencies: codes } });
      expect(res.status).toBe(422);
      if (named) expect(JSON.stringify(await j(res))).toContain(named);
    }
  });

  it('GET carries rate, rateDate, prevChange and monthChange without since for a full history', async () => {
    await seedEurGbp();
    const u = await h.asUser('wc-figures@example.com');
    await u.post('/widgets', { kind: 'currency', settings: { currencies: ['EUR'] } });
    const w = await figures(u);
    expect(w.state).toBe('ready');
    const row = w.figures.rows[0];
    expect(row).toMatchObject({ code: 'EUR', rateDate: '2026-09-30' });
    expect(typeof row.rate).toBe('number');
    expect(row.prevChange).toMatchObject({ direction: expect.stringMatching(/up|down|flat/) });
    expect(row.monthChange.since).toBeUndefined();
    expect(row.changesPending).toBeUndefined();
    expect(w.asOf).toBe('2026-09-30');
  });

  it('a short history sets monthChange.since to the first published date', async () => {
    h.clock.set(new Date('2026-09-29T12:00:00Z'));
    const u = await setUser('wc-short@example.com', { defaultCurrency: 'BGN' });
    await u.post('/widgets', { kind: 'currency', settings: { currencies: ['EUR'] } });
    await backfill()({ base: 'EUR', quote: 'BGN' }, ctx);
    const row = (await figures(u)).figures.rows[0];
    expect(row.monthChange.since).toBe('2026-09-14');
  });

  it('on a Saturday rateDate is the Friday', async () => {
    await seedEurGbp();
    h.clock.set(SAT);
    const u = await h.asUser('wc-sat@example.com');
    await u.post('/widgets', { kind: 'currency', settings: { currencies: ['EUR'] } });
    expect((await figures(u)).figures.rows[0].rateDate).toBe('2026-09-25');
  });

  it("today is the user's date at UTC+13 just after local midnight", async () => {
    await seedEurGbp();
    h.clock.set(new Date('2026-09-29T11:30:00Z')); // 2026-09-30 00:30 in Auckland, 29th in UTC
    const u = await setUser('wc-nz@example.com', { timeZone: 'Pacific/Auckland' });
    await u.post('/widgets', { kind: 'currency', settings: { currencies: ['EUR'] } });
    expect((await figures(u)).figures.rows[0].rateDate).toBe('2026-09-30');
  });

  it('matches an EUR expense created the same day (SC-001)', async () => {
    await seedEurGbp();
    const u = await h.asUser('wc-sc001@example.com');
    await u.post('/widgets', { kind: 'currency', settings: { currencies: ['EUR'] } });
    const created = await u.post('/expenses', {
      description: 'Coffee',
      amount: { minor: 500, currency: 'EUR' },
      date: '2026-09-30',
      categoryId: null,
      paidWith: 'card',
      kind: 'variable',
    });
    expect(created.status).toBe(201);
    const { expense } = await j(created);
    const row = (await figures(u)).figures.rows[0];
    expect(row.rate).toBe(Number(expense.rateToDefault));
    expect(row.rateDate).toBe(expense.rateDate);
  });

  it('a default currency switch re-bases the figures; switching to a stored code and back round-trips', async () => {
    await seedEurGbp();
    const u = await h.asUser('wc-switch@example.com');
    await u.post('/widgets', { kind: 'currency', settings: { currencies: ['EUR'] } });
    const gbp = (await figures(u)).figures.rows[0];

    await seed('2026-09-29', 'EUR', 'USD', '1.1000000000');
    await seed('2026-09-30', 'EUR', 'USD', '1.1100000000');
    expect((await u.patch('/me', { defaultCurrency: 'USD' })).status).toBe(200);
    const usd = (await figures(u)).figures.rows[0];
    expect(usd.rate).toBe(1.11);
    expect(usd.rate).not.toBe(gbp.rate);

    expect((await u.patch('/me', { defaultCurrency: 'EUR' })).status).toBe(200);
    const w = await figures(u);
    expect(w.settings).toEqual({ currencies: ['EUR'] });
    expect(w.figures.rows).toEqual([{ code: 'EUR', isDefault: true }]);

    expect((await u.patch('/me', { defaultCurrency: 'GBP' })).status).toBe(200);
    expect((await figures(u)).figures.rows[0]).toEqual(gbp);
  });

  it('currency.change enqueues a backfill for every widget currency against the new default', async () => {
    const u = await h.asUser('wc-cc@example.com');
    await u.post('/widgets', { kind: 'currency', settings: { currencies: ['EUR', 'USD'] } });
    await h.db.delete(jobs).where(eq(jobs.name, 'widgets.rates_backfill'));
    await currencyChangeJob(
      async () => ({ unsupported: true }),
      NULL_ROW_SOURCE,
      h.db,
    )({ userId: u.userId, fromCurrency: 'GBP', toCurrency: 'CHF', changeDate: '2026-09-30' }, ctx);
    expect((await queued()).map((p) => `${p.base}:${p.quote}`).sort()).toEqual([
      'EUR:CHF',
      'USD:CHF',
    ]);
  });

  it('with the range call failing the widget still works, failures are recorded and the daily warm retries', async () => {
    h.clock.set(WED);
    const u = await setUser('wc-fail@example.com', { defaultCurrency: 'JPY' });
    const u2 = await setUser('wc-fail2@example.com', { defaultCurrency: 'JPY' });
    await seed('2026-09-30', 'EUR', 'JPY', '170.0000000000');
    rates.failRange(true);
    try {
      expect(
        (await u.post('/widgets', { kind: 'currency', settings: { currencies: ['EUR'] } })).status,
      ).toBe(201);
      await u2.post('/widgets', { kind: 'currency', settings: { currencies: ['EUR'] } });
      const before = (await usage())[0]!.failures;
      for (let i = 0; i < 3; i++) {
        await backfill()({ base: 'EUR', quote: 'JPY' }, ctx); // records and exits, never throws
      }
      expect((await usage())[0]!.failures).toBe(before + 3);
      const [state] = (await h.db.execute(
        sql`SELECT consecutive_failures AS n FROM widget_source_state WHERE source = 'frankfurter.range'`,
      )) as unknown as { n: number }[];
      expect(state!.n).toBe(3);
      expect((await h.app.request('/healthz/widgets')).status).toBe(503);

      const w = await figures(u);
      expect(w.state).toBe('ready');
      expect(w.figures.rows[0]).toMatchObject({
        code: 'EUR',
        rate: 170,
        prevChange: null,
        monthChange: null,
        changesPending: true,
      });

      await h.db.delete(jobs).where(eq(jobs.name, 'widgets.rates_backfill'));
      await ratesWarmJob(h.db, rates, h.clock)({}, ctx);
      const pairs = (await queued()).map((p) => `${p.base}:${p.quote}`);
      expect(pairs.filter((p) => p === 'EUR:JPY')).toHaveLength(1); // once across both users
      expect(pairs).not.toContain('EUR:GBP'); // history reaches back 30 days
    } finally {
      rates.failRange(false);
    }
    await backfill()({ base: 'EUR', quote: 'JPY' }, ctx);
    expect((await h.app.request('/healthz/widgets')).status).toBe(200);
  });

  it('a 429 from the range call logs one failure line with cause limit_reached', async () => {
    h.clock.set(WED);
    lines.length = 0;
    rates.failRange(true, 429);
    try {
      await backfill()({ base: 'EUR', quote: 'JPY' }, ctx);
    } finally {
      rates.failRange(false);
    }
    expect(callLines()).toHaveLength(1);
    expect(callLines()[0]).toMatchObject({ outcome: 'failure', cause: 'limit_reached' });
    await backfill()({ base: 'EUR', quote: 'JPY' }, ctx); // clear the failure streak
  });

  it('a pair with no fx_rates row is an error with rate_unavailable', async () => {
    h.clock.set(WED);
    const u = await setUser('wc-none@example.com', { defaultCurrency: 'CHF' });
    await u.post('/widgets', { kind: 'currency', settings: { currencies: ['CAD'] } });
    const w = await figures(u);
    expect(w).toMatchObject({ state: 'error', cause: 'rate_unavailable' });
    expect(w.figures).toBeUndefined();
  });

  it('a code without history is a pending row; ready rows survive (T069)', async () => {
    await seedEurGbp();
    const u = await h.asUser('wc-pending@example.com');
    await u.post('/widgets', { kind: 'currency', settings: { currencies: ['EUR', 'CAD'] } });
    const w = await figures(u);
    expect(w.state).toBe('ready');
    expect(w.cause).toBeUndefined();
    expect(w.figures.rows).toHaveLength(2);
    expect(w.figures.rows[0]).toMatchObject({ code: 'EUR', rateDate: '2026-09-30' });
    expect(w.figures.rows[1]).toEqual({ code: 'CAD', pending: true });
    expect(w.asOf).toBe('2026-09-30');
  });

  it('a default-currency row plus a pending code is ready, not an error (T069)', async () => {
    h.clock.set(WED);
    const u = await setUser('wc-defpend@example.com', { defaultCurrency: 'CHF' });
    await u.post('/widgets', { kind: 'currency', settings: { currencies: ['GBP', 'CAD'] } });
    await setUser('wc-defpend@example.com', { defaultCurrency: 'GBP' });
    const w = await figures(u);
    expect(w.state).toBe('ready');
    expect(w.figures.rows).toEqual([
      { code: 'GBP', isDefault: true },
      { code: 'CAD', pending: true },
    ]);
  });

  it('batched history gives per-code rows for 1, 2 and 31 dates (T072)', async () => {
    h.clock.set(WED);
    const u = await setUser('wc-batch@example.com', { defaultCurrency: 'SEK' });
    const day = (n: number) => new Date(Date.UTC(2026, 8, 30 - n)).toISOString().slice(0, 10);
    await seed(day(0), 'USD', 'SEK', '10.0000000000');
    await seed(day(1), 'EUR', 'SEK', '11.0000000000');
    await seed(day(0), 'EUR', 'SEK', '11.5000000000');
    for (let i = 0; i < 40; i++) await seed(day(i), 'CHF', 'SEK', (12 + i / 10).toFixed(10));
    await u.post('/widgets', { kind: 'currency', settings: { currencies: ['USD', 'EUR', 'CHF'] } });
    const rows = (await figures(u)).figures.rows;
    expect(rows.map((r: { code: string }) => r.code)).toEqual(['USD', 'EUR', 'CHF']);
    expect(rows[0]).toMatchObject({ rate: 10, changesPending: true });
    expect(rows[1].changesPending).toBeUndefined();
    expect(rows[1].prevChange).toMatchObject({ pct: expect.any(Number) });
    expect(rows[2]).toMatchObject({ rate: 12, rateDate: day(0) });
    expect(rows[2].changesPending).toBeUndefined();
    // 31 newest dates only: the month change reaches back to day(30), not day(39)
    expect(rows[2].monthChange.since).toBeUndefined();
  });

  it('a rate older than the newest published date is stale', async () => {
    await seedEurGbp(); // newest published date in the table is 2026-09-30
    const u = await h.asUser('wc-stale@example.com');
    await seed('2026-09-28', 'USD', 'GBP', '0.7400000000');
    await seed('2026-09-29', 'USD', 'GBP', '0.7500000000');
    await u.post('/widgets', { kind: 'currency', settings: { currencies: ['USD'] } });
    const w = await figures(u);
    expect(w.state).toBe('stale');
    expect(w.figures.rows[0].rateDate).toBe('2026-09-29');
  });
});
