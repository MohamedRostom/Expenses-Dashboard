// T043/C2: currency.change — batches of 500, budgets and expenses re-derived at the change-date
// rate, progress written per batch (research.md R7). The batching/progress/idempotency SHAPE is
// covered by currency-change.test.ts against an injected fake RowSource; categoriesRowSource and
// expensesRowSource below are the real Drizzle-backed sources.
import { and, eq, isNotNull, isNull, ne, sql } from 'drizzle-orm';
import { categories, expenses } from '@desk/db';
import { convert } from '@desk/core';
import type { JobHandler } from './index.js';
import type { Db } from '@desk/db';
import { enqueueIfShort, widgetPairs } from './widgets-rates-backfill.js';

export const BATCH_SIZE = 500;

export type ConvertibleRow = { id: string; amountMinor: number; currency: string };

export type RateLookup = (
  date: string,
  from: string,
  to: string,
) => Promise<{ rate: string } | { unsupported: true }>;

/** Abstract data source for "rows with a money amount that need re-deriving in the new default
 * currency". `fromCurrency` is the payload's old default currency — rows (like category budgets)
 * that don't carry their own currency use it as their effective `currency`. */
export interface RowSource {
  countTotal(userId: string): Promise<number>;
  fetchBatch(
    userId: string,
    offset: number,
    limit: number,
    fromCurrency: string,
  ): Promise<ConvertibleRow[]>;
  /** One write for a whole batch: every item's row converted at its own rate. */
  applyConversions(
    items: { row: ConvertibleRow; rate: string }[],
    toCurrency: string,
  ): Promise<void>;
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
  // Date and target are fixed for the run, so one lookup per currency serves every row.
  const rates = new Map<string, ReturnType<RateLookup>>();

  for (let offset = 0; offset < total; offset += BATCH_SIZE) {
    const rows = await source.fetchBatch(payload.userId, offset, BATCH_SIZE, payload.fromCurrency);
    const items: { row: ConvertibleRow; rate: string }[] = [];
    for (const row of rows) {
      let lookup = rates.get(row.currency);
      if (!lookup)
        rates.set(
          row.currency,
          (lookup = getRate(payload.changeDate, row.currency, payload.toCurrency)),
        );
      const outcome = await lookup;
      // ponytail: unresolved rate → leave the row alone, rates.retry sweeps it later.
      if (!('unsupported' in outcome)) items.push({ row, rate: outcome.rate });
      done += 1;
    }
    if (items.length > 0) await source.applyConversions(items, payload.toCurrency);
    await ctx.updateProgress(done, total);
  }
}

/** Nothing to convert — used only where a call site genuinely has no rows (e.g. tests). */
export const NULL_ROW_SOURCE: RowSource = {
  async countTotal() {
    return 0;
  },
  async fetchBatch() {
    return [];
  },
  async applyConversions() {
    // no-op
  },
};

/** T064/US3: real RowSource over `categories.budget_minor` — categories store no currency of
 * their own, so every row uses the payload's `fromCurrency` (C2: previously hardcoded to `''`,
 * which frankfurter.app silently reads as EUR). ponytail: only categories with a budget are
 * counted/converted; unbudgeted ones have nothing to do. */
export function categoriesRowSource(db: Db): RowSource {
  return {
    async countTotal(userId) {
      const rows = await db
        .select({ id: categories.id })
        .from(categories)
        .where(and(eq(categories.userId, userId), isNotNull(categories.budgetMinor)));
      return rows.length;
    },
    async fetchBatch(userId, offset, limit, fromCurrency) {
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
        currency: fromCurrency,
      }));
    },
    async applyConversions(items, toCurrency) {
      const values = items.map(({ row, rate }) => {
        const { minor } = convert(
          { minor: row.amountMinor, currency: row.currency },
          rate,
          toCurrency,
        );
        return sql`(${row.id}::uuid, ${minor}::bigint)`;
      });
      await db.execute(sql`
        UPDATE categories AS t SET budget_minor = v.budget_minor, updated_at = now()
        FROM (VALUES ${sql.join(values, sql`, `)}) AS v(id, budget_minor)
        WHERE t.id = v.id`);
    },
  };
}

/** C2: real RowSource over `expenses` — re-derives `amount_default` for every non-deleted,
 * non-rate-overridden expense (an overridden expense keeps the user's chosen rate/amount; a
 * currency change shouldn't silently discard that). Rows already in the new default currency
 * are skipped (nothing to convert; they'd hit the same-currency `rate: '1'` shortcut anyway,
 * but skipping avoids a pointless write). */
export function expensesRowSource(db: Db): RowSource {
  return {
    async countTotal(userId) {
      const rows = await db
        .select({ id: expenses.id })
        .from(expenses)
        .where(
          and(
            eq(expenses.userId, userId),
            isNull(expenses.deletedAt),
            eq(expenses.rateOverridden, false),
            ne(expenses.currencyOriginal, ''),
          ),
        );
      return rows.length;
    },
    async fetchBatch(userId, offset, limit) {
      const rows = await db
        .select()
        .from(expenses)
        .where(
          and(
            eq(expenses.userId, userId),
            isNull(expenses.deletedAt),
            eq(expenses.rateOverridden, false),
          ),
        )
        .orderBy(expenses.id)
        .offset(offset)
        .limit(limit);
      return rows.map((r) => ({
        id: r.id,
        amountMinor: r.amountOriginal,
        currency: r.currencyOriginal,
      }));
    },
    async applyConversions(items, toCurrency) {
      const values = items.map(({ row, rate }) => {
        const { minor } = convert(
          { minor: row.amountMinor, currency: row.currency },
          rate,
          toCurrency,
        );
        return sql`(${row.id}::uuid, ${minor}::bigint, ${rate}::numeric)`;
      });
      await db.execute(sql`
        UPDATE expenses AS t SET amount_default = v.amount_default, rate_to_default = v.rate,
          rate_source = 'currency-change', updated_at = now()
        FROM (VALUES ${sql.join(values, sql`, `)}) AS v(id, amount_default, rate)
        WHERE t.id = v.id`);
    },
  };
}

/** Combines any number of RowSources into one, run in order — countTotal/fetchBatch page across
 * all of them as if they were a single source (C2: a currency change touches both categories and
 * expenses, not either/or). */
export function combinedRowSource(...sources: RowSource[]): RowSource {
  // Tags each row object (by reference) with which source produced it, so applyConversions can
  // route to the right one — a plain try/catch-and-retry wouldn't work here since an UPDATE
  // against the wrong table's id just matches zero rows rather than throwing.
  const originOf = new WeakMap<ConvertibleRow, RowSource>();
  return {
    async countTotal(userId) {
      const counts = await Promise.all(sources.map((s) => s.countTotal(userId)));
      return counts.reduce((a, b) => a + b, 0);
    },
    async fetchBatch(userId, offset, limit, fromCurrency) {
      const rows: ConvertibleRow[] = [];
      let skip = offset;
      for (const source of sources) {
        if (rows.length >= limit) break;
        const sourceTotal = await source.countTotal(userId);
        if (skip >= sourceTotal) {
          skip -= sourceTotal;
          continue;
        }
        const batch = await source.fetchBatch(userId, skip, limit - rows.length, fromCurrency);
        for (const row of batch) originOf.set(row, source);
        rows.push(...batch);
        skip = 0;
      }
      return rows;
    },
    async applyConversions(items, toCurrency) {
      const bySource = new Map<RowSource, typeof items>();
      for (const item of items) {
        const source = originOf.get(item.row);
        if (!source)
          throw new Error('combinedRowSource: applyConversions called on an unknown row');
        bySource.set(source, [...(bySource.get(source) ?? []), item]);
      }
      for (const [source, group] of bySource) await source.applyConversions(group, toCurrency);
    },
  };
}

/** Registers as `currency.change`. `getRate` is RatesService['getRate'] with the same-currency
 * shortcut already handled upstream (research.md R6). */
export function currencyChangeJob(
  getRate: RateLookup,
  source: RowSource = NULL_ROW_SOURCE,
  /** With a db, widget currencies get a history backfill against the new default (FR-010). */
  db?: Db,
): JobHandler {
  return async (payload, ctx) => {
    const p = payload as CurrencyChangePayload;
    await runCurrencyChange(p, source, getRate, ctx);
    if (db) {
      const pairs = await widgetPairs(db, p.userId);
      await enqueueIfShort(
        db,
        pairs.map((x) => x.base),
        p.toCurrency,
        p.changeDate,
      );
    }
  };
}
