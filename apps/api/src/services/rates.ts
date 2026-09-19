import { and, desc, eq, gte, lte } from 'drizzle-orm';
import { fxRates, type Db } from '@desk/db';
import type { RatesProvider, RateOutcome } from '@desk/connectors/rates';

/** Mirrors expenses.ts's MAX_RATE_DATE_GAP_DAYS: frankfurter.app only ever answers with a prior
 * published date (weekends/holidays fall back to the last trading day), so a cache row from up
 * to a week earlier is still the right answer for a non-trading requested date — an exact-date
 * lookup misses every single one of those and re-hits the provider needlessly. */
const MAX_CACHE_LOOKBACK_DAYS = 7;

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
        return { rate: cached.rate, rateDate: cached.rateDate, source: cached.source };
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
