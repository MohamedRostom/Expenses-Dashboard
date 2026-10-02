import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import {
  setGlobalFlag,
  connectedAccounts,
  cachedEvents,
  cachedMessages,
  jobs as jobsTable,
} from '@desk/db';
import type { CalendarSource, MailSource } from '@desk/connectors/panels';
import { startHarness, TEST_SECRET_BOX_KEY, type Harness } from './harness.js';
import { createSecretBox } from '../src/adapters/secret-box.js';
import { sealCredential } from '../src/lib/credential.js';

const secretBox = createSecretBox(TEST_SECRET_BOX_KEY);

/** A CalendarSource with exactly one calendar and one event, so a single refresh both
 * lists the calendar and inserts the event in one pass (mirrors panels-refresh.test.ts). */
function fakeCalendarSource(): CalendarSource {
  return {
    async listCalendars() {
      return [{ id: 'cal-a', name: 'Calendar A', isPrimary: true }];
    },
    async fetchWindow() {
      return {
        events: [
          {
            calendarId: 'kicked-event',
            providerEventId: 'kicked-event',
            title: 'Kicked Event',
            // Harness clock defaults to 2026-09-18T00:00:00Z; panels.refresh trims events
            // outside [now-1d, now+8d], so this must stay close to that default.
            startsAt: new Date('2026-09-18T09:00:00Z'),
            endsAt: new Date('2026-09-18T10:00:00Z'),
            allDay: false,
            tentative: false,
            declined: false,
          },
        ],
        full: true,
      };
    },
    async verify() {},
    async revoke() {},
  };
}

async function insertAccount(harness: Harness, userId: string, oldTime: Date) {
  const credentialEnc = await sealCredential(secretBox, { refreshToken: 'rt-kick' });
  const [account] = await harness.db
    .insert(connectedAccounts)
    .values({
      userId,
      provider: 'google',
      address: 'kick@example.com',
      label: 'Kick',
      colour: 'teal',
      capabilities: ['calendar'],
      grantedScopes: ['calendar.readonly'],
      credentialEnc,
      status: 'connected',
      nextRefreshAt: harness.clock.now(),
      lastRefreshAt: oldTime,
    })
    .returning();
  if (!account) throw new Error('failed to insert account');
  return account;
}

/** Polls until `check` returns true or `maxMs` elapses; fails loudly with the last value
 * instead of hanging, so a broken kick shows up as a real assertion failure. */
async function pollUntil<T>(
  check: () => Promise<T>,
  isDone: (value: T) => boolean,
  maxMs = 5_000,
): Promise<T> {
  const start = Date.now();
  let value = await check();
  while (!isDone(value) && Date.now() - start < maxMs) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    value = await check();
  }
  return value;
}

describe('runJobsNow kicks the job runner after a user-triggered refresh (T086)', () => {
  describe('with runJobsNow wired', () => {
    let harness: Harness;

    beforeAll(async () => {
      harness = await startHarness(undefined, {
        withJobs: true,
        runJobsNow: true,
        calendarSources: { google: fakeCalendarSource() },
      });
      await setGlobalFlag(harness.db, 'panels.today', true);
    }, 120_000);

    afterAll(async () => {
      await harness.close();
    });

    it('POST /panels/today/refresh runs the job immediately, without a manual runDueJobs tick', async () => {
      const user = await harness.asUser('kick-today@example.com');
      const oldTime = new Date(harness.clock.now().getTime() - 3 * 60 * 1000);
      const account = await insertAccount(harness, user.userId, oldTime);

      const res = await user.post('/panels/today/refresh');
      expect(res.status).toBe(202);
      const body = (await res.json()) as { queued: string[] };
      expect(body.queued).toEqual([account.id]);

      const refreshed = await pollUntil(
        async () => {
          const [row] = await harness.db
            .select()
            .from(connectedAccounts)
            .where(eq(connectedAccounts.id, account.id));
          return row;
        },
        (row) => row?.lastRefreshAt != null && row.lastRefreshAt.getTime() !== oldTime.getTime(),
      );
      expect(refreshed?.lastRefreshAt).not.toBeNull();
      expect(refreshed?.lastRefreshAt?.getTime()).not.toBe(oldTime.getTime());

      const events = await harness.db
        .select()
        .from(cachedEvents)
        .where(eq(cachedEvents.accountId, account.id));
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        providerEventId: 'kicked-event',
        title: 'Kicked Event',
        startsAt: new Date('2026-09-18T09:00:00Z'),
        endsAt: new Date('2026-09-18T10:00:00Z'),
      });
    });

    it('POST /connections/:id/refresh runs the per-account job immediately', async () => {
      const user = await harness.asUser('kick-account@example.com');
      const oldTime = new Date(harness.clock.now().getTime() - 3 * 60 * 1000);
      const account = await insertAccount(harness, user.userId, oldTime);

      const res = await user.post(`/connections/${account.id}/refresh`);
      expect(res.status).toBe(202);

      const refreshed = await pollUntil(
        async () => {
          const [row] = await harness.db
            .select()
            .from(connectedAccounts)
            .where(eq(connectedAccounts.id, account.id));
          return row;
        },
        (row) => row?.lastRefreshAt != null && row.lastRefreshAt.getTime() !== oldTime.getTime(),
      );
      expect(refreshed?.lastRefreshAt).not.toBeNull();
      expect(refreshed?.lastRefreshAt?.getTime()).not.toBe(oldTime.getTime());

      const events = await harness.db
        .select()
        .from(cachedEvents)
        .where(eq(cachedEvents.accountId, account.id));
      expect(events).toHaveLength(1);
    });
  });

  describe('with runJobsNow off (default)', () => {
    let harness: Harness;

    beforeAll(async () => {
      harness = await startHarness(undefined, {
        withJobs: true,
        calendarSources: { google: fakeCalendarSource() },
      });
      await setGlobalFlag(harness.db, 'panels.today', true);
    }, 120_000);

    afterAll(async () => {
      await harness.close();
    });

    it('leaves the job row queued after a short wait — the 30s tick path is unchanged', async () => {
      const user = await harness.asUser('no-kick@example.com');
      const oldTime = new Date(harness.clock.now().getTime() - 3 * 60 * 1000);
      const account = await insertAccount(harness, user.userId, oldTime);

      const res = await user.post('/panels/today/refresh');
      expect(res.status).toBe(202);

      // Give a kick (if one were wrongly wired) a real chance to run before asserting it didn't.
      await new Promise((resolve) => setTimeout(resolve, 500));

      const jobRows = await harness.db
        .select()
        .from(jobsTable)
        .where(eq(jobsTable.userId, user.userId));
      const refreshJob = jobRows.find((j) => j.name === 'panels.refresh');
      expect(refreshJob?.status).toBe('queued');

      const [row] = await harness.db
        .select()
        .from(connectedAccounts)
        .where(eq(connectedAccounts.id, account.id));
      expect(row?.lastRefreshAt?.getTime()).toBe(oldTime.getTime());
    });
  });
});

// app.ts must hand the mail sources to the registered panels.refresh job, not just build them.
describe('the registered panels.refresh job refreshes mail through AppDeps.mailSources', () => {
  let harness: Harness;
  const mail: MailSource = {
    async fetchInbox() {
      return {
        messages: [
          {
            providerMessageId: 'msg-kick',
            fromAddress: 'sender@example.com',
            subject: 'Kicked mail',
            preview: 'hello',
            receivedAt: new Date('2026-09-17T09:00:00Z'),
            unread: true,
          },
        ],
        full: true,
      };
    },
    async verify() {},
    async revoke() {},
  };

  beforeAll(async () => {
    harness = await startHarness(undefined, {
      withJobs: true,
      runJobsNow: true,
      mailSources: { microsoft: mail },
    });
    await setGlobalFlag(harness.db, 'panels.today', true);
  }, 120_000);

  afterAll(async () => {
    await harness.close();
  });

  it('POST /panels/today/refresh stores the fake inbox message', async () => {
    const user = await harness.asUser('kick-mail@example.com');
    const credentialEnc = await sealCredential(secretBox, { refreshToken: 'rt-mail' });
    const [account] = await harness.db
      .insert(connectedAccounts)
      .values({
        userId: user.userId,
        provider: 'microsoft',
        address: 'mail@example.com',
        label: 'Mail',
        colour: 'teal',
        capabilities: ['mail'],
        grantedScopes: ['Mail.Read'],
        credentialEnc,
        status: 'connected',
        nextRefreshAt: harness.clock.now(),
        lastRefreshAt: new Date(harness.clock.now().getTime() - 3 * 60 * 1000),
      })
      .returning();

    expect((await user.post('/panels/today/refresh')).status).toBe(202);

    const rows = await pollUntil(
      () =>
        harness.db.select().from(cachedMessages).where(eq(cachedMessages.accountId, account!.id)),
      (r) => r.length > 0,
    );
    expect(rows.map((r) => [r.providerMessageId, r.subject, r.unread])).toEqual([
      ['msg-kick', 'Kicked mail', true],
    ]);
  });
});
