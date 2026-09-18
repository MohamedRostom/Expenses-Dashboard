// T043: currency.change — batches of 500, budgets converted once at change-date rate, progress
// written per batch (research.md R7). Phase 2 (categories) and Phase 2 (expenses) tables don't
// exist yet, so there is genuinely nothing to re-derive today — see NULL_ROW_SOURCE below. The
// batching/progress/idempotency SHAPE is real and covered by currency-change.test.ts against an
// injected fake RowSource; swapping in a Drizzle-backed RowSource later is a one-function change.
import type { JobHandler } from './index.js';
import type { Db } from '@desk/db';

export const BATCH_SIZE = 500;

export type ConvertibleRow = { id: string; amountMinor: number; currency: string };

export type RateLookup = (
  date: string,
  from: string,
  to: string,
) => Promise<{ rate: string } | { unsupported: true }>;

/** Abstract data source for "rows with a money amount that need re-deriving in the new default
 * currency" — today that's nothing (no expenses/categories tables); Phase 2 wires a real one. */
export interface RowSource {
  countTotal(userId: string): Promise<number>;
  fetchBatch(userId: string, offset: number, limit: number): Promise<ConvertibleRow[]>;
  applyConversion(row: ConvertibleRow, rate: string, toCurrency: string): Promise<void>;
}

export type CurrencyChangePayload = {
  userId: string;
  fromCurrency: string;
  toCurrency: string;
  changeDate: string;
};

/** Core batch loop: idempotent (each row is converted once per call; re-running a `done` job is
 * a no-op once the real RowSource stops returning already-converted rows), progress written after
 * every batch of BATCH_SIZE. */
export async function runCurrencyChange(
  payload: CurrencyChangePayload,
  source: RowSource,
  getRate: RateLookup,
  ctx: { updateProgress(done: number, total?: number): Promise<void> },
): Promise<void> {
  const total = await source.countTotal(payload.userId);
  let done = 0;
  await ctx.updateProgress(done, total);

  for (let offset = 0; offset < total; offset += BATCH_SIZE) {
    const rows = await source.fetchBatch(payload.userId, offset, BATCH_SIZE);
    for (const row of rows) {
      const outcome = await getRate(payload.changeDate, row.currency, payload.toCurrency);
      // ponytail: unresolved rate → leave the row alone, rates.retry sweeps it later.
      if (!('unsupported' in outcome)) {
        await source.applyConversion(row, outcome.rate, payload.toCurrency);
      }
      done += 1;
    }
    await ctx.updateProgress(done, total);
  }
}

/** Nothing to convert today: no categories/expenses tables (Phase 2 US2). */
export const NULL_ROW_SOURCE: RowSource = {
  async countTotal() {
    return 0;
  },
  async fetchBatch() {
    return [];
  },
  async applyConversion() {
    // no-op
  },
};

/** T064/US3: real RowSource over `categories.budget_minor` — the only per-user money field a
 * currency change needs to re-derive today (expenses keep their original-currency amount and
 * are re-converted lazily via their own rate lookup, not by this job). ponytail: only categories
 * with a budget are counted/converted; unbudgeted ones have nothing to do. */
export function categoriesRowSource(db: Db): RowSource {
  return {
    async countTotal(userId) {
      const { categories, and, eq, isNotNull } = await categoriesDeps();
      const rows = await db
        .select({ id: categories.id })
        .from(categories)
        .where(and(eq(categories.userId, userId), isNotNull(categories.budgetMinor)));
      return rows.length;
    },
    async fetchBatch(userId, offset, limit) {
      const { categories, and, eq, isNotNull } = await categoriesDeps();
      const rows = await db
        .select()
        .from(categories)
        .where(and(eq(categories.userId, userId), isNotNull(categories.budgetMinor)))
        .orderBy(categories.sortOrder)
        .offset(offset)
        .limit(limit);
      return rows.map((r) => ({
        id: r.id,
        amountMinor: r.budgetMinor as number,
        currency: '', // unused: categories store no per-row currency, conversion is rate-only
      }));
    },
    async applyConversion(row, rate) {
      const { categories, eq } = await categoriesDeps();
      const converted = Math.round(row.amountMinor * Number(rate));
      await db
        .update(categories)
        .set({ budgetMinor: converted, updatedAt: new Date() })
        .where(eq(categories.id, row.id));
    },
  };
}

async function categoriesDeps() {
  const { categories } = await import('@desk/db');
  const { and, eq, isNotNull } = await import('drizzle-orm');
  return { categories, and, eq, isNotNull };
}

/** Registers as `currency.change`. `getRate` is RatesService['getRate'] with the same-currency
 * shortcut already handled upstream (research.md R6). */
export function currencyChangeJob(
  getRate: RateLookup,
  source: RowSource = NULL_ROW_SOURCE,
): JobHandler {
  return async (payload, ctx) => {
    await runCurrencyChange(payload as CurrencyChangePayload, source, getRate, ctx);
  };
}
