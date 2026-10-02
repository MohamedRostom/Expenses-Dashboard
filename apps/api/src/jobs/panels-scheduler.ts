import { and, eq, inArray, isNull, notInArray, lte, sql } from 'drizzle-orm';
import type { Db } from '@desk/db';
import { connectedAccounts, jobs as jobsTable } from '@desk/db';
import type { JobHandler } from './index.js';
import type { Clock } from '../app.js';

const SCHEDULER_INTERVAL_MS = 60 * 1000; // 1 minute

export type PanelsSchedulerDeps = {
  db: Db;
  clock: Clock;
  enqueue: (
    name: string,
    payload: unknown,
    opts?: { userId?: string; runAfter?: Date },
  ) => Promise<string>;
};

export function panelsSchedulerJob(deps: PanelsSchedulerDeps): JobHandler {
  return async () => {
    const now = deps.clock.now();

    // Find all unpaused, non-error accounts whose next_refresh_at is due
    const dueAccounts = await deps.db
      .select()
      .from(connectedAccounts)
      .where(
        and(
          isNull(connectedAccounts.pausedAt),
          notInArray(connectedAccounts.status, ['error']),
          lte(connectedAccounts.nextRefreshAt, now),
        ),
      );

    // Enqueue one job per account, deduped (check if one is already pending/running)
    for (const account of dueAccounts) {
      // Check if a panels.refresh job is already queued for this account
      const existingJob = await deps.db
        .select()
        .from(jobsTable)
        .where(
          and(
            eq(jobsTable.name, 'panels.refresh'),
            inArray(jobsTable.status, ['queued', 'running']),
            sql`${jobsTable.payload}->>'accountId' = ${account.id}`,
          ),
        )
        .limit(1);

      // Only enqueue if no pending job exists for this account
      if (existingJob.length === 0) {
        await deps.enqueue('panels.refresh', { accountId: account.id }, { userId: account.userId });
      }
    }

    // Re-enqueue the scheduler for +1 minute
    await deps.enqueue(
      'panels.scheduler',
      {},
      { runAfter: new Date(now.getTime() + SCHEDULER_INTERVAL_MS) },
    );
  };
}

/** Enqueues the recurring scheduler unless one is already queued or running, so app restarts
 * don't stack up parallel scheduler chains. */
export async function ensurePanelsScheduler(
  db: Db,
  enqueue: (name: string, payload: unknown, opts?: { runAfter?: Date }) => Promise<string>,
  now: Date,
): Promise<void> {
  const [existing] = await db
    .select({ id: jobsTable.id })
    .from(jobsTable)
    .where(
      and(eq(jobsTable.name, 'panels.scheduler'), inArray(jobsTable.status, ['queued', 'running'])),
    )
    .limit(1);
  if (!existing) await enqueue('panels.scheduler', {}, { runAfter: now });
}
