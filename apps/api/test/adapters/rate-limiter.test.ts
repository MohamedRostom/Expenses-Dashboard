import { PgRateLimiter, type Db } from '../../src/adapters/rate-limiter.js';

/** Tiny in-memory fake of the rate_limits table implementing the minimal Db port. */
function fakeDb() {
  const rows = new Map<string, { key: string; window_start: Date; count: number }>();
  const db = {
    async query(sql: string, params: unknown[]): Promise<{ rows: unknown[] }> {
      if (sql.startsWith('INSERT')) {
        const [key, windowStart] = params as [string, Date];
        const mapKey = `${key}|${windowStart.toISOString()}`;
        const existing = rows.get(mapKey);
        const row = existing
          ? { ...existing, count: existing.count + 1 }
          : { key, window_start: windowStart, count: 1 };
        rows.set(mapKey, row);
        return { rows: [{ count: row.count }] };
      }
      if (sql.startsWith('DELETE')) {
        const [cutoff] = params as [Date];
        const toDelete = [...rows.entries()].filter(
          ([, r]) => r.window_start.getTime() < cutoff.getTime(),
        );
        for (const [k] of toDelete) rows.delete(k);
        return { rows: toDelete.map(([, r]) => ({ key: r.key })) };
      }
      throw new Error(`fakeDb: unhandled sql: ${sql}`);
    },
  };
  return db as Db;
}

describe('PgRateLimiter', () => {
  it('allows hits under the limit and blocks once the limit is exceeded, per key', async () => {
    const limiter = new PgRateLimiter(fakeDb());
    expect(await limiter.hit('login:ip1', 3, 60_000)).toBe(true);
    expect(await limiter.hit('login:ip1', 3, 60_000)).toBe(true);
    expect(await limiter.hit('login:ip1', 3, 60_000)).toBe(true);
    expect(await limiter.hit('login:ip1', 3, 60_000)).toBe(false);
    // a different key has its own budget
    expect(await limiter.hit('login:ip2', 3, 60_000)).toBe(true);
  });

  it('prune deletes rows older than the given age and returns the count deleted', async () => {
    const limiter = new PgRateLimiter(fakeDb());
    await limiter.hit('k', 100, 60_000);
    const deleted = await limiter.prune(0);
    expect(deleted).toBe(1);
    // second prune finds nothing left
    expect(await limiter.prune(0)).toBe(0);
  });
});
