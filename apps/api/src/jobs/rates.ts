// T043: rates.warm prefetches today's rate for every (base,quote) pair seen in fx_rates over the
// last 90 days; rates.retry re-attempts conversions that came back `unsupported`. Both are
// no-op-safe today (empty fx_rates, no expenses table to hold unresolved conversions) but the
// real mechanism runs — see report for the wiring gap on retry.
import { gte } from 'drizzle-orm';
import { fxRates, type Db } from '@desk/db';
import type { RatesProvider } from '@desk/connectors/rates';
import type { JobHandler } from './index.js';
import { enqueueIfShort, widgetPairs } from './widgets-rates-backfill.js';

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

const HOUR_MS = 60 * 60 * 1000;

type Enqueue = (name: string, payload: unknown, opts?: { runAfter?: Date }) => Promise<string>;

/** Hourly: warms today's rate for every recent pair, then queues its own next run (+1 hour), so
 * rates never freeze while the app runs. A failing pair is logged and skipped, never rethrown: a
 * runner retry on top of the queued successor would fork the chain. */
export function ratesWarmJob(
  db: Db,
  provider: RatesProvider,
  clock: { now(): Date } = { now: () => new Date() },
  enqueue?: Enqueue,
): JobHandler {
  return async (_payload, ctx) => {
    try {
      await warm(db, provider, clock, ctx);
    } finally {
      await enqueue?.('rates.warm', {}, { runAfter: new Date(clock.now().getTime() + HOUR_MS) });
    }
  };
}

async function warm(
  db: Db,
  provider: RatesProvider,
  clock: { now(): Date },
  ctx: Parameters<JobHandler>[1],
): Promise<void> {
  {
    const cutoff = new Date(clock.now().getTime() - NINETY_DAYS_MS).toISOString().slice(0, 10);
    const pairs = await db
      .selectDistinct({ base: fxRates.base, quote: fxRates.quote })
      .from(fxRates)
      .where(gte(fxRates.rateDate, cutoff));

    const today = clock.now().toISOString().slice(0, 10);
    // Daily retry for widget pairs whose history is still short (research R12): at most one
    // queued backfill per pair across all users. Runs before the warm loop so one failing pair
    // cannot starve it.
    for (const { base, quote } of await widgetPairs(db)) {
      await enqueueIfShort(db, [base], quote, today);
    }

    let done = 0;
    await ctx.updateProgress(done, pairs.length);

    for (const { base, quote } of pairs) {
      try {
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
      } catch (e) {
        console.error(`rates.warm ${base}:${quote} failed`, e instanceof Error ? e.message : e);
      }
      done += 1;
      await ctx.updateProgress(done, pairs.length);
    }
  }
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
