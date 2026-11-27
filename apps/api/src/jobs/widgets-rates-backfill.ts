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

const UNSUPPORTED = 'unsupported';
// LogEvent requires request fields; job lines are not per-request.
const logBase = {
  requestId: 'widgets-rates-backfill',
  hashedUserId: null,
  route: 'widgets.rates_backfill',
  durationMs: 0,
};
const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

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
  // A done row marked 'unsupported' by the job (below) means Frankfurter doesn't publish the pair.
  const [dead] = await db
    .select({ id: jobs.id })
    .from(jobs)
    .where(
      and(
        eq(jobs.name, BACKFILL_JOB),
        eq(jobs.error, UNSUPPORTED),
        sql`${jobs.payload}->>'key' = ${key}`,
      ),
    )
    .limit(1);
  if (!existing && !dead)
    await db.insert(jobs).values({ name: BACKFILL_JOB, payload: { base, quote, key } });
}

/** Enqueues a backfill for each code whose history for (code, quote) is short, i.e. has no
 * fx_rates row at or before `day - 30`. One query covers every code. */
export async function enqueueIfShort(db: Db, codes: string[], quote: string, day: string) {
  const wanted = [...new Set(codes)].filter((c) => c !== quote);
  if (wanted.length === 0) return;
  const firsts = await db
    .select({ base: fxRates.base, first: min(fxRates.rateDate) })
    .from(fxRates)
    .where(and(eq(fxRates.quote, quote), inArray(fxRates.base, wanted)))
    .groupBy(fxRates.base);
  const first = new Map(firsts.map((r) => [r.base, r.first]));
  const reach = isoDay(Date.parse(day) - REACH_DAYS * DAY_MS);
  for (const code of wanted) {
    const f = first.get(code);
    if (!f || f > reach) await enqueueRatesBackfill(db, code, quote);
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
      const status = (e as { status?: number }).status;
      const limited = status === 429;
      await recordSourceCall(
        db,
        'frankfurter.range',
        false,
        now,
        logger,
        limited ? 'limit_reached' : undefined,
      );
      logger.log({
        ...logBase,
        event: 'widget_rates_backfill_failed',
        base,
        quote,
        status: status ?? 500,
        message: (e as Error).message,
      });
      if (!limited) throw e; // job row fails and the runner retries; a 429 waits for the daily warm
      return;
    }
    await recordSourceCall(db, 'frankfurter.range', true, now, logger);
    if (isUnsupported(outcome)) {
      logger.log({
        ...logBase,
        status: 200,
        event: 'widget_rates_backfill_unsupported',
        base,
        quote,
      });
      // Durable marker (no migration): enqueueRatesBackfill skips pairs with a done 'unsupported' row.
      // ponytail: permanent; delete the row to retry a pair Frankfurter later adds.
      await db.insert(jobs).values({
        name: BACKFILL_JOB,
        payload: { base, quote, key: `${BACKFILL_JOB}:${base}:${quote}` },
        status: 'done',
        error: UNSUPPORTED,
        finishedAt: now,
      });
      return;
    }
    const rows = outcome.flatMap(({ date, rates }) => {
      const rate = rates[quote];
      return rate === undefined
        ? []
        : [{ rateDate: date, base, quote, rate, source: 'frankfurter' }];
    });
    if (rows.length > 0) await db.insert(fxRates).values(rows).onConflictDoNothing();
  };
}
