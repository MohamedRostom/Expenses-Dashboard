import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import postgres from 'postgres';
import { eq } from 'drizzle-orm';
import { runMigrations } from '@desk/db/migrate';
import { createDb, users, type Db } from '@desk/db';
import { FakeRates } from '@desk/connectors/rates';
import type { RatesProvider } from '@desk/connectors/rates';
import { FakeNotion } from '@desk/connectors/notion';
import { createNotionMockApp } from '../../../infra/mocks/src/notion-fake-routes.js';
import { createApp, type AppDeps, type Clock } from '../src/app.js';
import { passwordHasher } from '../src/adapters/password.js';
import { PgSessionStore } from '../src/adapters/session-store.js';
import { PgRateLimiter } from '../src/adapters/rate-limiter.js';
import { CapturingMailer } from '../src/adapters/mailer.js';
import { createSecretBox } from '../src/adapters/secret-box.js';
import { FakeBreachChecker } from '../src/adapters/breach-checker.js';
import type { Db as QueryDb } from '../src/adapters/rate-limiter.js';
import { SESSION_COOKIE } from '../src/middleware/session.js';

const CSRF_COOKIE = 'desk_csrf';
const CSRF_HEADER = 'x-csrf-token';
const TEST_SECRET_BOX_KEY = Buffer.alloc(32, 7).toString('base64');

/** SHA-256 of the raw token, hex — must match middleware/session.ts's hashToken exactly. */
async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export type TestClock = Clock & { set(date: Date): void };

export type ApiClient = {
  get(path: string): Promise<Response>;
  post(path: string, body?: unknown): Promise<Response>;
  put(path: string, body?: unknown): Promise<Response>;
  patch(path: string, body?: unknown): Promise<Response>;
  delete(path: string, body?: unknown): Promise<Response>;
};

export type Harness = {
  app: ReturnType<typeof createApp>;
  db: Db;
  mailer: CapturingMailer;
  clock: TestClock;
  /** Creates (or reuses) a user by email and returns a client authenticated as them. */
  asUser(email: string): Promise<ApiClient & { userId: string; sessionToken: string }>;
  /** The FakeNotion instance backing NOTION_API_BASE for this harness — seed pages or call
   * failNextWith('unauthorized'/'rate_limited') to script scenarios. */
  notionFake: FakeNotion;
  close(): Promise<void>;
};

function client(app: ReturnType<typeof createApp>, sessionToken: string): ApiClient {
  const csrfToken = 'test-csrf-token';
  const cookieHeader = `${SESSION_COOKIE}=${sessionToken}; ${CSRF_COOKIE}=${csrfToken}`;

  async function request(method: string, path: string, body?: unknown): Promise<Response> {
    const headers: Record<string, string> = { cookie: cookieHeader };
    if (method !== 'GET') headers[CSRF_HEADER] = csrfToken;
    const init: RequestInit = { method, headers };
    if (body instanceof FormData) {
      // Let fetch set the multipart Content-Type (with boundary) itself.
      init.body = body;
    } else if (body !== undefined) {
      headers['content-type'] = 'application/json';
      init.body = JSON.stringify(body);
    }
    return app.request(path, init);
  }

  return {
    get: (path) => request('GET', path),
    post: (path, body) => request('POST', path, body),
    put: (path, body) => request('PUT', path, body),
    patch: (path, body) => request('PATCH', path, body),
    delete: (path, body) => request('DELETE', path, body),
  };
}

/** Starts one Testcontainers Postgres 16, migrates it, and builds a real createApp for tests.
 * `ratesProvider` defaults to FakeRates (deterministic fixtures) — pass a custom RatesProvider
 * to exercise edge cases (anomalous/stale rate dates) the fixtures don't cover. */
export async function startHarness(
  ratesProvider: RatesProvider = new FakeRates(),
): Promise<Harness> {
  const container: StartedPostgreSqlContainer = await new PostgreSqlContainer(
    'postgres:16-alpine',
  ).start();
  const url = container.getConnectionUri();
  await runMigrations(url);

  const { db, close: closeDb } = createDb(url);
  const rawClient = postgres(url);
  const queryDb: QueryDb = {
    query: async (sql, params) => ({ rows: await rawClient.unsafe(sql, params as never[]) }),
  };

  const mailer = new CapturingMailer();
  let now = new Date('2026-09-18T00:00:00Z');
  const clock: TestClock = {
    now: () => now,
    set: (date) => {
      now = date;
    },
  };
  const sessions = new PgSessionStore(queryDb);

  const notionFake = new FakeNotion([]);
  const notionMockApp = createNotionMockApp(notionFake);
  const notionFetch: typeof fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input.toString();
    const path = url.replace('https://notion.mock', '');
    return notionMockApp.request(path, init);
  };

  const app = createApp({
    db,
    hasher: passwordHasher,
    sessions,
    limiter: new PgRateLimiter(queryDb),
    mailer,
    secretBox: createSecretBox(TEST_SECRET_BOX_KEY),
    breachChecker: new FakeBreachChecker(),
    rates: ratesProvider,
    jobs: undefined,
    clock,
    build: { version: '0.0.0-test', sha: 'testsha' },
    google: {
      clientId: 'test-client-id',
      clientSecret: 'test-client-secret',
      appOrigin: 'https://app.test',
    },
    notion: {
      clientId: 'test-notion-client-id',
      clientSecret: 'test-notion-client-secret',
      appOrigin: 'https://app.test',
      apiBase: 'https://notion.mock',
      fetchImpl: notionFetch,
    },
  } satisfies AppDeps);

  async function asUser(email: string) {
    let [row] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    row ??= (
      await db
        .insert(users)
        .values({
          email,
          defaultCurrency: 'GBP',
          passwordHash: await passwordHasher.hash('test-password'),
        })
        .returning()
    )[0];
    if (!row) throw new Error(`asUser: could not create or find user ${email}`);

    const token = crypto.randomUUID();
    const tokenHash = await hashToken(token);
    await sessions.create({ userId: row.id, tokenHash });

    return { ...client(app, token), userId: row.id, sessionToken: token };
  }

  return {
    app,
    db,
    mailer,
    clock,
    asUser,
    notionFake,
    async close() {
      await rawClient.end();
      await closeDb();
      await container.stop();
    },
  };
}
