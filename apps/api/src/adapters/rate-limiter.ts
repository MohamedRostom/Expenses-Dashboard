// T014: rate_limits per data-model.md — fixed window, PK (key, window_start), pruned by housekeeping.
export interface RateLimiter {
  /** Increments the count for `key` in the current window and returns true if still under `limit`. */
  hit(key: string, limit: number, windowMs: number): Promise<boolean>;
  /** Deletes rows whose window is older than `olderThanMs` (housekeeping job). */
  prune(olderThanMs: number): Promise<number>;
}

/** Minimal query port PgRateLimiter needs — real Drizzle wiring lands in a later task. */
export interface Db {
  query<T = unknown>(sql: string, params: unknown[]): Promise<{ rows: T[] }>;
}

function windowStart(now: Date, windowMs: number): Date {
  return new Date(Math.floor(now.getTime() / windowMs) * windowMs);
}

export class PgRateLimiter implements RateLimiter {
  constructor(private readonly db: Db) {}

  async hit(key: string, limit: number, windowMs: number): Promise<boolean> {
    const start = windowStart(new Date(), windowMs);
    const { rows } = await this.db.query<{ count: number }>(
      `INSERT INTO rate_limits (key, window_start, count) VALUES ($1, $2, 1)
       ON CONFLICT (key, window_start) DO UPDATE SET count = rate_limits.count + 1
       RETURNING count`,
      [key, start],
    );
    const row = rows[0];
    if (!row) throw new Error('PgRateLimiter.hit: INSERT ... RETURNING count returned no row');
    return row.count <= limit;
  }

  async prune(olderThanMs: number): Promise<number> {
    const cutoff = new Date(Date.now() - olderThanMs);
    const { rows } = await this.db.query<{ key: string }>(
      `DELETE FROM rate_limits WHERE window_start < $1 RETURNING key`,
      [cutoff],
    );
    return rows.length;
  }
}
