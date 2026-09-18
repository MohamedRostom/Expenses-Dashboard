// T117: Stage 2 SessionStore backed by Cloudflare KV (env.SESSIONS_KV), same contract as
// PgSessionStore. KV has no secondary-index query, so revokeAllExcept walks a
// `user:<userId>:<tokenHash>` prefix list (ponytail: fine at Desk's scale — one list() call per
// revoke-all; move to Postgres-backed sessions if a user ever accumulates thousands of them).
import { computeExpiresAt, type Session, type SessionStore } from './session-store.js';

/** Minimal shape of the Workers KVNamespace binding this adapter needs. */
export interface KVNamespace {
  get(key: string, type: 'json'): Promise<unknown>;
  put(
    key: string,
    value: string,
    opts?: { expiration?: number; expirationTtl?: number },
  ): Promise<void>;
  delete(key: string): Promise<void>;
  list(opts?: { prefix?: string }): Promise<{ keys: { name: string }[] }>;
}

interface StoredSession {
  id: string;
  userId: string;
  tokenHash: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  userAgent: string | null;
  ip: string | null;
  revokedAt: string | null;
}

const sessionKey = (tokenHash: string) => `session:${tokenHash}`;
const userIndexPrefix = (userId: string) => `user:${userId}:`;
const userIndexKey = (userId: string, tokenHash: string) =>
  `${userIndexPrefix(userId)}${tokenHash}`;

function serialize(s: Session): string {
  const stored: StoredSession = {
    id: s.id,
    userId: s.userId,
    tokenHash: s.tokenHash,
    createdAt: s.createdAt.toISOString(),
    lastSeenAt: s.lastSeenAt.toISOString(),
    expiresAt: s.expiresAt.toISOString(),
    userAgent: s.userAgent,
    ip: s.ip,
    revokedAt: s.revokedAt ? s.revokedAt.toISOString() : null,
  };
  return JSON.stringify(stored);
}

function deserialize(raw: unknown): Session {
  const s = raw as StoredSession;
  return {
    id: s.id,
    userId: s.userId,
    tokenHash: s.tokenHash,
    createdAt: new Date(s.createdAt),
    lastSeenAt: new Date(s.lastSeenAt),
    expiresAt: new Date(s.expiresAt),
    userAgent: s.userAgent,
    ip: s.ip,
    revokedAt: s.revokedAt ? new Date(s.revokedAt) : null,
  };
}

export class KvSessionStore implements SessionStore {
  constructor(private readonly kv: KVNamespace) {}

  private async put(session: Session): Promise<void> {
    const ttlSeconds = Math.max(60, Math.floor((session.expiresAt.getTime() - Date.now()) / 1000));
    const value = serialize(session);
    await this.kv.put(sessionKey(session.tokenHash), value, { expirationTtl: ttlSeconds });
    await this.kv.put(userIndexKey(session.userId, session.tokenHash), '1', {
      expirationTtl: ttlSeconds,
    });
  }

  async create(input: {
    userId: string;
    tokenHash: string;
    userAgent?: string | null;
    ip?: string | null;
  }): Promise<Session> {
    const now = new Date();
    const session: Session = {
      id: crypto.randomUUID(),
      userId: input.userId,
      tokenHash: input.tokenHash,
      createdAt: now,
      lastSeenAt: now,
      expiresAt: computeExpiresAt(now, now),
      userAgent: input.userAgent ?? null,
      ip: input.ip ?? null,
      revokedAt: null,
    };
    await this.put(session);
    return session;
  }

  async get(tokenHash: string): Promise<Session | null> {
    const raw = await this.kv.get(sessionKey(tokenHash), 'json');
    if (!raw) return null;
    const session = deserialize(raw);
    if (session.revokedAt || session.expiresAt.getTime() <= Date.now()) return null;
    return session;
  }

  async touch(tokenHash: string): Promise<Session | null> {
    const existing = await this.get(tokenHash);
    if (!existing) return null;
    const now = new Date();
    existing.lastSeenAt = now;
    existing.expiresAt = computeExpiresAt(existing.createdAt, now);
    await this.put(existing);
    return existing;
  }

  async revoke(tokenHash: string): Promise<void> {
    const raw = await this.kv.get(sessionKey(tokenHash), 'json');
    if (!raw) return;
    const session = deserialize(raw);
    session.revokedAt = new Date();
    await this.kv.put(sessionKey(tokenHash), serialize(session), { expirationTtl: 60 });
    await this.kv.delete(userIndexKey(session.userId, tokenHash));
  }

  async revokeAllExcept(userId: string, tokenHash: string): Promise<void> {
    const { keys } = await this.kv.list({ prefix: userIndexPrefix(userId) });
    const prefix = userIndexPrefix(userId);
    await Promise.all(
      keys
        .map((k) => k.name.slice(prefix.length))
        .filter((th) => th !== tokenHash)
        .map((th) => this.revoke(th)),
    );
  }
}
