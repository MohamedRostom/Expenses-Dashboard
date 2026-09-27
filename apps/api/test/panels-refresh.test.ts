import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import {
  accountCalendars,
  cachedEvents,
  cachedMessages,
  connectedAccounts,
  setGlobalFlag,
  setUserFlag,
} from '@desk/db';
import type {
  CalendarSource,
  EventOccurrence,
  MailSource,
  MessageHeader,
} from '@desk/connectors/panels';
import { AuthError, ProviderError } from '@desk/connectors/panels';
import { PanelsService } from '../src/services/panels.js';
import { startHarness, TEST_SECRET_BOX_KEY, type Harness } from './harness.js';
import { createSecretBox } from '../src/adapters/secret-box.js';
import { sealCredential, openCredential, type StandardsCredential } from '../src/lib/credential.js';
import { panelsRefreshJob, type PanelsRefreshDeps } from '../src/jobs/panels-refresh.js';

const NOW = new Date('2026-10-05T12:00:00Z');
const secretBox = createSecretBox(TEST_SECRET_BOX_KEY);
const noopCtx = { updateProgress: async () => {} };

type FetchResult = Awaited<ReturnType<CalendarSource['fetchWindow']>>;

/** Records every fetchWindow call and answers per calendar id via `handler`. */
function fakeCalendarSource(
  calendars: Array<{ id: string; name: string; isPrimary: boolean; colour?: string }>,
  handler: (calendarIds: string[], cursor?: string) => FetchResult,
): { source: CalendarSource; calls: Array<{ calendarIds: string[]; cursor: string | undefined }> } {
  const calls: Array<{ calendarIds: string[]; cursor: string | undefined }> = [];
  return {
    calls,
    source: {
      async listCalendars() {
        return calendars;
      },
      async fetchWindow(_cred, calendarIds, _from, _to, cursor) {
        calls.push({ calendarIds, cursor });
        return handler(calendarIds, cursor);
      },
      async verify() {},
      async revoke() {},
    },
  };
}

function occurrence(over: Partial<EventOccurrence> & { providerEventId: string }): EventOccurrence {
  return {
    calendarId: over.providerEventId,
    title: 'Event',
    startsAt: new Date('2026-10-05T09:00:00Z'),
    endsAt: new Date('2026-10-05T10:00:00Z'),
    allDay: false,
    tentative: false,
    declined: false,
    ...over,
  };
}

describe('panels.refresh job — calendar (T027)', () => {
  let harness: Harness;

  beforeAll(async () => {
    harness = await startHarness();
  }, 120_000);

  afterAll(async () => {
    await harness.close();
  });

  async function insertAccount(
    overrides: {
      capabilities?: string[];
      credential?: { refreshToken: string };
    } = {},
  ) {
    const user = await harness.asUser(`refresh-${crypto.randomUUID()}@example.com`);
    const credentialEnc = await sealCredential(
      secretBox,
      overrides.credential ?? { refreshToken: 'rt-original' },
    );
    const [account] = await harness.db
      .insert(connectedAccounts)
      .values({
        userId: user.userId,
        provider: 'google',
        address: 'acct@example.com',
        label: 'Acct',
        colour: 'teal',
        capabilities: overrides.capabilities ?? ['calendar'],
        grantedScopes: ['calendar.readonly'],
        credentialEnc,
        status: 'connected',
        nextRefreshAt: NOW,
      })
      .returning();
    if (!account) throw new Error('failed to insert account');
    return account;
  }

  async function insertCalendar(
    accountId: string,
    userId: string,
    overrides: Partial<{
      providerCalendarId: string;
      name: string;
      isPrimary: boolean;
      enabled: boolean;
      cursor: string | null;
    }> = {},
  ) {
    const [row] = await harness.db
      .insert(accountCalendars)
      .values({
        userId,
        accountId,
        providerCalendarId: overrides.providerCalendarId ?? 'cal-a',
        name: overrides.name ?? 'Calendar A',
        isPrimary: overrides.isPrimary ?? true,
        enabled: overrides.enabled ?? true,
        cursor: overrides.cursor ?? null,
      })
      .returning();
    if (!row) throw new Error('failed to insert calendar');
    return row;
  }

  async function insertEvent(
    accountId: string,
    userId: string,
    calendarId: string,
    overrides: Partial<{
      providerEventId: string;
      title: string;
      startsAt: Date;
      endsAt: Date;
    }> = {},
  ) {
    await harness.db.insert(cachedEvents).values({
      userId,
      accountId,
      calendarId,
      providerEventId: overrides.providerEventId ?? 'pre-existing',
      title: overrides.title ?? 'Pre-existing',
      startsAt: overrides.startsAt ?? new Date('2026-10-05T09:00:00Z'),
      endsAt: overrides.endsAt ?? new Date('2026-10-05T10:00:00Z'),
      allDay: false,
      tentative: false,
      seenAt: NOW,
    });
  }

  function deps(
    calendarSources: NonNullable<PanelsRefreshDeps['calendarSources']>,
  ): PanelsRefreshDeps {
    return {
      db: harness.db,
      secretBox,
      clock: { now: () => NOW },
      calendarSources,
    };
  }

  it('first refresh lists calendars and inserts them, primary enabled, the other disabled', async () => {
    const account = await insertAccount();
    const { source } = fakeCalendarSource(
      [
        { id: 'cal-primary', name: 'Primary', isPrimary: true },
        { id: 'cal-other', name: 'Other', isPrimary: false },
      ],
      () => ({ events: [], full: true }),
    );

    await panelsRefreshJob(deps({ google: source }))({ accountId: account.id }, noopCtx);

    const rows = await harness.db
      .select()
      .from(accountCalendars)
      .where(eq(accountCalendars.accountId, account.id));
    expect(rows).toHaveLength(2);
    const primary = rows.find((r) => r.providerCalendarId === 'cal-primary');
    const other = rows.find((r) => r.providerCalendarId === 'cal-other');
    expect(primary).toMatchObject({ name: 'Primary', isPrimary: true, enabled: true });
    expect(other).toMatchObject({ name: 'Other', isPrimary: false, enabled: false });
  });

  it('full fetch upserts rows (exact titles/times) and deletes a pre-seeded row not in the result', async () => {
    const account = await insertAccount();
    const calendar = await insertCalendar(account.id, account.userId);
    await insertEvent(account.id, account.userId, calendar.id, { providerEventId: 'stale-event' });

    const { source } = fakeCalendarSource([], () => ({
      events: [
        occurrence({
          providerEventId: 'new-event',
          title: 'New Event',
          startsAt: new Date('2026-10-06T09:00:00Z'),
          endsAt: new Date('2026-10-06T09:30:00Z'),
        }),
      ],
      full: true,
    }));

    await panelsRefreshJob(deps({ google: source }))({ accountId: account.id }, noopCtx);

    const rows = await harness.db
      .select()
      .from(cachedEvents)
      .where(eq(cachedEvents.calendarId, calendar.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      providerEventId: 'new-event',
      title: 'New Event',
      startsAt: new Date('2026-10-06T09:00:00Z'),
      endsAt: new Date('2026-10-06T09:30:00Z'),
    });
  });

  it('partial fetch (full: false) keeps an unseen pre-seeded row and deletes the one named in deletedIds', async () => {
    const account = await insertAccount();
    const calendar = await insertCalendar(account.id, account.userId, { cursor: 'cursor-1' });
    await insertEvent(account.id, account.userId, calendar.id, { providerEventId: 'unseen-event' });
    await insertEvent(account.id, account.userId, calendar.id, {
      providerEventId: 'deleted-event',
    });

    const { source } = fakeCalendarSource([], () => ({
      events: [],
      deletedIds: ['deleted-event'],
      full: false,
    }));

    await panelsRefreshJob(deps({ google: source }))({ accountId: account.id }, noopCtx);

    const rows = await harness.db
      .select()
      .from(cachedEvents)
      .where(eq(cachedEvents.calendarId, calendar.id));
    expect(rows.map((r) => r.providerEventId).sort()).toEqual(['unseen-event']);
  });

  it("each calendar's cursor is stored on its own row; the next refresh passes it back", async () => {
    const account = await insertAccount();
    const calA = await insertCalendar(account.id, account.userId, {
      providerCalendarId: 'cal-a',
      name: 'A',
    });
    const calB = await insertCalendar(account.id, account.userId, {
      providerCalendarId: 'cal-b',
      name: 'B',
      isPrimary: false,
    });

    const { source: firstSource } = fakeCalendarSource([], (calendarIds) => {
      const id = calendarIds[0];
      return { events: [], full: true, cursor: id === 'cal-a' ? 'cursor-a-1' : 'cursor-b-1' };
    });
    await panelsRefreshJob(deps({ google: firstSource }))({ accountId: account.id }, noopCtx);

    const afterFirst = await harness.db
      .select()
      .from(accountCalendars)
      .where(eq(accountCalendars.accountId, account.id));
    expect(afterFirst.find((r) => r.id === calA.id)?.cursor).toBe('cursor-a-1');
    expect(afterFirst.find((r) => r.id === calB.id)?.cursor).toBe('cursor-b-1');

    const { source: secondSource, calls } = fakeCalendarSource([], () => ({
      events: [],
      full: false,
    }));
    await panelsRefreshJob(deps({ google: secondSource }))({ accountId: account.id }, noopCtx);

    const callA = calls.find((c) => c.calendarIds[0] === 'cal-a');
    const callB = calls.find((c) => c.calendarIds[0] === 'cal-b');
    expect(callA?.cursor).toBe('cursor-a-1');
    expect(callB?.cursor).toBe('cursor-b-1');
  });

  it('the same providerEventId on two calendars of one account produces two rows', async () => {
    const account = await insertAccount();
    const calA = await insertCalendar(account.id, account.userId, { providerCalendarId: 'cal-a' });
    const calB = await insertCalendar(account.id, account.userId, {
      providerCalendarId: 'cal-b',
      isPrimary: false,
    });

    const { source } = fakeCalendarSource([], () => ({
      events: [occurrence({ providerEventId: 'shared-event' })],
      full: true,
    }));

    await panelsRefreshJob(deps({ google: source }))({ accountId: account.id }, noopCtx);

    const rows = await harness.db
      .select()
      .from(cachedEvents)
      .where(eq(cachedEvents.providerEventId, 'shared-event'));
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((r) => r.calendarId))).toEqual(new Set([calA.id, calB.id]));
  });

  it('only enabled calendars are fetched', async () => {
    const account = await insertAccount();
    await insertCalendar(account.id, account.userId, {
      providerCalendarId: 'cal-enabled',
      enabled: true,
    });
    await insertCalendar(account.id, account.userId, {
      providerCalendarId: 'cal-disabled',
      enabled: false,
      isPrimary: false,
    });

    const { source, calls } = fakeCalendarSource([], () => ({ events: [], full: true }));
    await panelsRefreshJob(deps({ google: source }))({ accountId: account.id }, noopCtx);

    const fetchedIds = calls.map((c) => c.calendarIds[0]);
    expect(fetchedIds).toEqual(['cal-enabled']);
  });

  it('a rotatedCredential wins and is re-sealed onto the account', async () => {
    const account = await insertAccount();
    await insertCalendar(account.id, account.userId);

    const { source } = fakeCalendarSource([], () => ({
      events: [],
      full: true,
      rotatedCredential: { refreshToken: 'rt-new' },
    }));

    await panelsRefreshJob(deps({ google: source }))({ accountId: account.id }, noopCtx);

    const [row] = await harness.db
      .select()
      .from(connectedAccounts)
      .where(eq(connectedAccounts.id, account.id));
    const opened = await openCredential(secretBox, row!.credentialEnc);
    expect(opened).toEqual({ refreshToken: 'rt-new' });
  });

  it('an AuthError sets reconnect_needed/access_revoked and leaves cached_events untouched', async () => {
    const account = await insertAccount();
    const calendar = await insertCalendar(account.id, account.userId);
    await insertEvent(account.id, account.userId, calendar.id, { providerEventId: 'kept-event' });

    const { source } = fakeCalendarSource([], () => {
      throw new AuthError('access revoked');
    });

    await panelsRefreshJob(deps({ google: source }))({ accountId: account.id }, noopCtx);

    const [row] = await harness.db
      .select()
      .from(connectedAccounts)
      .where(eq(connectedAccounts.id, account.id));
    expect(row).toMatchObject({ status: 'reconnect_needed', lastError: 'access_revoked' });

    const events = await harness.db
      .select()
      .from(cachedEvents)
      .where(eq(cachedEvents.calendarId, calendar.id));
    expect(events).toHaveLength(1);
  });

  it('trims rows outside yesterday..today+7 while keeping one that overlaps the window', async () => {
    const account = await insertAccount();
    const calendar = await insertCalendar(account.id, account.userId, { cursor: 'cursor-1' });
    await insertEvent(account.id, account.userId, calendar.id, {
      providerEventId: 'ended-before-window',
      startsAt: new Date('2026-10-01T09:00:00Z'),
      endsAt: new Date('2026-10-03T00:00:00Z'), // < now - 1d (2026-10-04T12:00Z)
    });
    await insertEvent(account.id, account.userId, calendar.id, {
      providerEventId: 'spans-today',
      startsAt: new Date('2026-10-02T09:00:00Z'), // 3 days before now
      endsAt: new Date('2026-10-06T09:00:00Z'), // tomorrow
    });
    await insertEvent(account.id, account.userId, calendar.id, {
      providerEventId: 'starts-after-window',
      startsAt: new Date('2026-10-14T00:00:00Z'), // > now + 8d (2026-10-13T12:00Z)
      endsAt: new Date('2026-10-14T01:00:00Z'),
    });

    // Partial fetch, no events/deletedIds, so only the trim step (6) can remove rows.
    const { source } = fakeCalendarSource([], () => ({ events: [], full: false }));
    await panelsRefreshJob(deps({ google: source }))({ accountId: account.id }, noopCtx);

    const rows = await harness.db
      .select()
      .from(cachedEvents)
      .where(eq(cachedEvents.accountId, account.id));
    expect(rows.map((r) => r.providerEventId)).toEqual(['spans-today']);
  });

  it('declined occurrences are not stored', async () => {
    const account = await insertAccount();
    const calendar = await insertCalendar(account.id, account.userId);

    const { source } = fakeCalendarSource([], () => ({
      events: [
        occurrence({ providerEventId: 'accepted' }),
        occurrence({ providerEventId: 'declined-one', declined: true }),
      ],
      full: true,
    }));

    await panelsRefreshJob(deps({ google: source }))({ accountId: account.id }, noopCtx);

    const rows = await harness.db
      .select()
      .from(cachedEvents)
      .where(eq(cachedEvents.calendarId, calendar.id));
    expect(rows.map((r) => r.providerEventId)).toEqual(['accepted']);
  });

  it('an account without the calendar capability never calls the source', async () => {
    const account = await insertAccount({ capabilities: ['mail'] });
    const { source, calls } = fakeCalendarSource(
      [{ id: 'cal-a', name: 'A', isPrimary: true }],
      () => ({ events: [], full: true }),
    );

    await panelsRefreshJob(deps({ google: source }))({ accountId: account.id }, noopCtx);

    expect(calls).toHaveLength(0);
    const rows = await harness.db
      .select()
      .from(accountCalendars)
      .where(eq(accountCalendars.accountId, account.id));
    expect(rows).toHaveLength(0);
  });
});

type FetchInboxResult = Awaited<ReturnType<MailSource['fetchInbox']>>;

/** Records every fetchInbox call and answers via `handler`. */
function fakeMailSource(handler: (cursor?: string) => FetchInboxResult): {
  source: MailSource;
  calls: Array<{ cursor: string | undefined }>;
} {
  const calls: Array<{ cursor: string | undefined }> = [];
  return {
    calls,
    source: {
      async fetchInbox(_cred, _limit, cursor) {
        calls.push({ cursor });
        return handler(cursor);
      },
      async verify() {},
      async revoke() {},
    },
  };
}

function message(over: Partial<MessageHeader> & { providerMessageId: string }): MessageHeader {
  return {
    fromAddress: 'sender@example.com',
    subject: 'Subject',
    preview: 'Preview',
    receivedAt: new Date('2026-10-05T09:00:00Z'),
    unread: true,
    ...over,
  };
}

describe('panels.refresh job — mail (T042/T050)', () => {
  let harness: Harness;

  beforeAll(async () => {
    harness = await startHarness();
    await setGlobalFlag(harness.db, 'panels.google_mail', true);
  }, 120_000);

  afterAll(async () => {
    await harness.close();
  });

  async function insertAccount(
    overrides: {
      provider?: string;
      capabilities?: string[];
      credential?: { refreshToken: string };
      mailCursor?: string | null;
      email?: string;
    } = {},
  ) {
    const user = await harness.asUser(
      overrides.email ?? `mail-refresh-${crypto.randomUUID()}@example.com`,
    );
    const credentialEnc = await sealCredential(
      secretBox,
      overrides.credential ?? { refreshToken: 'rt-original' },
    );
    const [account] = await harness.db
      .insert(connectedAccounts)
      .values({
        userId: user.userId,
        provider: overrides.provider ?? 'google',
        address: 'acct@example.com',
        label: 'Acct',
        colour: 'teal',
        capabilities: overrides.capabilities ?? ['mail'],
        grantedScopes: ['mail.readonly'],
        credentialEnc,
        status: 'connected',
        mailCursor: overrides.mailCursor ?? null,
        nextRefreshAt: NOW,
      })
      .returning();
    if (!account) throw new Error('failed to insert account');
    return { account, userId: user.userId };
  }

  async function insertMessage(
    accountId: string,
    userId: string,
    overrides: Partial<{
      providerMessageId: string;
      receivedAt: Date;
      unread: boolean;
      subject: string;
    }> = {},
  ) {
    await harness.db.insert(cachedMessages).values({
      userId,
      accountId,
      providerMessageId: overrides.providerMessageId ?? 'pre-existing',
      fromAddress: 'sender@example.com',
      subject: overrides.subject ?? 'Subject',
      preview: 'Preview',
      receivedAt: overrides.receivedAt ?? new Date('2026-10-05T09:00:00Z'),
      unread: overrides.unread ?? true,
      seenAt: NOW,
    });
  }

  function deps(mailSources: NonNullable<PanelsRefreshDeps['mailSources']>): PanelsRefreshDeps {
    return {
      db: harness.db,
      secretBox,
      clock: { now: () => NOW },
      mailSources,
    };
  }

  it('full fetch replaces the cache (exact fields) and deletes a pre-seeded row not in the result', async () => {
    const { account, userId } = await insertAccount();
    await insertMessage(account.id, userId, { providerMessageId: 'stale-message' });

    const { source } = fakeMailSource(() => ({
      messages: [
        message({
          providerMessageId: 'new-message',
          fromName: 'Alice',
          fromAddress: 'alice@example.com',
          subject: 'Hello',
          preview: 'Hi there',
          receivedAt: new Date('2026-10-05T10:00:00Z'),
          unread: true,
          link: 'https://mail.example.com/new-message',
        }),
      ],
      full: true,
    }));

    await panelsRefreshJob(deps({ google: source }))({ accountId: account.id }, noopCtx);

    const rows = await harness.db
      .select()
      .from(cachedMessages)
      .where(eq(cachedMessages.accountId, account.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      providerMessageId: 'new-message',
      fromName: 'Alice',
      fromAddress: 'alice@example.com',
      subject: 'Hello',
      preview: 'Hi there',
      receivedAt: new Date('2026-10-05T10:00:00Z'),
      unread: true,
      link: 'https://mail.example.com/new-message',
    });
  });

  it('incremental fetch (full: false) appends new rows, passes the stored cursor back, and keeps existing ones', async () => {
    const { account, userId } = await insertAccount({ mailCursor: 'cursor-1' });
    await insertMessage(account.id, userId, {
      providerMessageId: 'kept-message',
      receivedAt: new Date('2026-10-04T09:00:00Z'),
    });

    const { source, calls } = fakeMailSource((cursor) => ({
      messages: [
        message({
          providerMessageId: 'added-message',
          receivedAt: new Date('2026-10-05T09:00:00Z'),
        }),
      ],
      full: false,
      cursor: `${cursor}-next`,
    }));

    await panelsRefreshJob(deps({ google: source }))({ accountId: account.id }, noopCtx);

    expect(calls[0]?.cursor).toBe('cursor-1');
    const rows = await harness.db
      .select()
      .from(cachedMessages)
      .where(eq(cachedMessages.accountId, account.id));
    expect(rows.map((r) => r.providerMessageId).sort()).toEqual(['added-message', 'kept-message']);

    const [row] = await harness.db
      .select()
      .from(connectedAccounts)
      .where(eq(connectedAccounts.id, account.id));
    expect(row?.mailCursor).toBe('cursor-1-next');
  });

  it('trims to the newest fifty rows per account after an incremental append', async () => {
    const { account, userId } = await insertAccount({ mailCursor: 'cursor-1' });
    for (let i = 0; i < 50; i++) {
      await insertMessage(account.id, userId, {
        providerMessageId: `old-${i}`,
        receivedAt: new Date(2026, 8, 1 + i, 9, 0, 0),
      });
    }

    const { source } = fakeMailSource(() => ({
      messages: [
        message({ providerMessageId: 'newest', receivedAt: new Date('2026-12-01T09:00:00Z') }),
      ],
      full: false,
    }));

    await panelsRefreshJob(deps({ google: source }))({ accountId: account.id }, noopCtx);

    const rows = await harness.db
      .select()
      .from(cachedMessages)
      .where(eq(cachedMessages.accountId, account.id));
    expect(rows).toHaveLength(50);
    expect(rows.map((r) => r.providerMessageId)).toContain('newest');
    expect(rows.map((r) => r.providerMessageId)).not.toContain('old-0');
  });

  it('stores unread_total when the provider reports one, and mail_cursor from a full fetch', async () => {
    const { account } = await insertAccount();

    const { source } = fakeMailSource(() => ({
      messages: [message({ providerMessageId: 'm1' })],
      full: true,
      unreadTotal: 120,
      cursor: 'cursor-after-full',
    }));

    await panelsRefreshJob(deps({ google: source }))({ accountId: account.id }, noopCtx);

    const [row] = await harness.db
      .select()
      .from(connectedAccounts)
      .where(eq(connectedAccounts.id, account.id));
    expect(row).toMatchObject({ unreadTotal: 120, mailCursor: 'cursor-after-full' });
  });

  it('does not store an unread_total when the provider does not report one', async () => {
    const { account } = await insertAccount();

    const { source } = fakeMailSource(() => ({
      messages: [],
      full: true,
    }));

    await panelsRefreshJob(deps({ google: source }))({ accountId: account.id }, noopCtx);

    const [row] = await harness.db
      .select()
      .from(connectedAccounts)
      .where(eq(connectedAccounts.id, account.id));
    expect(row?.unreadTotal).toBeNull();
  });

  it('an AuthError sets reconnect_needed/access_revoked and leaves cached_messages untouched', async () => {
    const { account, userId } = await insertAccount();
    await insertMessage(account.id, userId, { providerMessageId: 'kept-message' });

    const { source } = fakeMailSource(() => {
      throw new AuthError('access revoked');
    });

    await panelsRefreshJob(deps({ google: source }))({ accountId: account.id }, noopCtx);

    const [row] = await harness.db
      .select()
      .from(connectedAccounts)
      .where(eq(connectedAccounts.id, account.id));
    expect(row).toMatchObject({ status: 'reconnect_needed', lastError: 'access_revoked' });

    const messages = await harness.db
      .select()
      .from(cachedMessages)
      .where(eq(cachedMessages.accountId, account.id));
    expect(messages).toHaveLength(1);
  });

  it('an account without the mail capability never calls the source', async () => {
    const { account } = await insertAccount({ capabilities: ['calendar'] });
    const { source, calls } = fakeMailSource(() => ({ messages: [], full: true }));

    await panelsRefreshJob(deps({ google: source }))({ accountId: account.id }, noopCtx);

    expect(calls).toHaveLength(0);
  });

  it('a Google mail account is skipped (no fetch, no error) when panels.google_mail is off for that user', async () => {
    const email = `mail-flag-off-${crypto.randomUUID()}@example.com`;
    const { account } = await insertAccount({ email });
    await setUserFlag(harness.db, email, 'panels.google_mail', false);
    const { source, calls } = fakeMailSource(() => ({ messages: [], full: true }));

    await panelsRefreshJob(deps({ google: source }))({ accountId: account.id }, noopCtx);

    expect(calls).toHaveLength(0);
    const [row] = await harness.db
      .select()
      .from(connectedAccounts)
      .where(eq(connectedAccounts.id, account.id));
    // Skipped silently, not an error: the job still records a successful refresh.
    expect(row).toMatchObject({ status: 'connected', lastError: null });
  });

  it('a standards (IMAP) mail account is never gated by the google_mail flag', async () => {
    const { account } = await insertAccount({ provider: 'standards' });
    const { source, calls } = fakeMailSource(() => ({ messages: [], full: true }));

    await panelsRefreshJob(deps({ standards: source }))({ accountId: account.id }, noopCtx);

    expect(calls).toHaveLength(1);
  });

  it('a rotatedCredential from the mail source is re-sealed onto the account', async () => {
    const { account } = await insertAccount();

    const { source } = fakeMailSource(() => ({
      messages: [],
      full: true,
      rotatedCredential: { refreshToken: 'rt-new-mail' },
    }));

    await panelsRefreshJob(deps({ google: source }))({ accountId: account.id }, noopCtx);

    const [row] = await harness.db
      .select()
      .from(connectedAccounts)
      .where(eq(connectedAccounts.id, account.id));
    const opened = await openCredential(secretBox, row!.credentialEnc);
    expect(opened).toEqual({ refreshToken: 'rt-new-mail' });
  });

  it('a successful refresh clears cache_purged_at, so Today stops reporting purged (T055)', async () => {
    const { account } = await insertAccount();
    await harness.db
      .update(connectedAccounts)
      .set({ cachePurgedAt: new Date('2026-09-01T00:00:00Z') })
      .where(eq(connectedAccounts.id, account.id));
    const { source } = fakeMailSource(() => ({ messages: [], full: true }));

    await panelsRefreshJob(deps({ google: source }))({ accountId: account.id }, noopCtx);

    const [row] = await harness.db
      .select()
      .from(connectedAccounts)
      .where(eq(connectedAccounts.id, account.id));
    expect(row!.cachePurgedAt).toBeNull();
  });

  describe('failure escalation (T056)', () => {
    const failing = fakeMailSource(() => {
      throw new ProviderError('upstream down');
    }).source;
    const ok = fakeMailSource(() => ({ messages: [], full: true })).source;

    async function statusOf(id: string) {
      const [row] = await harness.db
        .select()
        .from(connectedAccounts)
        .where(eq(connectedAccounts.id, id));
      return [row!.status, row!.consecutiveFailures, row!.lastError];
    }

    it('twenty consecutive failures set error; the nineteenth still reads connected', async () => {
      const { account } = await insertAccount();
      for (let i = 0; i < 19; i++) {
        await panelsRefreshJob(deps({ google: failing }))({ accountId: account.id }, noopCtx);
      }
      expect(await statusOf(account.id)).toEqual(['connected', 19, 'provider_unreachable']);

      await panelsRefreshJob(deps({ google: failing }))({ accountId: account.id }, noopCtx);
      expect(await statusOf(account.id)).toEqual(['error', 20, 'provider_unreachable']);
    });

    it('a successful user-triggered refresh returns an error account to connected', async () => {
      const { account } = await insertAccount();
      await harness.db
        .update(connectedAccounts)
        .set({ status: 'error', consecutiveFailures: 20, lastError: 'provider_unreachable' })
        .where(eq(connectedAccounts.id, account.id));

      await panelsRefreshJob(deps({ google: ok }))({ accountId: account.id }, noopCtx);

      expect(await statusOf(account.id)).toEqual(['connected', 0, null]);
    });

    it('a single failure shows no error in the Today payload, only the stale mark', async () => {
      const { account, userId } = await insertAccount();
      await panelsRefreshJob(deps({ google: failing }))({ accountId: account.id }, noopCtx);

      const panels = new PanelsService({
        db: harness.db,
        clock: { now: () => NOW },
        appOrigin: 'https://app.test',
        enqueue: async () => 'job',
      });
      const payload = await panels.todayPayload(userId, NOW);
      const acct = payload.accounts.find((a) => a.id === account.id)!;
      expect([acct.status, acct.lastError, acct.stale]).toEqual(['connected', null, true]);
    });
  });
});

describe('panels.refresh job — standards CalDAV (T070)', () => {
  let harness: Harness;

  beforeAll(async () => {
    harness = await startHarness();
  }, 120_000);

  afterAll(async () => {
    await harness.close();
  });

  async function insertAccount(credential: StandardsCredential) {
    const user = await harness.asUser(`standards-refresh-${crypto.randomUUID()}@example.com`);
    const credentialEnc = await sealCredential(secretBox, credential);
    const [account] = await harness.db
      .insert(connectedAccounts)
      .values({
        userId: user.userId,
        provider: 'standards',
        address: 'standards-acct@example.com',
        label: 'Standards',
        colour: 'teal',
        capabilities: ['calendar'],
        grantedScopes: [],
        credentialEnc,
        status: 'connected',
        nextRefreshAt: NOW,
      })
      .returning();
    if (!account) throw new Error('failed to insert account');
    return account;
  }

  it("refreshes a standards account's calendar through app.ts's CalDAV source, keyed 'standards'", async () => {
    const account = await insertAccount({
      password: 'app-password',
      caldavUrl: 'https://caldav.example.com/personal/',
    });
    const { source, calls } = fakeCalendarSource(
      [{ id: 'cal-personal', name: 'Personal', isPrimary: true }],
      () => ({
        events: [
          occurrence({
            providerEventId: 'standards-event',
            title: 'Standards Event',
            startsAt: new Date('2026-10-06T09:00:00Z'),
            endsAt: new Date('2026-10-06T09:30:00Z'),
          }),
        ],
        full: true,
      }),
    );

    await panelsRefreshJob({
      db: harness.db,
      secretBox,
      clock: { now: () => NOW },
      calendarSources: { standards: source },
    })({ accountId: account.id }, noopCtx);

    // fetchWindow received the merged CalDAV cred (url/username/password) the standards source
    // expects, not the raw sealed { password, caldavUrl } shape.
    expect(calls).toHaveLength(1);

    const calendarRows = await harness.db
      .select()
      .from(accountCalendars)
      .where(eq(accountCalendars.accountId, account.id));
    expect(calendarRows).toHaveLength(1);
    expect(calendarRows[0]).toMatchObject({ providerCalendarId: 'cal-personal', enabled: true });

    const eventRows = await harness.db
      .select()
      .from(cachedEvents)
      .where(eq(cachedEvents.accountId, account.id));
    expect(eventRows).toHaveLength(1);
    expect(eventRows[0]).toMatchObject({
      providerEventId: 'standards-event',
      title: 'Standards Event',
    });

    const [row] = await harness.db
      .select()
      .from(connectedAccounts)
      .where(eq(connectedAccounts.id, account.id));
    expect(row).toMatchObject({ status: 'connected', lastError: null });
  });
});
