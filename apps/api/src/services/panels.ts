import { and, eq, gt, isNull, lt } from 'drizzle-orm';
import type { Db } from '@desk/db';
import { accountCalendars, cachedEvents, cachedMessages, connectedAccounts, users } from '@desk/db';
import type { TodayResponseT, TodayAccountT, TodayEventT, TodayMessageT } from '@desk/contracts';
import type { Clock } from '../app.js';
import {
  tierFor,
  expandToDays,
  mergeMessages,
  unreadCountFor,
  type Occurrence,
  type MessageRow,
} from '@desk/core';

const DAY_MS = 24 * 60 * 60 * 1000;

export type PanelsServiceDeps = {
  db: Db;
  clock: Clock;
  /** Used to build reconnectUrl: the Connections page, which starts the reconnect flow (a link cannot POST). */
  appOrigin: string;
  enqueue: (
    name: string,
    payload: unknown,
    opts?: { userId?: string; runAfter?: Date },
  ) => Promise<string>;
};

type EventOccurrence = Occurrence & {
  id: string;
  accountId: string;
  title: string;
  location: string | null;
  link: string | null;
};

/** cached_messages row shape mergeMessages/unreadCountFor operate on, plus its own id and
 * accountId (mergeMessages only adds accountId to the row it's given). */
type MessageDbRow = MessageRow & { id: string; accountId: string };

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

    // FR-012: cached_messages of unpaused accounts only — paused accounts contribute neither
    // messages nor unread count, same as a paused account's calendars below.
    const messageRows: MessageDbRow[] =
      accounts.length === 0
        ? []
        : (
            await this.deps.db
              .select({
                id: cachedMessages.id,
                accountId: cachedMessages.accountId,
                providerMessageId: cachedMessages.providerMessageId,
                fromName: cachedMessages.fromName,
                fromAddress: cachedMessages.fromAddress,
                subject: cachedMessages.subject,
                preview: cachedMessages.preview,
                receivedAt: cachedMessages.receivedAt,
                unread: cachedMessages.unread,
                link: cachedMessages.link,
              })
              .from(cachedMessages)
              .innerJoin(connectedAccounts, eq(cachedMessages.accountId, connectedAccounts.id))
              .where(and(eq(connectedAccounts.userId, userId), isNull(connectedAccounts.pausedAt)))
          ).map(({ fromName, link, ...r }) => ({
            ...r,
            ...(fromName !== null && { fromName }),
            ...(link !== null && { link }),
          }));

    const messagesByAccount: Record<string, MessageDbRow[]> = {};
    for (const r of messageRows) (messagesByAccount[r.accountId] ??= []).push(r);

    // Build accounts array
    const accountsPayload: TodayAccountT[] = accounts.map((a) => {
      const status = (a.pausedAt ? 'paused' : a.status) as TodayAccountT['status'];
      return {
        id: a.id,
        provider: a.provider as 'google' | 'microsoft' | 'standards',
        label: a.label,
        colour: a.colour ?? 'teal',
        capabilities: a.capabilities as ('mail' | 'calendar')[],
        status,
        lastRefreshAt: a.lastRefreshAt ? a.lastRefreshAt.toISOString() : null,
        lastError: a.lastError,
        // FR-014: stale = last successful refresh older than the tier's interval.
        stale: a.lastRefreshAt
          ? now.getTime() - a.lastRefreshAt.getTime() > (tier === 'active' ? 5 : 60) * 60_000
          : true,
        purged: !!a.cachePurgedAt,
        unreadCount: unreadCountFor(messagesByAccount[a.id] ?? [], a.unreadTotal ?? undefined),
        ...(status === 'reconnect_needed' && {
          reconnectUrl: `${this.deps.appOrigin}/settings/connections?reconnect=${a.id}`,
        }),
      };
    });

    // FR-012: newest first across every account, capped at the newest fifty per account (the
    // refresh job already trims cached_messages to fifty; mergeMessages re-applies the cap so
    // the contract holds even if a row ever slips past that trim).
    const messages: TodayMessageT[] = mergeMessages(messagesByAccount).map((m) => ({
      id: m.id,
      accountId: m.accountId,
      fromName: m.fromName ?? '',
      fromAddress: m.fromAddress,
      subject: m.subject,
      preview: m.preview,
      receivedAt: m.receivedAt.toISOString(),
      unread: m.unread,
      link: m.link ?? null,
    }));

    // FR-006: seven display days, today to today plus six, in the user's time zone; events read
    // from unpaused accounts' enabled calendars, overlapping yesterday..today+7 (same test the
    // refresh job trims by, so a row that survives the trim is always readable here).
    const from = new Date(now.getTime() - DAY_MS);
    const to = new Date(now.getTime() + 8 * DAY_MS);
    const eventRows =
      accounts.length === 0
        ? []
        : await this.deps.db
            .select({
              id: cachedEvents.id,
              accountId: cachedEvents.accountId,
              title: cachedEvents.title,
              startsAt: cachedEvents.startsAt,
              endsAt: cachedEvents.endsAt,
              allDay: cachedEvents.allDay,
              location: cachedEvents.location,
              tentative: cachedEvents.tentative,
              link: cachedEvents.link,
            })
            .from(cachedEvents)
            .innerJoin(accountCalendars, eq(cachedEvents.calendarId, accountCalendars.id))
            .innerJoin(connectedAccounts, eq(cachedEvents.accountId, connectedAccounts.id))
            .where(
              and(
                eq(connectedAccounts.userId, userId),
                isNull(connectedAccounts.pausedAt),
                eq(accountCalendars.enabled, true),
                lt(cachedEvents.startsAt, to),
                gt(cachedEvents.endsAt, from),
              ),
            );

    const occurrences: EventOccurrence[] = eventRows.map((r) => ({
      ...r,
      declined: false,
    }));
    // Contract: empty arrays when nothing is connected.
    const days =
      accounts.length === 0
        ? []
        : expandToDays(occurrences, user.timeZone, now).map((bucket) => ({
            date: bucket.date,
            events: bucket.events.map((e): TodayEventT => ({
              id: e.id,
              accountId: e.accountId,
              title: e.title,
              startsAt: e.startsAt.toISOString(),
              endsAt: e.endsAt.toISOString(),
              allDay: e.allDay,
              location: e.location,
              tentative: e.tentative,
              link: e.link,
            })),
          }));

    return {
      days,
      messages,
      accounts: accountsPayload,
      generatedAt: now.toISOString(),
    };
  }
}
