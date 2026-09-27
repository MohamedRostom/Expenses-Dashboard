import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { setGlobalFlag } from '@desk/db';
import { accountCalendars, cachedEvents, cachedMessages, connectedAccounts, users } from '@desk/db';
import { startHarness, TEST_SECRET_BOX_KEY, type Harness } from './harness.js';
import { createSecretBox } from '../src/adapters/secret-box.js';
import { sealCredential } from '../src/lib/credential.js';

const secretBox = createSecretBox(TEST_SECRET_BOX_KEY);

describe('GET /panels/today — calendar events (T028)', () => {
  let harness: Harness;

  beforeAll(async () => {
    harness = await startHarness();
    await setGlobalFlag(harness.db, 'panels.today', true);
  }, 120_000);

  afterAll(async () => {
    await harness.close();
  });

  async function insertAccount(
    userId: string,
    overrides: {
      capabilities?: string[];
      status?: 'connected' | 'reconnect_needed' | 'error';
      pausedAt?: Date | null;
      lastRefreshAt?: Date | null;
    } = {},
  ) {
    const credentialEnc = await sealCredential(secretBox, { refreshToken: 'rt' });
    const [account] = await harness.db
      .insert(connectedAccounts)
      .values({
        userId,
        provider: 'google',
        address: `acct-${crypto.randomUUID()}@example.com`,
        label: 'Acct',
        colour: 'teal',
        capabilities: overrides.capabilities ?? ['calendar'],
        grantedScopes: ['calendar.readonly'],
        credentialEnc,
        status: overrides.status ?? 'connected',
        pausedAt: overrides.pausedAt ?? null,
        lastRefreshAt: overrides.lastRefreshAt ?? null,
        nextRefreshAt: new Date('2026-10-05T12:00:00Z'),
      })
      .returning();
    if (!account) throw new Error('failed to insert account');
    return account;
  }

  async function insertCalendar(
    accountId: string,
    userId: string,
    overrides: Partial<{ enabled: boolean }> = {},
  ) {
    const [row] = await harness.db
      .insert(accountCalendars)
      .values({
        userId,
        accountId,
        providerCalendarId: `cal-${crypto.randomUUID()}`,
        name: 'Calendar',
        isPrimary: true,
        enabled: overrides.enabled ?? true,
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
      title: string;
      startsAt: Date;
      endsAt: Date;
      allDay: boolean;
    }> = {},
  ) {
    const [row] = await harness.db
      .insert(cachedEvents)
      .values({
        userId,
        accountId,
        calendarId,
        providerEventId: `ev-${crypto.randomUUID()}`,
        title: overrides.title ?? 'Event',
        startsAt: overrides.startsAt ?? new Date('2026-10-05T09:00:00Z'),
        endsAt: overrides.endsAt ?? new Date('2026-10-05T10:00:00Z'),
        allDay: overrides.allDay ?? false,
        tentative: false,
        seenAt: new Date('2026-10-05T12:00:00Z'),
      })
      .returning();
    if (!row) throw new Error('failed to insert event');
    return row;
  }

  it('groups an event into the right local day and puts all-day events first', async () => {
    const user = await harness.asUser('today-tz@example.com');
    await harness.db
      .update(users)
      .set({ timeZone: 'America/Los_Angeles' })
      .where(eq(users.id, user.userId));
    harness.clock.set(new Date('2026-10-05T12:00:00Z'));

    const account = await insertAccount(user.userId);
    const calendar = await insertCalendar(account.id, user.userId);
    // 2026-10-06T05:30Z is 2026-10-05 22:30 in America/Los_Angeles -> lands under 2026-10-05.
    const timed = await insertEvent(account.id, user.userId, calendar.id, {
      title: 'Timed',
      startsAt: new Date('2026-10-06T05:30:00Z'),
      endsAt: new Date('2026-10-06T06:00:00Z'),
    });
    const allDay = await insertEvent(account.id, user.userId, calendar.id, {
      title: 'All Day',
      startsAt: new Date('2026-10-05T00:00:00Z'),
      endsAt: new Date('2026-10-06T00:00:00Z'),
      allDay: true,
    });

    const res = await user.get('/panels/today');
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      days: Array<{ date: string; events: Array<{ id: string; title: string }> }>;
    };

    const day = body.days.find((d) => d.date === '2026-10-05');
    if (!day) throw new Error('expected a 2026-10-05 bucket');
    expect(day.events.map((e) => e.id)).toEqual([allDay.id, timed.id]);
  });

  it('two accounts are interleaved by start time within a day', async () => {
    const user = await harness.asUser('today-interleave@example.com');
    harness.clock.set(new Date('2026-10-05T12:00:00Z'));

    const accountA = await insertAccount(user.userId);
    const calA = await insertCalendar(accountA.id, user.userId);
    const later = await insertEvent(accountA.id, user.userId, calA.id, {
      title: 'Later',
      startsAt: new Date('2026-10-05T15:00:00Z'),
      endsAt: new Date('2026-10-05T15:30:00Z'),
    });

    const accountB = await insertAccount(user.userId);
    const calB = await insertCalendar(accountB.id, user.userId);
    const earlier = await insertEvent(accountB.id, user.userId, calB.id, {
      title: 'Earlier',
      startsAt: new Date('2026-10-05T09:00:00Z'),
      endsAt: new Date('2026-10-05T09:30:00Z'),
    });

    const res = await user.get('/panels/today');
    const body = (await res.json()) as {
      days: Array<{ date: string; events: Array<{ id: string }> }>;
    };
    const day = body.days.find((d) => d.date === '2026-10-05');
    if (!day) throw new Error('expected a 2026-10-05 bucket');
    expect(day.events.map((e) => e.id)).toEqual([earlier.id, later.id]);
  });

  it('an event that started three days ago and ends tomorrow appears on today and tomorrow (FR-006)', async () => {
    const user = await harness.asUser('today-spanning@example.com');
    harness.clock.set(new Date('2026-10-05T12:00:00Z'));

    const account = await insertAccount(user.userId);
    const calendar = await insertCalendar(account.id, user.userId);
    const spanning = await insertEvent(account.id, user.userId, calendar.id, {
      title: 'Spans',
      startsAt: new Date('2026-10-02T09:00:00Z'),
      endsAt: new Date('2026-10-06T09:00:00Z'),
    });

    const res = await user.get('/panels/today');
    const body = (await res.json()) as {
      days: Array<{ date: string; events: Array<{ id: string }> }>;
    };
    const today = body.days.find((d) => d.date === '2026-10-05');
    const tomorrow = body.days.find((d) => d.date === '2026-10-06');
    if (!today || !tomorrow) throw new Error('expected 2026-10-05 and 2026-10-06 buckets');
    expect(today.events.map((e) => e.id)).toContain(spanning.id);
    expect(tomorrow.events.map((e) => e.id)).toContain(spanning.id);
  });

  it("a paused account's events are absent and a disabled calendar's events are absent", async () => {
    const user = await harness.asUser('today-paused-disabled@example.com');
    harness.clock.set(new Date('2026-10-05T12:00:00Z'));

    const pausedAccount = await insertAccount(user.userId, {
      pausedAt: new Date('2026-10-01T00:00:00Z'),
    });
    const pausedCalendar = await insertCalendar(pausedAccount.id, user.userId);
    const pausedEvent = await insertEvent(pausedAccount.id, user.userId, pausedCalendar.id);

    const activeAccount = await insertAccount(user.userId);
    const disabledCalendar = await insertCalendar(activeAccount.id, user.userId, {
      enabled: false,
    });
    const disabledEvent = await insertEvent(activeAccount.id, user.userId, disabledCalendar.id);

    const res = await user.get('/panels/today');
    const body = (await res.json()) as {
      days: Array<{ date: string; events: Array<{ id: string }> }>;
    };
    const allIds = body.days.flatMap((d) => d.events.map((e) => e.id));
    expect(allIds).not.toContain(pausedEvent.id);
    expect(allIds).not.toContain(disabledEvent.id);
  });

  it('stale is true when last_refresh_at is older than 5 minutes for an active user, false when fresh', async () => {
    const user = await harness.asUser('today-stale@example.com');
    harness.clock.set(new Date('2026-10-05T12:00:00Z'));

    const staleAccount = await insertAccount(user.userId, {
      lastRefreshAt: new Date('2026-10-05T11:00:00Z'), // 1h ago
    });
    const freshAccount = await insertAccount(user.userId, {
      lastRefreshAt: new Date('2026-10-05T11:58:00Z'), // 2min ago
    });

    const res = await user.get('/panels/today');
    const body = (await res.json()) as {
      accounts: Array<{ id: string; stale: boolean }>;
    };
    const stale = body.accounts.find((a) => a.id === staleAccount.id);
    const fresh = body.accounts.find((a) => a.id === freshAccount.id);
    expect(stale?.stale).toBe(true);
    expect(fresh?.stale).toBe(false);
  });

  it('a reconnect_needed account carries reconnectUrl and its cached events still appear', async () => {
    const user = await harness.asUser('today-reconnect@example.com');
    harness.clock.set(new Date('2026-10-05T12:00:00Z'));

    const account = await insertAccount(user.userId, { status: 'reconnect_needed' });
    const calendar = await insertCalendar(account.id, user.userId);
    const event = await insertEvent(account.id, user.userId, calendar.id);

    const res = await user.get('/panels/today');
    const body = (await res.json()) as {
      accounts: Array<{ id: string; status: string; reconnectUrl?: string }>;
      days: Array<{ date: string; events: Array<{ id: string }> }>;
    };
    const acc = body.accounts.find((a) => a.id === account.id);
    expect(acc?.status).toBe('reconnect_needed');
    expect(acc?.reconnectUrl).toBe(`https://app.test/settings/connections?reconnect=${account.id}`);
    const allIds = body.days.flatMap((d) => d.events.map((e) => e.id));
    expect(allIds).toContain(event.id);
  });
});

describe('GET /panels/today — mail messages (T051)', () => {
  let harness: Harness;

  beforeAll(async () => {
    harness = await startHarness();
    await setGlobalFlag(harness.db, 'panels.today', true);
  }, 120_000);

  afterAll(async () => {
    await harness.close();
  });

  async function insertAccount(
    userId: string,
    overrides: {
      capabilities?: string[];
      pausedAt?: Date | null;
      unreadTotal?: number | null;
    } = {},
  ) {
    const credentialEnc = await sealCredential(secretBox, { refreshToken: 'rt' });
    const [account] = await harness.db
      .insert(connectedAccounts)
      .values({
        userId,
        provider: 'google',
        address: `acct-${crypto.randomUUID()}@example.com`,
        label: 'Acct',
        colour: 'teal',
        capabilities: overrides.capabilities ?? ['mail'],
        grantedScopes: ['mail.readonly'],
        credentialEnc,
        status: 'connected',
        pausedAt: overrides.pausedAt ?? null,
        unreadTotal: overrides.unreadTotal ?? null,
        nextRefreshAt: new Date('2026-10-05T12:00:00Z'),
      })
      .returning();
    if (!account) throw new Error('failed to insert account');
    return account;
  }

  async function insertMessage(
    accountId: string,
    userId: string,
    overrides: Partial<{
      fromName: string | null;
      subject: string;
      receivedAt: Date;
      unread: boolean;
    }> = {},
  ) {
    const [row] = await harness.db
      .insert(cachedMessages)
      .values({
        userId,
        accountId,
        providerMessageId: `msg-${crypto.randomUUID()}`,
        fromName: overrides.fromName ?? null,
        fromAddress: 'sender@example.com',
        subject: overrides.subject ?? 'Subject',
        preview: 'Preview',
        receivedAt: overrides.receivedAt ?? new Date('2026-10-05T09:00:00Z'),
        unread: overrides.unread ?? true,
        seenAt: new Date('2026-10-05T12:00:00Z'),
      })
      .returning();
    if (!row) throw new Error('failed to insert message');
    return row;
  }

  it('messages from two accounts are merged newest first', async () => {
    const user = await harness.asUser('today-mail-newest@example.com');
    const accountA = await insertAccount(user.userId);
    const accountB = await insertAccount(user.userId);
    const older = await insertMessage(accountA.id, user.userId, {
      receivedAt: new Date('2026-10-04T09:00:00Z'),
    });
    const newer = await insertMessage(accountB.id, user.userId, {
      receivedAt: new Date('2026-10-05T09:00:00Z'),
    });

    const res = await user.get('/panels/today');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { messages: Array<{ id: string; accountId: string }> };
    expect(body.messages.map((m) => m.id)).toEqual([newer.id, older.id]);
  });

  it('an empty subject is returned as ""', async () => {
    const user = await harness.asUser('today-mail-empty-subject@example.com');
    const account = await insertAccount(user.userId);
    const blank = await insertMessage(account.id, user.userId, { subject: '', fromName: null });

    const res = await user.get('/panels/today');
    const body = (await res.json()) as {
      messages: Array<{ id: string; subject: string; fromName: string }>;
    };
    const msg = body.messages.find((m) => m.id === blank.id);
    expect(msg?.subject).toBe('');
    expect(msg?.fromName).toBe('');
  });

  it('unreadCount uses unread_total when it is larger than the cached unread rows', async () => {
    const user = await harness.asUser('today-mail-unread-total@example.com');
    const account = await insertAccount(user.userId, { unreadTotal: 120 });
    await insertMessage(account.id, user.userId, { unread: true });
    await insertMessage(account.id, user.userId, { unread: false });

    const res = await user.get('/panels/today');
    const body = (await res.json()) as { accounts: Array<{ id: string; unreadCount: number }> };
    const acc = body.accounts.find((a) => a.id === account.id);
    expect(acc?.unreadCount).toBe(120);
  });

  it('unreadCount falls back to the cached unread row count when unread_total is null or smaller', async () => {
    const user = await harness.asUser('today-mail-unread-cached@example.com');
    const account = await insertAccount(user.userId, { unreadTotal: null });
    await insertMessage(account.id, user.userId, { unread: true });
    await insertMessage(account.id, user.userId, { unread: true });
    await insertMessage(account.id, user.userId, { unread: false });

    const res = await user.get('/panels/today');
    const body = (await res.json()) as { accounts: Array<{ id: string; unreadCount: number }> };
    const acc = body.accounts.find((a) => a.id === account.id);
    expect(acc?.unreadCount).toBe(2);
  });

  it("a paused account's messages are absent from both the list and its own unread count", async () => {
    const user = await harness.asUser('today-mail-paused@example.com');
    const pausedAccount = await insertAccount(user.userId, {
      pausedAt: new Date('2026-10-01T00:00:00Z'),
    });
    const pausedMessage = await insertMessage(pausedAccount.id, user.userId, { unread: true });

    const res = await user.get('/panels/today');
    const body = (await res.json()) as {
      messages: Array<{ id: string }>;
      accounts: Array<{ id: string; unreadCount: number }>;
    };
    expect(body.messages.map((m) => m.id)).not.toContain(pausedMessage.id);
    const acc = body.accounts.find((a) => a.id === pausedAccount.id);
    expect(acc?.unreadCount).toBe(0);
  });
});
