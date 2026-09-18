import { computeExpiresAt, PgSessionStore, type Db } from '../../src/adapters/session-store.js';

/** Tiny in-memory fake of the sessions table implementing the minimal Db port. */
function fakeDb(): Db {
  const rows: Record<string, unknown>[] = [];
  let seq = 0;
  const db = {
    async query(sql: string, params: unknown[]): Promise<{ rows: unknown[] }> {
      if (sql.startsWith('INSERT')) {
        const [userId, tokenHash, now, expiresAt, userAgent, ip] = params;
        const row = {
          id: `id-${++seq}`,
          user_id: userId,
          token_hash: tokenHash,
          created_at: now,
          last_seen_at: now,
          expires_at: expiresAt,
          user_agent: userAgent,
          ip,
          revoked_at: null,
        };
        rows.push(row);
        return { rows: [row] };
      }
      if (sql.startsWith('SELECT')) {
        const [tokenHash] = params;
        const now = Date.now();
        const found = rows.filter(
          (r) =>
            r.token_hash === tokenHash &&
            r.revoked_at === null &&
            new Date(r.expires_at as string).getTime() > now,
        );
        return { rows: found };
      }
      if (sql.startsWith('UPDATE sessions SET last_seen_at')) {
        const [tokenHash, now, expiresAt] = params;
        const row = rows.find((r) => r.token_hash === tokenHash);
        if (!row) return { rows: [] };
        row.last_seen_at = now;
        row.expires_at = expiresAt;
        return { rows: [row] };
      }
      if (sql.startsWith('UPDATE sessions SET revoked_at = now() WHERE token_hash')) {
        const [tokenHash] = params;
        const row = rows.find((r) => r.token_hash === tokenHash);
        if (row) row.revoked_at = new Date();
        return { rows: [] };
      }
      if (sql.startsWith('UPDATE sessions SET revoked_at = now() WHERE user_id')) {
        const [userId, tokenHash] = params;
        for (const r of rows) {
          if (r.user_id === userId && r.token_hash !== tokenHash && r.revoked_at === null)
            r.revoked_at = new Date();
        }
        return { rows: [] };
      }
      throw new Error(`fakeDb: unhandled sql: ${sql}`);
    },
  };
  return db as Db;
}

describe('computeExpiresAt', () => {
  it('is the earlier of lastSeen+30d and created+90d', () => {
    const created = new Date('2026-01-01T00:00:00Z');
    const lastSeenSoon = new Date('2026-01-02T00:00:00Z');
    // lastSeen+30d is far earlier than created+90d here.
    expect(computeExpiresAt(created, lastSeenSoon).toISOString()).toBe('2026-02-01T00:00:00.000Z');

    const lastSeenLate = new Date('2026-06-01T00:00:00Z');
    // lastSeen+30d would be past created+90d, so created+90d caps it.
    expect(computeExpiresAt(created, lastSeenLate).toISOString()).toBe(
      new Date(created.getTime() + 90 * 24 * 60 * 60 * 1000).toISOString(),
    );
  });
});

describe('PgSessionStore', () => {
  it('creates then gets a session', async () => {
    const store = new PgSessionStore(fakeDb());
    const created = await store.create({ userId: 'u1', tokenHash: 'h1' });
    expect(created.userId).toBe('u1');
    const fetched = await store.get('h1');
    expect(fetched?.id).toBe(created.id);
  });

  it('touch updates lastSeenAt and returns null for unknown token', async () => {
    const store = new PgSessionStore(fakeDb());
    await store.create({ userId: 'u1', tokenHash: 'h1' });
    const touched = await store.touch('h1');
    expect(touched).not.toBeNull();
    expect(await store.touch('missing')).toBeNull();
  });

  it('revoke makes the session unfindable by get', async () => {
    const store = new PgSessionStore(fakeDb());
    await store.create({ userId: 'u1', tokenHash: 'h1' });
    await store.revoke('h1');
    expect(await store.get('h1')).toBeNull();
  });

  it('revokeAllExcept revokes every other session for the user but keeps the given one', async () => {
    const store = new PgSessionStore(fakeDb());
    await store.create({ userId: 'u1', tokenHash: 'keep' });
    await store.create({ userId: 'u1', tokenHash: 'drop' });
    await store.create({ userId: 'u2', tokenHash: 'other-user' });
    await store.revokeAllExcept('u1', 'keep');
    expect(await store.get('keep')).not.toBeNull();
    expect(await store.get('drop')).toBeNull();
    expect(await store.get('other-user')).not.toBeNull();
  });
});
