import { and, eq, isNull } from 'drizzle-orm';
import type { Db } from '@desk/db';
import { connectedAccounts, users } from '@desk/db';
import type { TodayResponseT, TodayAccountT } from '@desk/contracts';
import type { Clock } from '../app.js';
import { tierFor } from '@desk/core';

export type PanelsServiceDeps = {
  db: Db;
  clock: Clock;
  enqueue: (
    name: string,
    payload: unknown,
    opts?: { userId?: string; runAfter?: Date },
  ) => Promise<string>;
};

export class PanelsService {
  constructor(private deps: PanelsServiceDeps) {}

  /** Mark unpaused accounts older than olderThanMs as due and enqueue their refresh.
   * Returns the ids of accounts marked due. */
  async markDue(userId: string, olderThanMs: number): Promise<string[]> {
    const now = this.deps.clock.now();
    const cutoff = new Date(now.getTime() - olderThanMs);

    // Find unpaused accounts whose last_refresh_at is null or older than cutoff
    const accountsToRefresh = await this.deps.db
      .select()
      .from(connectedAccounts)
      .where(
        and(
          eq(connectedAccounts.userId, userId),
          isNull(connectedAccounts.pausedAt),
          // last_refresh_at is null OR older than cutoff
          // Using raw SQL for OR condition on null check
        ),
      );

    // Filter in JavaScript since Drizzle's OR with null is complex
    const due = accountsToRefresh.filter(
      (a) => !a.lastRefreshAt || a.lastRefreshAt.getTime() < cutoff.getTime(),
    );

    const ids: string[] = [];
    for (const account of due) {
      // Set next_refresh_at = now to mark as due
      await this.deps.db
        .update(connectedAccounts)
        .set({ nextRefreshAt: now })
        .where(eq(connectedAccounts.id, account.id));

      // Enqueue refresh with dedup (same as scheduler does)
      await this.deps.enqueue('panels.refresh', { accountId: account.id }, { userId });
      ids.push(account.id);
    }

    return ids;
  }

  /** Throws not_found unless the account exists and belongs to the user. */
  async assertOwned(userId: string, accountId: string): Promise<void> {
    const [account] = await this.deps.db
      .select({ id: connectedAccounts.id })
      .from(connectedAccounts)
      .where(and(eq(connectedAccounts.id, accountId), eq(connectedAccounts.userId, userId)));
    if (!account) throw new Error('not_found');
  }

  /** Enqueue a refresh for a specific account, owned by the user.
   * Throws not_found if the account doesn't exist or isn't owned. */
  async refreshNow(userId: string, accountId: string): Promise<void> {
    const [account] = await this.deps.db
      .select()
      .from(connectedAccounts)
      .where(and(eq(connectedAccounts.id, accountId), eq(connectedAccounts.userId, userId)));

    if (!account) {
      throw new Error('not_found');
    }

    // Enqueue refresh directly (even for error status)
    await this.deps.enqueue('panels.refresh', { accountId }, { userId });
  }

  /** Build the Today payload for a user. */
  async todayPayload(userId: string, now: Date): Promise<TodayResponseT> {
    // Load user for tier calculation
    const [user] = await this.deps.db.select().from(users).where(eq(users.id, userId));

    if (!user) {
      throw new Error('User not found');
    }

    // Load accounts
    const accounts = await this.deps.db
      .select()
      .from(connectedAccounts)
      .where(eq(connectedAccounts.userId, userId));

    // Determine refresh tier
    const tier = tierFor(user.lastActiveAt, now);

    // Build accounts array (no cache data yet; Phase 3/4 fills these in)
    const accountsPayload: TodayAccountT[] = accounts.map((a) => ({
      id: a.id,
      provider: a.provider as 'google' | 'microsoft' | 'standards',
      label: a.label,
      colour: a.colour ?? 'teal',
      capabilities: a.capabilities as ('mail' | 'calendar')[],
      status: (a.pausedAt ? 'paused' : a.status) as TodayAccountT['status'],
      lastRefreshAt: a.lastRefreshAt ? a.lastRefreshAt.toISOString() : null,
      lastError: a.lastError,
      // FR-014: stale = last successful refresh older than the tier's interval.
      stale: a.lastRefreshAt
        ? now.getTime() - a.lastRefreshAt.getTime() > (tier === 'active' ? 5 : 60) * 60_000
        : true,
      purged: !!a.cachePurgedAt,
      unreadCount: a.unreadTotal ?? 0,
    }));

    // Empty days for now (Phase 3 fills with events)
    // FR-006: seven display days, today to today plus six, in the user's time zone.
    const localToday = new Intl.DateTimeFormat('en-CA', {
      timeZone: user.timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now);
    const [y, m, d] = localToday.split('-').map(Number) as [number, number, number];
    // Contract: empty arrays when nothing is connected.
    const days =
      accounts.length === 0
        ? []
        : Array.from({ length: 7 }, (_, i) => ({
            date: new Date(Date.UTC(y, m - 1, d + i)).toISOString().slice(0, 10),
            events: [],
          }));

    return {
      days,
      messages: [], // Phase 4 fills with messages
      accounts: accountsPayload,
      generatedAt: now.toISOString(),
    };
  }
}
