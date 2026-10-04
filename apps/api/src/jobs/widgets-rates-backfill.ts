// T029: widgets.rates_backfill — one Frankfurter range call per (base, quote) pair, upserted into
// fx_rates (research R2). A failure is recorded in widget_source_usage/state and the job exits;
// the daily ratesWarmJob re-enqueues it while the history is short (research R12).
import { and, eq, inArray, min, sql } from 'drizzle-orm';
import { fxRates, jobs, widgets, users, type Db } from '@desk/db';
import { isUnsupported, type RatesProvider } from '@desk/connectors/rates';
import type { JobHandler } from './index.js';
import type { Logger } from '../adapters/logger.js';
import { recordSourceCall } from '../services/source-usage.js';

export const BACKFILL_JOB = 'widgets.rates_backfill';
// 35, not 31: the history must reach back 30 calendar days even when day 31 is a weekend.
const WINDOW_DAYS = 35;
const REACH_DAYS = 30;
const DAY_MS = 86_400_000;

const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** True when fx_rates for the pair has no row at or before `day - 30` (the history is short). */
export async function historyIsShort(db: Db, base: string, quote: string, day: string) {
  const [r] = await db
    .select({ first: min(fxRates.rateDate) })
    .from(fxRates)
    .where(and(eq(fxRates.base, base), eq(fxRates.quote, quote)));
  return !r?.first || r.first > isoDay(Date.parse(day) - REACH_DAYS * DAY_MS);
}

/** Queues one backfill per pair, deduped by key against queued/running jobs. Inserts straight
 * into `jobs` (as PATCH /me does for currency.change) so no runner dependency is needed. */
export async function enqueueRatesBackfill(db: Db, base: string, quote: string) {
  const key = `${BACKFILL_JOB}:${base}:${quote}`;
  const [existing] = await db
    .select({ id: jobs.id })
    .from(jobs)
    .where(
      and(
        eq(jobs.name, BACKFILL_JOB),
        inArray(jobs.status, ['queued', 'running']),
        sql`${jobs.payload}->>'key' = ${key}`,
      ),
    )
    .limit(1);
  if (!existing)
    await db.insert(jobs).values({ name: BACKFILL_JOB, payload: { base, quote, key } });
}

/** Enqueues a backfill for each code whose history for (code, quote) is short. */
export async function enqueueIfShort(db: Db, codes: string[], quote: string, day: string) {
  for (const code of new Set(codes)) {
    if (code !== quote && (await historyIsShort(db, code, quote, day))) {
      await enqueueRatesBackfill(db, code, quote);
    }
  }
}

/** Distinct (currency, user default) pairs across every user's currency widgets. */
export async function widgetPairs(db: Db, userId?: string) {
  const rows = await db
    .select({ settings: widgets.settings, quote: users.defaultCurrency })
    .from(widgets)
    .innerJoin(users, eq(widgets.userId, users.id))
    .where(
      userId
        ? and(eq(widgets.kind, 'currency'), eq(users.id, userId))
        : eq(widgets.kind, 'currency'),
    );
  const pairs = new Map<string, { base: string; quote: string }>();
  for (const r of rows) {
    const codes = (r.settings as { currencies?: unknown }).currencies;
    for (const base of Array.isArray(codes) ? (codes as string[]) : []) {
      if (base !== r.quote) pairs.set(`${base}:${r.quote}`, { base, quote: r.quote });
    }
  }
  return [...pairs.values()];
}

export function widgetsRatesBackfillJob(
  db: Db,
  provider: RatesProvider,
  clock: { now(): Date },
  logger: Logger,
): JobHandler {
  return async (payload) => {
    const { base, quote } = payload as { base: string; quote: string };
    const now = clock.now();
    const to = new Date(isoDay(now.getTime()));
    const from = new Date(to.getTime() - WINDOW_DAYS * DAY_MS);
    let outcome;
    try {
      outcome = await provider.range(from, to, base, [quote]);
    } catch (e) {
      const limited = (e as { status?: number }).status === 429;
      await recordSourceCall(
        db,
        'frankfurter.range',
        false,
        now,
        logger,
        limited ? 'limit_reached' : undefined,
      );
      return;
    }
    await recordSourceCall(db, 'frankfurter.range', true, now, logger);
    if (isUnsupported(outcome)) return;
    const rows = outcome.flatMap(({ date, rates }) => {
      const rate = rates[quote];
      return rate === undefined
        ? []
        : [{ rateDate: date, base, quote, rate, source: 'frankfurter' }];
    });
    if (rows.length > 0) await db.insert(fxRates).values(rows).onConflictDoNothing();
  };
}
