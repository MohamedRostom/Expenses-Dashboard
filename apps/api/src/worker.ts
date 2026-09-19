import postgres from 'postgres';
import { createDb } from '@desk/db';
import pkg from '../package.json' with { type: 'json' };
import { createApp, type AppDeps } from './app.js';
import { parseWorkersBindings, type Bindings, type WorkersBindings } from './env.js';
import { HibpBreachChecker } from './adapters/breach-checker.js';
import { KvSessionStore, type KVNamespace } from './adapters/session-store-kv.js';
import { JobRunner } from './jobs/runner.js';
import { registerAllJobs } from './jobs/register.js';
import { createRatesService } from './services/rates.js';
import type { Db as QueryDb } from './adapters/rate-limiter.js';

// Stage 2 entry point (Cloudflare Workers). Same app object as node.ts, different adapter.
// T117: db (Hyperdrive) and sessions (KV) are wired for real; hasher/limiter/mailer/secretBox/
// rates/notion/google stay lazy placeholders — out of this task's scope, later tasks wire them
// the same way (ponytail: same lazy-Proxy pattern as apps/api/src/jobs/tick.ts's todoDb, now
// scoped to just the deps this task didn't name).
function notWired(name: string): never {
  throw new Error(`worker.ts: ${name} not wired yet`);
}

function buildDeps(env: WorkersBindings & Bindings, jobRunner: JobRunner): AppDeps {
  const lazy = new Proxy({}, { get: (_t, prop) => notWired(String(prop)) });
  const { db } = createDb(env.HYPERDRIVE.connectionString);
  return {
    db,
    hasher: lazy as AppDeps['hasher'],
    sessions: new KvSessionStore(env.SESSIONS_KV as KVNamespace),
    limiter: lazy as AppDeps['limiter'],
    mailer: lazy as AppDeps['mailer'],
    secretBox: lazy as AppDeps['secretBox'],
    breachChecker: new HibpBreachChecker(),
    rates: lazy as AppDeps['rates'],
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
 * port JobRunner wants — same shape as node.ts's rawClient bridge. */
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
      const jobRunner = new JobRunner(queryDbFor(bindings.HYPERDRIVE.connectionString));
      const { db } = createDb(bindings.HYPERDRIVE.connectionString);
      const deps = buildDeps(bindings, jobRunner);
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
    const jobRunner = new JobRunner(queryDbFor(bindings.HYPERDRIVE.connectionString));
    const { db } = createDb(bindings.HYPERDRIVE.connectionString);
    const deps = buildDeps(bindings, jobRunner);
    registerAllJobs({
      db,
      getRate: createRatesService(db, deps.rates).getRate,
      ratesProvider: deps.rates,
      limiter: deps.limiter,
    });
    await jobRunner.runDueJobs();
  },
};
