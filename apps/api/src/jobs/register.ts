// T043: wires the three job handlers into the registry. Call once at process startup (node.ts /
// worker.ts / tick.ts) once those have a real Db + RatesProvider to hand in — not called from
// jobs/index.ts itself to avoid a registry <-> handler import cycle.
import type { RatesProvider } from '@desk/connectors/rates';
import type { Db } from '@desk/db';
import { registerJob } from './index.js';
import { currencyChangeJob, categoriesRowSource, type RateLookup } from './currency-change.js';
import { ratesWarmJob, ratesRetryJob } from './rates.js';
import { housekeepingJob } from './housekeeping.js';
import type { RateLimiter } from '../adapters/rate-limiter.js';

export function registerAllJobs(deps: {
  db: Db;
  getRate: RateLookup;
  ratesProvider: RatesProvider;
  limiter: RateLimiter;
}): void {
  registerJob('currency.change', currencyChangeJob(deps.getRate, categoriesRowSource(deps.db)));
  registerJob('rates.warm', ratesWarmJob(deps.db, deps.ratesProvider));
  registerJob('rates.retry', ratesRetryJob(deps.db));
  registerJob('housekeeping', housekeepingJob(deps.db, deps.limiter));
}
