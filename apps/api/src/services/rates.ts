import { and, desc, eq, gte, lte } from 'drizzle-orm';
import { fxRates, type Db } from '@desk/db';
import type { RatesProvider, RateOutcome } from '@desk/connectors/rates';

/** Mirrors expenses.ts's MAX_RATE_DATE_GAP_DAYS: frankfurter.app only ever answers with a prior
 * published date (weekends/holidays fall back to the last trading day), so a cache row from up
 * to a week earlier is still the right answer for a non-trading requested date — an exact-date
 * lookup misses every single one of those and re-hits the provider needlessly. */
const MAX_CACHE_LOOKBACK_DAYS = 7;

/** A row for its own date is never rewritten (inserts are ON CONFLICT DO NOTHING, nothing updates
 * or deletes fx_rates), so an exact-date hit is kept in memory per Db. A fallback hit (Saturday
 * answered with Friday) is not: a closer row can still arrive.
 * ponytail: cleared whole at MAX_MEMO entries, an LRU if a process ever needs more pairs × dates. */
const MAX_MEMO = 10_000;
const memoByDb = new WeakMap<Db, Map<string, RateOutcome>>();

export type RatesService = {
  /** Cache-through lookup: same-currency shortcut, then fx_rates, then the provider on a miss. */
  getRate(date: string, from: string, to: string): Promise<RateOutcome>;
};

/** fx_rates cache wrapper around a RatesProvider (research.md R6). Keyed by rate_date+base+quote,
 * shared by all users. `db` is a plain Drizzle instance — no extra port needed, packages/db is
 * already a real dependency of apps/api. */
export function createRatesService(db: Db, provider: RatesProvider): RatesService {
  return {
    async getRate(date, from, to) {
      // data-model.md: when currency_original = default_currency the rate is 1 and
      // rate_date = expense_date — no cache row, no provider call.
      if (from === to) {
        return { rate: '1', rateDate: date, source: 'none' };
      }

      let memo = memoByDb.get(db);
      if (!memo) memoByDb.set(db, (memo = new Map()));
      const memoKey = `${date}|${from}|${to}`;
      const remembered = memo.get(memoKey);
      if (remembered) return remembered;

      const lookbackFrom = new Date(date);
      lookbackFrom.setUTCDate(lookbackFrom.getUTCDate() - MAX_CACHE_LOOKBACK_DAYS);
      const [cached] = await db
        .select()
        .from(fxRates)
        .where(
          and(
            lte(fxRates.rateDate, date),
            gte(fxRates.rateDate, lookbackFrom.toISOString().slice(0, 10)),
            eq(fxRates.base, from),
            eq(fxRates.quote, to),
          ),
        )
        .orderBy(desc(fxRates.rateDate))
        .limit(1);
      if (cached) {
        const outcome = { rate: cached.rate, rateDate: cached.rateDate, source: cached.source };
        if (cached.rateDate === date) {
          if (memo.size >= MAX_MEMO) memo.clear();
          memo.set(memoKey, outcome);
        }
        return outcome;
      }

      const outcome = await provider.rate(date, from, to);
      if ('unsupported' in outcome) return outcome;

      await db
        .insert(fxRates)
        .values({
          rateDate: outcome.rateDate,
          base: from,
          quote: to,
          rate: outcome.rate,
          source: outcome.source,
        })
        .onConflictDoNothing();

      return outcome;
    },
  };
}
