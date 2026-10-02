// T061: daily housekeeping for idle users' panels cache (data-model.md FR-012). Mirrors
// panels-scheduler.ts's ensure-once-per-restart pattern.
import { and, eq, inArray, lt } from 'drizzle-orm';
import type { Db } from '@desk/db';
import {
  auditLog,
  cachedEvents,
  cachedMessages,
  connectedAccounts,
  jobs as jobsTable,
  users,
} from '@desk/db';
import type { JobHandler } from './index.js';
import type { Clock } from '../app.js';

const PURGE_INTERVAL_MS = 24 * 60 * 60 * 1000; // 1 day
const IDLE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export type PanelsPurgeDeps = {
  db: Db;
  clock: Clock;
  enqueue: (
    name: string,
    payload: unknown,
    opts?: { userId?: string; runAfter?: Date },
  ) => Promise<string>;
  /** JobRunner.cancelForUser — stops a running/queued panels.refresh from repopulating the
   * cache right after this job deletes it. */
  cancelForUser: (userId: string) => Promise<void>;
};

export function panelsPurgeJob(deps: PanelsPurgeDeps): JobHandler {
  return async () => {
    const now = deps.clock.now();
    const cutoff = new Date(now.getTime() - IDLE_MS);

    const idleUsers = await deps.db
      .select({ id: users.id })
      .from(users)
      .where(lt(users.lastActiveAt, cutoff));

    for (const { id: userId } of idleUsers) {
      await deps.cancelForUser(userId);
      await deps.db.delete(cachedEvents).where(eq(cachedEvents.userId, userId));
      await deps.db.delete(cachedMessages).where(eq(cachedMessages.userId, userId));
      await deps.db
        .update(connectedAccounts)
        .set({ cachePurgedAt: now })
        .where(eq(connectedAccounts.userId, userId));
      await deps.db.insert(auditLog).values({
        userId,
        actor: 'system',
        action: 'purge',
        subject: userId,
      });
    }

    // Re-enqueue the purge for +1 day.
    await deps.enqueue(
      'panels.purge',
      {},
      { runAfter: new Date(now.getTime() + PURGE_INTERVAL_MS) },
    );
  };
}

/** Enqueues the recurring purge unless one is already queued or running, so app restarts don't
 * stack up parallel purge chains. */
export async function ensurePanelsPurge(
  db: Db,
  enqueue: (name: string, payload: unknown, opts?: { runAfter?: Date }) => Promise<string>,
  now: Date,
): Promise<void> {
  const [existing] = await db
    .select({ id: jobsTable.id })
    .from(jobsTable)
    .where(
      and(eq(jobsTable.name, 'panels.purge'), inArray(jobsTable.status, ['queued', 'running'])),
    )
    .limit(1);
  if (!existing) await enqueue('panels.purge', {}, { runAfter: now });
}
