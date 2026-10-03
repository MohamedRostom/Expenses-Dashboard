import { sql } from 'drizzle-orm';
import type { Db } from '@desk/db';
import type { Logger } from '../adapters/logger.js';

// FR-019: "failing" = the last three calls to a source failed.
const FAILING_AFTER = 3;
const PAUSE_KEY = 'widgets.weather_paused_until';

// LogEvent requires request fields; these lines are not per-request, so fixed placeholders.
const base = { requestId: 'widgets-source', hashedUserId: null, route: 'widget-source' };

/** Counts one upstream call and tracks the consecutive-failure streak. Never takes a user id. */
export async function recordSourceCall(
  db: Db,
  source: string,
  ok: boolean,
  now: Date,
  logger?: Logger,
): Promise<void> {
  const day = now.toISOString().slice(0, 10);
  const at = now.toISOString();
  await db.execute(sql`
    INSERT INTO widget_source_usage (day, source, calls, failures)
    VALUES (${day}, ${source}, 1, ${ok ? 0 : 1})
    ON CONFLICT (day, source) DO UPDATE
      SET calls = widget_source_usage.calls + 1,
          failures = widget_source_usage.failures + ${ok ? 0 : 1}`);
  const rows = (await db.execute(sql`
    INSERT INTO widget_source_state (source, consecutive_failures, last_success_at, last_failure_at)
    VALUES (${source}, ${ok ? 0 : 1}, ${ok ? at : null}, ${ok ? null : at})
    ON CONFLICT (source) DO UPDATE
      SET consecutive_failures = ${ok ? sql`0` : sql`widget_source_state.consecutive_failures + 1`},
          last_success_at = ${ok ? at : sql`widget_source_state.last_success_at`},
          last_failure_at = ${ok ? sql`widget_source_state.last_failure_at` : at}
    RETURNING consecutive_failures`)) as unknown as { consecutive_failures: number }[];
  const failing = (rows[0]?.consecutive_failures ?? 0) >= FAILING_AFTER;
  logger?.log({
    ...base,
    status: ok ? 200 : 503,
    durationMs: 0,
    event: 'widget_source_call',
    source,
    outcome: ok ? 'ok' : 'failure',
    ...(failing ? { cause: 'failing' } : {}),
  });
}

/** The pause deadline, only while it is still in the future. */
export async function weatherPausedUntil(db: Db, now: Date): Promise<Date | null> {
  const rows = (await db.execute(sql`
    SELECT value #>> '{}' AS until FROM flags
    WHERE key = ${PAUSE_KEY} AND value IS NOT NULL
      AND (value #>> '{}')::timestamptz > ${now.toISOString()}::timestamptz`)) as unknown as {
    until: string;
  }[];
  return rows[0] ? new Date(rows[0].until) : null;
}

export async function pauseWeatherUntil(db: Db, until: Date): Promise<void> {
  await db.execute(sql`
    INSERT INTO flags (key, description, default_on, value)
    VALUES (${PAUSE_KEY}, 'Weather source paused until', false, ${JSON.stringify(until.toISOString())}::jsonb)
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`);
}

/** 'degraded' while the weather pause is in the future or any source is failing. */
export async function sourceStatus(db: Db, now: Date): Promise<'ok' | 'degraded'> {
  const rows = (await db.execute(sql`
    SELECT
      EXISTS (SELECT 1 FROM flags WHERE key = ${PAUSE_KEY} AND value IS NOT NULL
              AND (value #>> '{}')::timestamptz > ${now.toISOString()}::timestamptz) AS paused,
      EXISTS (SELECT 1 FROM widget_source_state WHERE consecutive_failures >= ${FAILING_AFTER}) AS failing`)) as unknown as {
    paused: boolean;
    failing: boolean;
  }[];
  return rows[0]?.paused || rows[0]?.failing ? 'degraded' : 'ok';
}

/** One summary line per source: today's counts, current streak, cached place count. */
export async function emitSourceSummary(db: Db, logger: Logger, now: Date): Promise<void> {
  const day = now.toISOString().slice(0, 10);
  const sources = (await db.execute(sql`
    SELECT s.source, s.consecutive_failures AS "consecutiveFailures",
           COALESCE(u.calls, 0)::int AS calls, COALESCE(u.failures, 0)::int AS failures
    FROM widget_source_state s
    LEFT JOIN widget_source_usage u ON u.source = s.source AND u.day = ${day}`)) as unknown as {
    source: string;
    consecutiveFailures: number;
    calls: number;
    failures: number;
  }[];
  const places = (await db.execute(
    sql`SELECT count(*)::int AS n FROM weather_readings`,
  )) as unknown as { n: number }[];
  for (const s of sources) {
    logger.log({
      ...base,
      status: 200,
      durationMs: 0,
      event: 'widget_source_summary',
      ...s,
      ...(s.consecutiveFailures >= FAILING_AFTER ? { cause: 'failing' } : {}),
      cachedPlaces: places[0]?.n ?? 0,
    });
  }
}
