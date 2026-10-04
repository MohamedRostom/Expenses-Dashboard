import { sql } from 'drizzle-orm';
import type { Db } from '@desk/db';
import type { WeatherSource } from '@desk/connectors/open-meteo';
import type { Logger } from '../adapters/logger.js';
import type { Clock } from '../app.js';
import { refreshReadings } from '../services/weather.js';
import type { JobHandler } from './index.js';

const INTERVAL_MS = 60_000;

export type Enqueue = (
  name: string,
  payload: unknown,
  opts?: { runAfter?: Date },
) => Promise<string>;

/**
 * Refreshes due readings, then re-enqueues itself +1 minute. A failing pass is logged, never
 * rethrown: the runner would retry the row while the finally-block already queued a successor.
 */
export function widgetsWeatherRefreshJob(deps: {
  db: Db;
  source: WeatherSource;
  clock: Clock;
  enqueue: Enqueue;
  logger: Logger;
}): JobHandler {
  return async () => {
    try {
      await refreshReadings(deps);
    } catch (e) {
      console.error('widgets.weather_refresh pass failed', e instanceof Error ? e.message : e);
    } finally {
      await deps.enqueue(
        'widgets.weather_refresh',
        {},
        { runAfter: new Date(deps.clock.now().getTime() + INTERVAL_MS) },
      );
    }
  };
}

/**
 * Enqueues a recurring job unless one is queued or running (a 'running' row started over 10 minutes
 * ago counts as dead). INSERT ... WHERE NOT EXISTS alone races under READ COMMITTED, so a per-name
 * advisory transaction lock serialises concurrent ensures; the insert's snapshot is taken after it.
 */
export async function ensureRecurring(db: Db, name: string, now: Date) {
  const at = now.toISOString();
  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${name}))`);
    await tx.execute(sql`
    INSERT INTO jobs (name, payload, run_after)
    SELECT ${name}, '{}'::jsonb, ${at}::timestamptz
    WHERE NOT EXISTS (
      SELECT 1 FROM jobs
      WHERE name = ${name}
        AND (status = 'queued'
             OR (status = 'running' AND started_at > ${at}::timestamptz - interval '10 minutes')))`);
  });
}

export const ensureWidgetJobs = async (db: Db, now: Date) => {
  await ensureRecurring(db, 'widgets.weather_refresh', now);
  await ensureRecurring(db, 'widgets.purge', now);
};
