// T043: rates.warm prefetches today's rate for every (base,quote) pair seen in fx_rates over the
// last 90 days; rates.retry re-attempts conversions that came back `unsupported`. Both are
// no-op-safe today (empty fx_rates, no expenses table to hold unresolved conversions) but the
// real mechanism runs — see report for the wiring gap on retry.
import { gte } from 'drizzle-orm';
import { fxRates, type Db } from '@desk/db';
import type { RatesProvider } from '@desk/connectors/rates';
import type { JobHandler } from './index.js';

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

export function ratesWarmJob(db: Db, provider: RatesProvider): JobHandler {
  return async (_payload, ctx) => {
    const cutoff = new Date(Date.now() - NINETY_DAYS_MS).toISOString().slice(0, 10);
    const pairs = await db
      .selectDistinct({ base: fxRates.base, quote: fxRates.quote })
      .from(fxRates)
      .where(gte(fxRates.rateDate, cutoff));

    const today = new Date().toISOString().slice(0, 10);
    let done = 0;
    await ctx.updateProgress(done, pairs.length);

    for (const { base, quote } of pairs) {
      const outcome = await provider.rate(today, base, quote);
      if (!('unsupported' in outcome)) {
        await db
          .insert(fxRates)
          .values({
            rateDate: outcome.rateDate,
            base,
            quote,
            rate: outcome.rate,
            source: outcome.source,
          })
          .onConflictDoNothing();
      }
      done += 1;
      await ctx.updateProgress(done, pairs.length);
    }
  };
}

/** ponytail: expenses table (the thing that would hold unresolved `rate_source = 'unsupported'`
 * rows) doesn't exist yet (Phase 2 US2) — nothing to retry today. Wire a real query in here once
 * it lands; the job registration and progress-reporting shape is already correct. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- kept for signature symmetry with ratesWarmJob; real query slots in later without changing call sites (Phase 2).
export function ratesRetryJob(_db: Db): JobHandler {
  return async (_payload, ctx) => {
    await ctx.updateProgress(0, 0);
  };
}
