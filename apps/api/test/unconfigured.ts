import { FakeRates } from '@desk/connectors/rates';
import { OpenMeteoFake } from '@desk/connectors/open-meteo/fake';
import { createApp } from '../src/app.js';
import { passwordHasher } from '../src/adapters/password.js';
import { PgSessionStore } from '../src/adapters/session-store.js';
import { PgRateLimiter, type Db as QueryDb } from '../src/adapters/rate-limiter.js';
import { CapturingMailer } from '../src/adapters/mailer.js';
import { createSecretBox } from '../src/adapters/secret-box.js';
import { FakeBreachChecker } from '../src/adapters/breach-checker.js';
import { SESSION_COOKIE } from '../src/middleware/session.js';
import { TEST_SECRET_BOX_KEY, type Harness } from './harness.js';

/**
 * The harness always configures Notion, so BUG-001's "not configured" paths need a second app
 * over the same database: users and sessions made with `harness.asUser` are valid here too.
 * Same wiring as harness.ts with `notion: undefined`.
 */
export function unconfiguredNotionApp(harness: Harness) {
  // drizzle's postgres-js driver keeps the raw client on `$client`.
  const raw = (
    harness.db as unknown as { $client: { unsafe(q: string, p: unknown[]): Promise<unknown[]> } }
  ).$client;
  const queryDb: QueryDb = {
    query: async <T = unknown>(sql: string, params: unknown[]) => ({
      rows: (await raw.unsafe(
        sql,
        params.map((p) => (p instanceof Date ? p.toISOString() : p)),
      )) as T[],
    }),
  };
  return createApp({
    db: harness.db,
    hasher: passwordHasher,
    sessions: new PgSessionStore(queryDb),
    limiter: new PgRateLimiter(queryDb, harness.clock),
    mailer: new CapturingMailer(),
    secretBox: createSecretBox(TEST_SECRET_BOX_KEY),
    breachChecker: new FakeBreachChecker(),
    rates: new FakeRates(),
    weather: new OpenMeteoFake(),
    jobs: undefined,
    clock: harness.clock,
    build: { version: '0.0.0-test', sha: 'testsha' },
    appOrigin: 'https://app.test',
    google: undefined,
    notion: undefined,
    googlePanels: undefined,
    microsoft: undefined,
  });
}

/** Sends a request to `app` with the session of a user from `harness.asUser` (or none). */
export function requestAs(
  app: ReturnType<typeof createApp>,
  user: { sessionToken: string } | null,
  method: string,
  path: string,
  headers: Record<string, string> = {},
): Promise<Response> {
  const h: Record<string, string> = { ...headers };
  h['cookie'] = `${user ? `${SESSION_COOKIE}=${user.sessionToken}; ` : ''}__Host-desk_csrf=t`;
  if (method !== 'GET') h['x-csrf-token'] = 't';
  return Promise.resolve(app.request(path, { method, headers: h }));
}
