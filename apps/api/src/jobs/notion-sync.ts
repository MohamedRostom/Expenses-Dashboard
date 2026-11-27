// T080: notion.sync job — applies one user's sync, then reschedules itself 5 minutes out
// (research.md R8's "runs every 5 minutes per connected user"). Self-rescheduling keeps this
// working with JobRunner.runDueJobs' plain "due jobs" polling without a separate cron table.
// Spec 005: a connection that needs the user (reconnect_needed) or is gone stops the loop.
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
  clock?: { now(): Date };
};

export function notionSyncJob(deps: NotionSyncDeps): JobHandler {
  return async (payload) => {
    const { userId } = payload as { userId: string };
    const { status } = await deps.notion.applySync(userId);
    if (status === 'reconnect_needed' || status === 'disconnected') return;
    const now = deps.clock?.now() ?? new Date();
    await deps.enqueue(
      'notion.sync',
      { userId },
      { userId, runAfter: new Date(now.getTime() + RESYNC_INTERVAL_MS) },
    );
  };
}
