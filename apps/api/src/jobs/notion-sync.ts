// T080: notion.sync job — applies one user's sync, then reschedules itself 5 minutes out
// (research.md R8's "runs every 5 minutes per connected user"). Self-rescheduling keeps this
// working with JobRunner.runDueJobs' plain "due jobs" polling without a separate cron table.
import type { JobHandler } from './index.js';
import type { NotionService } from '../services/notion.js';

const RESYNC_INTERVAL_MS = 5 * 60 * 1000;

export type NotionSyncDeps = {
  notion: NotionService;
  enqueue: (
    name: string,
    payload: unknown,
    opts?: { userId?: string; runAfter?: Date },
  ) => Promise<string>;
};

export function notionSyncJob(deps: NotionSyncDeps): JobHandler {
  return async (payload) => {
    const { userId } = payload as { userId: string };
    await deps.notion.applySync(userId);
    await deps.enqueue(
      'notion.sync',
      { userId },
      { userId, runAfter: new Date(Date.now() + RESYNC_INTERVAL_MS) },
    );
  };
}
