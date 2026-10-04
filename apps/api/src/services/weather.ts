import { sql } from 'drizzle-orm';
import { auditLog, type Db } from '@desk/db';
import { SourcePaused, type WeatherSource } from '@desk/connectors/open-meteo';
import type { Logger } from '../adapters/logger.js';
import {
  FAILING_AFTER,
  pauseWeatherUntil,
  recordSourceCall,
  weatherPausedUntil,
} from './source-usage.js';

const STALE_MS = 3_600_000;
const ACTIVE_MS = 24 * 3_600_000;

type WeatherDeps = {
  db: Db;
  source: WeatherSource;
  clock: { now(): Date };
  logger: Logger;
};

const DEGRADED_WINDOW_MS = 10 * 60_000;

async function sourceDegraded(db: Db, now: Date): Promise<boolean> {
  const since = new Date(now.getTime() - DEGRADED_WINDOW_MS).toISOString();
  const rows = (await db.execute(sql`
    SELECT 1 FROM widget_source_state
    WHERE source = 'open_meteo.forecast' AND consecutive_failures >= ${FAILING_AFTER}
      AND last_failure_at > ${since}::timestamptz`)) as unknown as unknown[];
  return rows.length > 0;
}

type Due = { lat: string; lon: string; active: string | null };

/**
 * Fetches one forecast per distinct rounded (lat, lon). Job path: places of users active in the
 * last 24h whose reading is missing or older than 1h. Inline path (`userId`): that user's places
 * with no reading yet. Source failures never throw; only rounded coordinates reach the source, and the
 * stored zone is always the one the source returns for them (`auto`), never a client-sent one.
 */
export async function refreshReadings(deps: WeatherDeps, opts: { userId?: string } = {}) {
  const { db, source, clock, logger } = deps;
  const now = clock.now();
  if (await weatherPausedUntil(db, now)) return;
  // ponytail: global backoff while the source is degraded; per-row next_attempt_at if needed.
  // Job path only: a single user's new place (inline) still gets its one try.
  if (!opts.userId && (await sourceDegraded(db, now))) return;
  const iso = now.toISOString();
  const staleBefore = new Date(now.getTime() - STALE_MS).toISOString();
  const activeSince = new Date(now.getTime() - ACTIVE_MS).toISOString();
  const scope = opts.userId
    ? sql`p.user_id = ${opts.userId} AND r.lat IS NULL`
    : sql`u.last_active_at > ${activeSince}::timestamptz
          AND (r.lat IS NULL OR r.fetched_at < ${staleBefore}::timestamptz)`;
  const due = (await db.execute(sql`
    SELECT p.lat::text AS lat, p.lon::text AS lon,
           max(u.last_active_at)::text AS active
    FROM places p
    JOIN users u ON u.id = p.user_id
    LEFT JOIN weather_readings r ON r.lat = p.lat AND r.lon = p.lon
    WHERE ${scope}
    GROUP BY p.lat, p.lon`)) as unknown as Due[];

  for (const d of due) {
    let f;
    try {
      f = await source.forecast(Number(d.lat), Number(d.lon), 'auto');
    } catch (e) {
      await recordSourceCall(
        db,
        'open_meteo.forecast',
        false,
        now,
        logger,
        e instanceof SourcePaused ? 'limit_reached' : undefined,
      );
      if (e instanceof SourcePaused) {
        const until = new Date(now.getTime() + e.retryAfterMs);
        await pauseWeatherUntil(db, until);
        await db.insert(auditLog).values({
          actor: 'system',
          action: 'weather.quota_pause',
          subject: 'open_meteo',
          details: { until: until.toISOString() },
        });
        return; // the quota is shared; every further call would be refused too
      }
      // keep the old current/daily; B2 reads `error` as cause source_unreachable
      // time_zone is NOT NULL: 'UTC' is a placeholder only a failed first call can leave; the next
      // success overwrites it, and no figure reads the zone without a stored forecast.
      await db.execute(sql`
        INSERT INTO weather_readings (lat, lon, time_zone, last_active_at, error)
        VALUES (${d.lat}, ${d.lon}, 'UTC', coalesce(${d.active}::timestamptz, ${iso}::timestamptz), 'source_unreachable')
        ON CONFLICT (lat, lon) DO UPDATE SET error = 'source_unreachable'`);
      continue;
    }
    // A failure below (DB, mapping) is not the source's fault: it propagates unrecorded.
    await recordSourceCall(db, 'open_meteo.forecast', true, now, logger);
    await db.execute(sql`
      INSERT INTO weather_readings (lat, lon, time_zone, current, daily, fetched_at, last_active_at, error)
      VALUES (${d.lat}, ${d.lon}, ${f.timeZone}, ${JSON.stringify(f.current)}::jsonb,
              ${JSON.stringify(f.daily)}::jsonb, ${iso}::timestamptz,
              coalesce(${d.active}::timestamptz, ${iso}::timestamptz), NULL)
      ON CONFLICT (lat, lon) DO UPDATE SET
        time_zone = EXCLUDED.time_zone, current = EXCLUDED.current, daily = EXCLUDED.daily,
        fetched_at = EXCLUDED.fetched_at, last_active_at = EXCLUDED.last_active_at, error = NULL`);
  }
}
