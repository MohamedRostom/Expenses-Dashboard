// C13: entry point for the Fly scheduled machine — runs any due background jobs once, then
// exits. node.ts's own in-process setInterval (C1) is the primary path; this is the safety net
// for when that stalls (a deploy restart racing a job, a process crash). See infra/fly/fly.toml
// for the schedule (a GitHub Actions workflow runs it via `flyctl machine run`, since the
// distroless runtime image has no shell for `ssh console -C`).
import postgres from 'postgres';
import { parseEnv } from '../env.js';
import { JobRunner } from './runner.js';
import { registerAllJobs, ensureWidgetJobs } from './register.js';
import { OpenMeteoClient } from '@desk/connectors/open-meteo/client';
import { createRatesService } from '../services/rates.js';
import { FrankfurterRates } from '@desk/connectors/rates';
import { PgRateLimiter } from '../adapters/rate-limiter.js';
import type { Db as QueryDb } from '../adapters/rate-limiter.js';
import { createDb } from '@desk/db';

const env = parseEnv(process.env);
const { db } = createDb(env.DATABASE_URL);
const rawClient = postgres(env.DATABASE_URL);
const queryDb: QueryDb = {
  query: async (sql, params) => ({ rows: await rawClient.unsafe(sql, params as never[]) }),
};

const ratesProvider = new FrankfurterRates();
const runner = new JobRunner(queryDb);
registerAllJobs({
  db,
  getRate: createRatesService(db, ratesProvider).getRate,
  ratesProvider,
  limiter: new PgRateLimiter(queryDb),
  weather: new OpenMeteoClient(env.OPEN_METEO_API_BASE ? { baseUrl: env.OPEN_METEO_API_BASE } : {}),
  enqueue: (name, payload, opts) => runner.enqueue(name, payload, opts),
});
await ensureWidgetJobs(
  db,
  (name, payload, opts) => runner.enqueue(name, payload, opts),
  new Date(),
);

await runner.runDueJobs();
await rawClient.end();
process.exit(0);
