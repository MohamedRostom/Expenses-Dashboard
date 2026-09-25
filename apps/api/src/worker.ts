import postgres from 'postgres';
import { createDb } from '@desk/db';
import pkg from '../package.json' with { type: 'json' };
import { createApp, type AppDeps } from './app.js';
import { parseWorkersBindings, type Bindings, type WorkersBindings } from './env.js';
import { passwordHasher } from './adapters/password.js';
import { PgRateLimiter } from './adapters/rate-limiter.js';
import { ResendMailer, type Mailer } from './adapters/mailer.js';
import { createSecretBox, type SecretBox } from './adapters/secret-box.js';
import { HibpBreachChecker } from './adapters/breach-checker.js';
import { KvSessionStore, type KVNamespace } from './adapters/session-store-kv.js';
import { FrankfurterRates } from '@desk/connectors/rates';
import { JobRunner } from './jobs/runner.js';
import { registerAllJobs } from './jobs/register.js';
import { createRatesService } from './services/rates.js';
import type { Db as QueryDb } from './adapters/rate-limiter.js';

// Stage 2 entry point (Cloudflare Workers). Same app object as node.ts, different adapter.
// T117 wired db (Hyperdrive) and sessions (KV) for real. T125 wires the rest: hasher, limiter
// and rates need no secret Rostom hasn't provisioned yet, so they're real adapters unconditionally
// (identical to node.ts). mailer/secretBox need RESEND_API_KEY/SECRET_BOX_KEY as Cloudflare
// secrets (CLAUDE.md to-do, not yet created) — real when present, otherwise this placeholder,
// so /healthz and every route that doesn't touch mail or connector tokens still works today.
function notWired(name: string): never {
  throw new Error(`worker.ts: ${name} not wired yet — set it with 'wrangler secret put'`);
}

/** Exported for worker.test.ts (T125) — builds every AppDeps adapter without touching the
 * network (postgres.js/ResendMailer/FrankfurterRates all connect lazily, on first real call). */
export function buildDeps(
  env: WorkersBindings & Bindings,
  jobRunner: JobRunner,
  queryDb: QueryDb,
): AppDeps {
  const { db } = createDb(env.HYPERDRIVE.connectionString);
  const mailer: Mailer = env.RESEND_API_KEY
    ? new ResendMailer(env.RESEND_API_KEY, env.MAIL_FROM ?? 'noreply@example.com')
    : (new Proxy({}, { get: () => notWired('mailer') }) as Mailer);
  const secretBox: SecretBox = env.SECRET_BOX_KEY
    ? createSecretBox(env.SECRET_BOX_KEY)
    : (new Proxy({}, { get: () => notWired('secretBox') }) as SecretBox);
  return {
    db,
    hasher: passwordHasher,
    sessions: new KvSessionStore(env.SESSIONS_KV as KVNamespace),
    limiter: new PgRateLimiter(queryDb),
    mailer,
    secretBox,
    breachChecker: new HibpBreachChecker(),
    rates: new FrankfurterRates(),
    jobs: jobRunner,
    clock: { now: () => new Date() },
    build: { version: pkg.version, sha: env.GIT_SHA },
    appOrigin: env.APP_ORIGIN,
    // Not wired until a later task adds Cloudflare secrets — /auth/google/* and /notion/* 404
    // on Workers for now.
    google: undefined,
    notion: undefined,
  };
}

/** Bridges postgres.js (over the Hyperdrive connection string) to the `.query(sql, params)`
 * port JobRunner/PgRateLimiter want — same shape as node.ts's rawClient bridge. */
function queryDbFor(connectionString: string): QueryDb {
  const client = postgres(connectionString);
  return {
    query: async (sql, params) => ({ rows: await client.unsafe(sql, params as never[]) }),
  };
}

// C1: registerJob just replaces a Map entry, so calling registerAllJobs on every cold start
// (fetch) and every cron tick (scheduled) below is idempotent — no separate registration guard.
let app: ReturnType<typeof createApp> | undefined;

export default {
  async fetch(request: Request, env: unknown): Promise<Response> {
    // Bindings are fixed per isolate, so validating and building once is safe.
    if (!app) {
      const bindings = parseWorkersBindings(env);
      const queryDb = queryDbFor(bindings.HYPERDRIVE.connectionString);
      const jobRunner = new JobRunner(queryDb);
      const { db } = createDb(bindings.HYPERDRIVE.connectionString);
      const deps = buildDeps(bindings, jobRunner, queryDb);
      registerAllJobs({
        db,
        getRate: createRatesService(db, deps.rates).getRate,
        ratesProvider: deps.rates,
        limiter: deps.limiter,
      });
      app = createApp(deps);
    }
    return app.fetch(request);
  },

  // T117: cron trigger (see infra/cloudflare/wrangler.toml [triggers]) — runs any due jobs
  // once per invocation, same job table/handlers as the Fly `jobs:tick` scheduled machine.
  async scheduled(_event: unknown, env: unknown): Promise<void> {
    const bindings = parseWorkersBindings(env);
    const queryDb = queryDbFor(bindings.HYPERDRIVE.connectionString);
    const jobRunner = new JobRunner(queryDb);
    const { db } = createDb(bindings.HYPERDRIVE.connectionString);
    const deps = buildDeps(bindings, jobRunner, queryDb);
    registerAllJobs({
      db,
      getRate: createRatesService(db, deps.rates).getRate,
      ratesProvider: deps.rates,
      limiter: deps.limiter,
    });
    await jobRunner.runDueJobs();
  },
};
