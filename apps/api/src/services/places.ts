import { sql } from 'drizzle-orm';
import type { Db } from '@desk/db';
import { auditLog, places } from '@desk/db';
import { eq } from 'drizzle-orm';
import type { PlaceCandidateT } from '@desk/contracts';
import { nearest, normaliseQuery, roundCoord } from '@desk/core';
import {
  SourceError,
  SourcePaused,
  type PlaceCandidate,
  type WeatherSource,
} from '@desk/connectors/open-meteo';
import type { Logger } from '../adapters/logger.js';
import type { RateLimiter } from '../adapters/rate-limiter.js';
import { ApiError } from '../lib/api-error.js';
import type { SessionUser } from '../middleware/session.js';
import { recordSourceCall, weatherPausedUntil } from './source-usage.js';

const CACHE_TTL_MS = 24 * 3600_000;
const RADIUS_DEG = 0.05;
const LIMIT = 10;
const WINDOW_MS = 60_000;

const toContract = (p: PlaceCandidate): PlaceCandidateT => ({ ...p, admin1: p.admin1 ?? null });

export function createPlacesService(deps: {
  db: Db;
  source: WeatherSource;
  limiter: RateLimiter;
  clock: { now(): Date };
  logger: Logger;
}) {
  const { db, source, limiter, clock, logger } = deps;

  async function hit(key: string) {
    if (!(await limiter.hit(key, LIMIT, WINDOW_MS))) {
      throw new ApiError('rate_limited', 'Too many place lookups, try again in a minute', 429);
    }
  }

  async function assertNotPaused() {
    if (await weatherPausedUntil(db, clock.now())) {
      throw new ApiError('source_paused', 'Place search is paused, try again later', 503);
    }
  }

  /** One counted upstream call; maps source failures to API errors. */
  async function counted<T>(name: string, call: () => Promise<T>): Promise<T> {
    try {
      const out = await call();
      await recordSourceCall(db, name, true, clock.now(), logger);
      return out;
    } catch (e) {
      await recordSourceCall(
        db,
        name,
        false,
        clock.now(),
        logger,
        e instanceof SourcePaused ? 'limit_reached' : undefined,
      );
      if (e instanceof SourcePaused) {
        throw new ApiError('source_paused', 'Place search is paused, try again later', 503);
      }
      if (e instanceof SourceError) {
        throw new ApiError('source_unreachable', 'Place search is unavailable', 503);
      }
      throw e;
    }
  }

  async function lookup(q: string): Promise<PlaceCandidateT[]> {
    const key = normaliseQuery(q);
    const fresh = new Date(clock.now().getTime() - CACHE_TTL_MS).toISOString();
    const hitRow = (await db.execute(
      sql`SELECT results FROM geocode_cache WHERE query = ${key} AND fetched_at > ${fresh}::timestamptz`,
    )) as unknown as { results: PlaceCandidateT[] }[];
    if (hitRow[0]) return hitRow[0].results;
    const results = (await counted('open_meteo.search', () => source.search(key))).map(toContract);
    await db.execute(sql`
      INSERT INTO geocode_cache (query, results, fetched_at)
      VALUES (${key}, ${JSON.stringify(results)}::jsonb, ${clock.now().toISOString()})
      ON CONFLICT (query) DO UPDATE SET results = EXCLUDED.results, fetched_at = EXCLUDED.fetched_at`);
    return results;
  }

  return {
    async search(user: SessionUser, q: string): Promise<PlaceCandidateT[]> {
      await assertNotPaused();
      await hit(`places.search:${user.id}`);
      return lookup(q);
    },

    async resolve(user: SessionUser, rawLat: number, rawLon: number) {
      await hit(`places.resolve:${user.id}`);
      const lat = roundCoord(rawLat);
      const lon = roundCoord(rawLon);
      // Device coordinates are used once and never stored; the audit row carries none.
      await db.insert(auditLog).values({
        userId: user.id,
        actor: 'user',
        action: 'place.device_location_used',
        subject: user.id,
      });
      // ponytail: scans every geocode_cache row in JS; fine at beta size, move to a lat/lon table if the cache grows past a few thousand rows.
      const cached = (
        (await db.execute(sql`SELECT results FROM geocode_cache`)) as unknown as {
          results: PlaceCandidateT[];
        }[]
      ).flatMap((r) => r.results);
      const own = (await db.select().from(places).where(eq(places.userId, user.id))).map(
        (p): PlaceCandidateT => ({
          name: p.name,
          admin1: p.admin1,
          country: p.country,
          lat: Number(p.lat),
          lon: Number(p.lon),
          timeZone: p.timeZone,
        }),
      );
      const near = nearest([...own, ...cached], lat, lon, RADIUS_DEG);
      if (near) return { candidates: [near], approximate: false };

      await assertNotPaused();
      const fc = await counted('open_meteo.forecast', () => source.forecast(lat, lon, 'auto'));
      const city = (fc.timeZone.split('/').pop() ?? fc.timeZone).replace(/_/g, ' ');
      return { candidates: await lookup(city), approximate: true };
    },
  };
}
