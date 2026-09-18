// Entry point for the Fly scheduled machine: runs any due background jobs once, then exits.
// See infra/fly/fly.toml for the schedule and packages/db seed/migrate for how jobs get queued.
// ponytail: real Db wiring (pg pool) lands with the DB adapter task; this throws until then.
import { JobRunner } from './runner.js';
import type { Db } from '../adapters/rate-limiter.js';

function todoDb(): Db {
  throw new Error('jobs:tick — Db wiring not implemented yet');
}

await new JobRunner(todoDb()).runDueJobs();
process.exit(0);
