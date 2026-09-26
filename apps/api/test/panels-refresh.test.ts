import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { accountCalendars, cachedEvents, connectedAccounts } from '@desk/db';
import type { CalendarSource, EventOccurrence } from '@desk/connectors/panels';
import { AuthError } from '@desk/connectors/panels';
import { startHarness, TEST_SECRET_BOX_KEY, type Harness } from './harness.js';
import { createSecretBox } from '../src/adapters/secret-box.js';
import { sealCredential, openCredential } from '../src/lib/credential.js';
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
