import { and, eq, inArray } from 'drizzle-orm';
import { jobs as jobsTable, type Db } from '@desk/db';
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

/** Refreshes due readings, then re-enqueues itself +1 minute (even if the pass threw). */
export function widgetsWeatherRefreshJob(deps: {
  db: Db;
  source: WeatherSource;
  clock: Clock;
  enqueue: Enqueue;
  logger?: Logger;
}): JobHandler {
  return async () => {
    try {
      await refreshReadings(deps);
    } finally {
      await deps.enqueue(
        'widgets.weather_refresh',
        {},
        { runAfter: new Date(deps.clock.now().getTime() + INTERVAL_MS) },
      );
    }
  };
}

/** Enqueues a recurring job unless one is already queued or running. */
export async function ensureRecurring(db: Db, enqueue: Enqueue, name: string, now: Date) {
  const [existing] = await db
    .select({ id: jobsTable.id })
    .from(jobsTable)
    .where(and(eq(jobsTable.name, name), inArray(jobsTable.status, ['queued', 'running'])))
    .limit(1);
  if (!existing) await enqueue(name, {}, { runAfter: now });
}

export const ensureWidgetJobs = async (db: Db, enqueue: Enqueue, now: Date) => {
  await ensureRecurring(db, enqueue, 'widgets.weather_refresh', now);
  await ensureRecurring(db, enqueue, 'widgets.purge', now);
};
