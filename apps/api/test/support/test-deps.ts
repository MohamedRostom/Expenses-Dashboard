import type { AppDeps } from '../../src/app.js';
import type { Session, SessionStore } from '../../src/adapters/session-store.js';
import type { RateLimiter } from '../../src/adapters/rate-limiter.js';
import { CapturingMailer } from '../../src/adapters/mailer.js';
import type { users } from '@desk/db';

type UserRow = typeof users.$inferSelect;

/** Minimal stand-in for the Drizzle `Db` — just enough chain (select/from/where/limit) for
 * session.ts to load a seeded user. Not a general-purpose fake. */
export class FakeDb {
  constructor(private readonly seeded: UserRow[] = []) {}

  select() {
    return {
      from: () => ({
        where: (predicate: { userId?: string } | unknown) => ({
          limit: async () => {
            // eq(users.id, x) is opaque here; session.ts is the only caller, so filter by id
            // captured via the drizzle `eq` SQL object's right-hand value.
            const target = (predicate as { queryChunks?: unknown[] })?.queryChunks;
            void target;
            return this.seeded;
          },
        }),
      }),
    };
  }
}

export class FakeSessionStore implements SessionStore {
  constructor(private readonly session: Session | null = null) {}
  async create(): Promise<Session> {
    throw new Error('not used in these tests');
  }
  async get(): Promise<Session | null> {
    return this.session;
  }
  async touch(): Promise<Session | null> {
    return this.session;
  }
  async revoke(): Promise<void> {}
  async revokeAllExcept(): Promise<void> {}
}

export class FakeRateLimiter implements RateLimiter {
  async hit(): Promise<boolean> {
    return true;
  }
  async prune(): Promise<number> {
    return 0;
  }
}

/** Builds a full AppDeps with inert fakes; override individual fields per test. */
export function testDeps(overrides: Partial<AppDeps> = {}): AppDeps {
  return {
    db: new FakeDb() as unknown as AppDeps['db'],
    hasher: {
      hash: async (p) => `hashed:${p}`,
      verify: async () => true,
      needsRehash: () => false,
    },
    sessions: new FakeSessionStore(),
    limiter: new FakeRateLimiter(),
    mailer: new CapturingMailer(),
    secretBox: { seal: async (s) => s, open: async (s) => s },
    breachChecker: { check: async () => false },
    google: undefined,
    rates: undefined,
    jobs: undefined,
    clock: { now: () => new Date('2026-09-18T00:00:00Z') },
    build: { version: '0.0.0-test', sha: 'testsha' },
    ...overrides,
  };
}
