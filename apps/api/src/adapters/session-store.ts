// T013: sessions per data-model.md. expires_at = min(last_seen_at + 30d, created_at + 90d).
export interface Session {
  id: string;
  userId: string;
  tokenHash: string;
  createdAt: Date;
  lastSeenAt: Date;
  expiresAt: Date;
  userAgent: string | null;
  ip: string | null;
  revokedAt: Date | null;
}

export interface SessionStore {
  create(input: {
    userId: string;
    tokenHash: string;
    userAgent?: string | null;
    ip?: string | null;
  }): Promise<Session>;
  get(tokenHash: string): Promise<Session | null>;
  touch(tokenHash: string): Promise<Session | null>;
  revoke(tokenHash: string): Promise<void>;
  revokeAllExcept(userId: string, tokenHash: string): Promise<void>;
}

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

export function computeExpiresAt(createdAt: Date, lastSeenAt: Date): Date {
  const fromLastSeen = lastSeenAt.getTime() + THIRTY_DAYS_MS;
  const fromCreated = createdAt.getTime() + NINETY_DAYS_MS;
  return new Date(Math.min(fromLastSeen, fromCreated));
}

/** Minimal query port PgSessionStore needs — real Drizzle wiring lands in a later task. */
export interface Db {
  query<T = unknown>(sql: string, params: unknown[]): Promise<{ rows: T[] }>;
}

interface SessionRow {
  id: string;
  user_id: string;
  token_hash: string;
  created_at: string | Date;
  last_seen_at: string | Date;
  expires_at: string | Date;
  user_agent: string | null;
  ip: string | null;
  revoked_at: string | Date | null;
}

function rowToSession(row: SessionRow): Session {
  return {
    id: row.id,
    userId: row.user_id,
    tokenHash: row.token_hash,
    createdAt: new Date(row.created_at),
    lastSeenAt: new Date(row.last_seen_at),
    expiresAt: new Date(row.expires_at),
    userAgent: row.user_agent,
    ip: row.ip,
    revokedAt: row.revoked_at ? new Date(row.revoked_at) : null,
  };
}

export class PgSessionStore implements SessionStore {
  constructor(private readonly db: Db) {}

  async create(input: {
    userId: string;
    tokenHash: string;
    userAgent?: string | null;
    ip?: string | null;
  }): Promise<Session> {
    const now = new Date();
    const expiresAt = computeExpiresAt(now, now);
    const { rows } = await this.db.query<SessionRow>(
      `INSERT INTO sessions (id, user_id, token_hash, created_at, last_seen_at, expires_at, user_agent, ip, revoked_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $3, $4, $5, $6, NULL)
       RETURNING *`,
      [input.userId, input.tokenHash, now, expiresAt, input.userAgent ?? null, input.ip ?? null],
    );
    const row = rows[0];
    if (!row) throw new Error('PgSessionStore.create: INSERT ... RETURNING * returned no row');
    return rowToSession(row);
  }

  async get(tokenHash: string): Promise<Session | null> {
    const { rows } = await this.db.query<SessionRow>(
      `SELECT * FROM sessions WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > now()`,
      [tokenHash],
    );
    return rows[0] ? rowToSession(rows[0]) : null;
  }

  async touch(tokenHash: string): Promise<Session | null> {
    const existing = await this.get(tokenHash);
    if (!existing) return null;
    const now = new Date();
    const expiresAt = computeExpiresAt(existing.createdAt, now);
    const { rows } = await this.db.query<SessionRow>(
      `UPDATE sessions SET last_seen_at = $2, expires_at = $3 WHERE token_hash = $1 RETURNING *`,
      [tokenHash, now, expiresAt],
    );
    return rows[0] ? rowToSession(rows[0]) : null;
  }

  async revoke(tokenHash: string): Promise<void> {
    await this.db.query(`UPDATE sessions SET revoked_at = now() WHERE token_hash = $1`, [
      tokenHash,
    ]);
  }

  async revokeAllExcept(userId: string, tokenHash: string): Promise<void> {
    await this.db.query(
      `UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND token_hash != $2 AND revoked_at IS NULL`,
      [userId, tokenHash],
    );
  }
}
