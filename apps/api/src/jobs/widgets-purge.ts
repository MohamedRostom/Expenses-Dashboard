import { sql } from 'drizzle-orm';
import type { Db } from '@desk/db';
import { logger as defaultLogger, type Logger } from '../adapters/logger.js';
import type { Clock } from '../app.js';
import { emitSourceSummary } from '../services/source-usage.js';
import type { Enqueue } from './widgets-weather-refresh.js';
import type { JobHandler } from './index.js';

const DAY_MS = 86_400_000;

/** Daily: drops idle readings, stale geocode cache and old usage rows, logs the summary once. */
export function widgetsPurgeJob(deps: {
  db: Db;
  clock: Clock;
  enqueue: Enqueue;
  logger?: Logger;
}): JobHandler {
  return async () => {
    const now = deps.clock.now();
    const ago = (days: number) => new Date(now.getTime() - days * DAY_MS).toISOString();
    try {
      await deps.db.execute(
        sql`DELETE FROM weather_readings WHERE last_active_at < ${ago(7)}::timestamptz`,
      );
      await deps.db.execute(
        sql`DELETE FROM geocode_cache WHERE fetched_at < ${ago(1)}::timestamptz`,
      );
      await deps.db.execute(
        sql`DELETE FROM widget_source_usage WHERE day < ${ago(90).slice(0, 10)}::date`,
      );
      await emitSourceSummary(deps.db, deps.logger ?? defaultLogger, now);
    } catch (e) {
      // never rethrow: the runner would retry this row next to the successor queued below
      console.error('widgets.purge pass failed', e instanceof Error ? e.message : e);
    } finally {
      await deps.enqueue('widgets.purge', {}, { runAfter: new Date(now.getTime() + DAY_MS) });
    }
  };
}
