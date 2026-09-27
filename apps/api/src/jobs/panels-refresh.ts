import { and, desc, eq, gt, inArray, lt, notInArray } from 'drizzle-orm';
import type { Db } from '@desk/db';
import {
  accountCalendars,
  cachedEvents,
  cachedMessages,
  connectedAccounts,
  resolveFlag,
  users,
} from '@desk/db';
import type { JobHandler } from './index.js';
import type { SecretBox } from '../adapters/secret-box.js';
import type { Clock } from '../app.js';
import { tierFor, nextDueAt, statusAfterFailures } from '@desk/core';
import {
  AuthError,
  RateLimited,
  type CalendarSource,
  type MailSource,
} from '@desk/connectors/panels';
import { openCredential, sealCredential, type StandardsCredential } from '../lib/credential.js';

const DAY_MS = 24 * 60 * 60 * 1000;

export type PanelsRefreshDeps = {
  db: Db;
  secretBox: SecretBox;
  clock: Clock;
  /** Real calendar sources per provider; a provider with no source configured is treated as a
   * plain provider failure (not a crash) rather than being skipped silently. */
  calendarSources?: Partial<Record<'google' | 'microsoft' | 'standards', CalendarSource>>;
  /** Real mail sources per provider; same "no source configured is a crash, not a skip" rule
   * as calendarSources — except a Google account is skipped (not a crash) when the
   * panels.google_mail flag is off for that user, since no source may be registered at all. */
  mailSources?: Partial<Record<'google' | 'microsoft' | 'standards', MailSource>>;
};

type ConnectedAccountRow = typeof connectedAccounts.$inferSelect;

/** The two sealed credential shapes a connected_accounts row can hold (lib/credential.ts). */
type AccountCredential = { refreshToken: string } | StandardsCredential;

/** Builds the `cred` object a CalendarSource/MailSource actually reads: the OAuth shape
 * (`{ refreshToken }`) unchanged for google/microsoft, or the merged IMAP+CalDAV shape a
 * standards account's sources pick their own fields from (ImapMailSource: host/port/tls/
 * username/password; the CalDAV client: url/username/password) — one shape covers both since
 * each source only reads what it needs, and the account's own address is always the login
 * username (T070 never stores a separate one). */
function credentialFor(account: ConnectedAccountRow, raw: AccountCredential): unknown {
  if (account.provider !== 'standards') return raw;
  const sc = raw as StandardsCredential;
  return {
    host: sc.imapHost,
    port: sc.imapPort,
    tls: sc.imapPort === 993,
    url: sc.caldavUrl,
    username: account.address,
    password: sc.password,
  };
}

/** T034: refreshes an account's enabled calendars into cached_events. No-op unless the account
 * has the 'calendar' capability. Returns the last rotatedCredential seen across all calendars
 * (the caller re-seals and stores it). */
async function refreshCalendar(
  deps: PanelsRefreshDeps,
  account: ConnectedAccountRow,
  credential: AccountCredential,
  now: Date,
): Promise<{ rotatedCredential?: unknown }> {
  if (!account.capabilities.includes('calendar')) return {};

  const source = deps.calendarSources?.[account.provider as 'google' | 'microsoft' | 'standards'];
  if (!source) {
    throw new Error(`panels.refresh: no calendar source configured for ${account.provider}`);
  }
  const cred = credentialFor(account, credential);

  let rotatedCredential: unknown;
  const from = new Date(now.getTime() - DAY_MS);
  const to = new Date(now.getTime() + 8 * DAY_MS);

  let calendars = await deps.db
    .select()
    .from(accountCalendars)
    .where(eq(accountCalendars.accountId, account.id));

  if (calendars.length === 0) {
    const listed = await source.listCalendars(cred);
    const inserted = [];
    for (const cal of listed) {
      const [row] = await deps.db
        .insert(accountCalendars)
        .values({
          userId: account.userId,
          accountId: account.id,
          providerCalendarId: cal.id,
          name: cal.name,
          isPrimary: cal.isPrimary,
          enabled: cal.isPrimary,
          colour: cal.colour ?? null,
        })
        .returning();
      if (row) inserted.push(row);
    }
    calendars = inserted;
  }

  for (const calendar of calendars) {
    if (!calendar.enabled) continue;

    const result = await source.fetchWindow(
      cred,
      [calendar.providerCalendarId],
      from,
      to,
      calendar.cursor ?? undefined,
    );
    if (result.rotatedCredential) rotatedCredential = result.rotatedCredential;

    const keptIds: string[] = [];
    for (const ev of result.events) {
      if (ev.declined) continue;
      keptIds.push(ev.providerEventId);
      await deps.db
        .insert(cachedEvents)
        .values({
          userId: account.userId,
          accountId: account.id,
          calendarId: calendar.id,
          providerEventId: ev.providerEventId,
          title: ev.title,
          startsAt: ev.startsAt,
          endsAt: ev.endsAt,
          allDay: ev.allDay,
          timeZone: ev.timeZone ?? null,
          location: ev.location ?? null,
          tentative: ev.tentative,
          link: ev.link ?? null,
          seenAt: now,
        })
        .onConflictDoUpdate({
          target: [cachedEvents.calendarId, cachedEvents.providerEventId],
          set: {
            title: ev.title,
            startsAt: ev.startsAt,
            endsAt: ev.endsAt,
            allDay: ev.allDay,
            timeZone: ev.timeZone ?? null,
            location: ev.location ?? null,
            tentative: ev.tentative,
            link: ev.link ?? null,
            seenAt: now,
            updatedAt: now,
          },
        });
    }

    if (result.full) {
      if (keptIds.length > 0) {
        await deps.db
          .delete(cachedEvents)
          .where(
            and(
              eq(cachedEvents.calendarId, calendar.id),
              notInArray(cachedEvents.providerEventId, keptIds),
            ),
          );
      } else {
        await deps.db.delete(cachedEvents).where(eq(cachedEvents.calendarId, calendar.id));
      }
    } else if (result.deletedIds && result.deletedIds.length > 0) {
      await deps.db
        .delete(cachedEvents)
        .where(
          and(
            eq(cachedEvents.calendarId, calendar.id),
            inArray(cachedEvents.providerEventId, result.deletedIds),
          ),
        );
    }

    await deps.db
      .update(accountCalendars)
      .set({ cursor: result.cursor ?? null, updatedAt: now })
      .where(eq(accountCalendars.id, calendar.id));
  }

  // Trim rows that no longer overlap yesterday..today+7, across every calendar of this account.
  await deps.db.delete(cachedEvents).where(
    and(
      eq(cachedEvents.accountId, account.id),
      // ends_at < now - 1d OR starts_at > now + 8d
      // (kept as two statements combined below with `and`/`lt`/`gt` — see below)
      lt(cachedEvents.endsAt, from),
    ),
  );
  await deps.db
    .delete(cachedEvents)
    .where(and(eq(cachedEvents.accountId, account.id), gt(cachedEvents.startsAt, to)));

  return rotatedCredential !== undefined ? { rotatedCredential } : {};
}

/** T050: refreshes an account's inbox into cached_messages. No-op unless the account has the
 * 'mail' capability. A Google account is also a no-op (not an error) while panels.google_mail
 * is off for its user — CASA gates Gmail production use per ADR-0004, so there may be no Gmail
 * source registered at all yet. Returns the last rotatedCredential seen (the caller re-seals and
 * stores it), mirroring refreshCalendar. */
async function refreshMail(
  deps: PanelsRefreshDeps,
  account: ConnectedAccountRow,
  credential: AccountCredential,
  now: Date,
): Promise<{ rotatedCredential?: unknown }> {
  if (!account.capabilities.includes('mail')) return {};

  const provider = account.provider as 'google' | 'microsoft' | 'standards';
  if (provider === 'google') {
    const googleMailOn = await resolveFlag(deps.db, account.userId, 'panels.google_mail');
    if (!googleMailOn) return {};
  }

  const source = deps.mailSources?.[provider];
  if (!source) {
    throw new Error(`panels.refresh: no mail source configured for ${provider}`);
  }

  const result = await source.fetchInbox(
    credentialFor(account, credential),
    50,
    account.mailCursor ?? undefined,
  );

  const keptIds: string[] = [];
  for (const m of result.messages) {
    keptIds.push(m.providerMessageId);
    const values = {
      fromName: m.fromName ?? null,
      fromAddress: m.fromAddress,
      subject: m.subject,
      preview: m.preview,
      receivedAt: m.receivedAt,
      unread: m.unread,
      link: m.link ?? null,
      seenAt: now,
    };
    await deps.db
      .insert(cachedMessages)
      .values({
        userId: account.userId,
        accountId: account.id,
        providerMessageId: m.providerMessageId,
        ...values,
      })
      .onConflictDoUpdate({
        target: [cachedMessages.accountId, cachedMessages.providerMessageId],
        set: { ...values, updatedAt: now },
      });
  }

  if (result.full) {
    if (keptIds.length > 0) {
      await deps.db
        .delete(cachedMessages)
        .where(
          and(
            eq(cachedMessages.accountId, account.id),
            notInArray(cachedMessages.providerMessageId, keptIds),
          ),
        );
    } else {
      await deps.db.delete(cachedMessages).where(eq(cachedMessages.accountId, account.id));
    }
  }

  // Trim to the newest fifty rows for this account (data-model.md cached_messages), whether the
  // fetch was full or incremental — an incremental append can push the total past fifty.
  const overflow = await deps.db
    .select({ id: cachedMessages.id })
    .from(cachedMessages)
    .where(eq(cachedMessages.accountId, account.id))
    .orderBy(desc(cachedMessages.receivedAt))
    .offset(50);
  if (overflow.length > 0) {
    await deps.db.delete(cachedMessages).where(
      inArray(
        cachedMessages.id,
        overflow.map((r) => r.id),
      ),
    );
  }

  await deps.db
    .update(connectedAccounts)
    .set({
      mailCursor: result.cursor ?? null,
      unreadTotal: result.unreadTotal ?? null,
      updatedAt: now,
    })
    .where(eq(connectedAccounts.id, account.id));

  return result.rotatedCredential !== undefined
    ? { rotatedCredential: result.rotatedCredential }
    : {};
}

export function panelsRefreshJob(deps: PanelsRefreshDeps): JobHandler {
  return async (payload) => {
    const { accountId } = payload as { accountId: string };
    const now = deps.clock.now();

    // Load the account
    const [account] = await deps.db
      .select()
      .from(connectedAccounts)
      .where(eq(connectedAccounts.id, accountId));

    if (!account) {
      // Account may have been deleted; silently exit
      return;
    }

    // Load the user to determine refresh tier
    const [user] = await deps.db.select().from(users).where(eq(users.id, account.userId));

    if (!user) {
      return;
    }

    // Determine the tier based on last_active_at
    const tier = tierFor(user.lastActiveAt, now);

    try {
      const credential = await openCredential<AccountCredential>(
        deps.secretBox,
        account.credentialEnc,
      );

      const calendarResult = await refreshCalendar(deps, account, credential, now);
      const mailResult = await refreshMail(deps, account, credential, now);

      // The last rotatedCredential seen wins.
      const rotatedCredential = calendarResult.rotatedCredential ?? mailResult.rotatedCredential;

      if (rotatedCredential) {
        // Re-seal and store the rotated credential before the job reports success.
        const sealed = await sealCredential(
          deps.secretBox,
          rotatedCredential as { refreshToken: string },
        );
        await deps.db
          .update(connectedAccounts)
          .set({ credentialEnc: sealed })
          .where(eq(connectedAccounts.id, accountId));
      }

      // Success: reset failures, set last_refresh_at, status = connected, next_refresh_at via policy
      const nextDue = nextDueAt(tier, now, 0);
      await deps.db
        .update(connectedAccounts)
        .set({
          consecutiveFailures: 0,
          lastRefreshAt: now,
          lastError: null,
          status: 'connected',
          nextRefreshAt: nextDue,
          cachePurgedAt: null, // the cache is repopulated, so Today stops reporting purged
        })
        .where(eq(connectedAccounts.id, accountId));
    } catch (error) {
      // Handle specific error types
      if (error instanceof AuthError) {
        // Access revoked: set status to reconnect_needed
        await deps.db
          .update(connectedAccounts)
          .set({
            status: 'reconnect_needed',
            lastError: 'access_revoked',
          })
          .where(eq(connectedAccounts.id, accountId));
      } else if (error instanceof RateLimited) {
        // Rate limited: reschedule
        const retryAt = new Date(now.getTime() + error.retryAfterMs);
        await deps.db
          .update(connectedAccounts)
          .set({
            nextRefreshAt: retryAt,
            lastError: 'rate_limited',
          })
          .where(eq(connectedAccounts.id, accountId));
      } else {
        // Other error: increment failures, set status and next_refresh_at via policy
        const currentFailures = (account.consecutiveFailures || 0) + 1;
        const newStatus = statusAfterFailures(currentFailures);
        const nextDue = nextDueAt(tier, now, currentFailures);

        const lastErrorCode = 'provider_unreachable';

        await deps.db
          .update(connectedAccounts)
          .set({
            consecutiveFailures: currentFailures,
            lastError: lastErrorCode,
            status: newStatus,
            nextRefreshAt: nextDue,
          })
          .where(eq(connectedAccounts.id, accountId));
      }
    }
  };
}
