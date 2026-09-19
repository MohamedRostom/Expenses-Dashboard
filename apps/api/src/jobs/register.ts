// T043: wires the three job handlers into the registry. Call once at process startup (node.ts /
// worker.ts / tick.ts) once those have a real Db + RatesProvider to hand in — not called from
// jobs/index.ts itself to avoid a registry <-> handler import cycle.
import type { RatesProvider } from '@desk/connectors/rates';
import type { Db } from '@desk/db';
import { registerJob } from './index.js';
import {
  currencyChangeJob,
  categoriesRowSource,
  expensesRowSource,
  combinedRowSource,
  type RateLookup,
} from './currency-change.js';
import { ratesWarmJob, ratesRetryJob } from './rates.js';
import { housekeepingJob } from './housekeeping.js';
import { notionSyncJob, type NotionSyncDeps } from './notion-sync.js';
import { feedbackDigestJob, type FeedbackDigestDeps } from './feedback-digest.js';
import type { RateLimiter } from '../adapters/rate-limiter.js';

export function registerAllJobs(deps: {
  db: Db;
  getRate: RateLookup;
  ratesProvider: RatesProvider;
  limiter: RateLimiter;
  /** Undefined until the Notion OAuth pair (env.ts NOTION_CLIENT_ID/SECRET) is configured. */
  notionSync?: NotionSyncDeps;
  /** T112: always registered — feedbackDigestJob itself no-ops the send when digestEmail is unset. */
  feedbackDigest?: FeedbackDigestDeps;
}): void {
  registerJob(
    'currency.change',
    currencyChangeJob(
      deps.getRate,
      combinedRowSource(categoriesRowSource(deps.db), expensesRowSource(deps.db)),
    ),
  );
  registerJob('rates.warm', ratesWarmJob(deps.db, deps.ratesProvider));
  registerJob('rates.retry', ratesRetryJob(deps.db));
  registerJob('housekeeping', housekeepingJob(deps.db, deps.limiter));
  if (deps.notionSync) registerJob('notion.sync', notionSyncJob(deps.notionSync));
  if (deps.feedbackDigest) registerJob('feedback.digest', feedbackDigestJob(deps.feedbackDigest));
}
