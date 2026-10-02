import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { sql, eq } from 'drizzle-orm';
import {
  setGlobalFlag,
  connectedAccounts,
  accountCalendars,
  cachedEvents,
  cachedMessages,
  jobs as jobsTable,
} from '@desk/db';
import { startHarness, type Harness } from './harness.js';
import { jobs as jobRegistry } from '../src/jobs/index.js';

const THIRTY_ONE_DAYS_MS = 31 * 24 * 60 * 60 * 1000;

/** Runs the registered panels.purge handler once, as the daily job tick would. */
async function runPurge(): Promise<void> {
  const handler = jobRegistry.get('panels.purge');
  if (!handler) throw new Error('panels.purge is not registered');
  await handler({}, { updateProgress: async () => {} });
}

describe('panels.purge job (T055)', () => {
  let harness: Harness;

  beforeAll(async () => {
    harness = await startHarness(undefined, { withJobs: true });
    await setGlobalFlag(harness.db, 'panels.today', true);
  }, 120_000);

  afterAll(async () => {
    await harness.close();
  });

  /** Creates a user whose last_active_at is 31 days old, with one connected account, one
   * enabled calendar, one cached event and one cached message. */
  async function seedIdleAccount(
    email: string,
  ): Promise<{ userId: string; accountId: string; calendarId: string }> {
    const user = await harness.asUser(email);
    const now = harness.clock.now();
    const idleSince = new Date(now.getTime() - THIRTY_ONE_DAYS_MS);
    await harness.db.execute(
      sql`UPDATE users SET last_active_at = ${idleSince.toISOString()} WHERE id = ${user.userId}`,
    );

    const [account] = await harness.db
      .insert(connectedAccounts)
      .values({
        userId: user.userId,
        provider: 'google',
        address: email,
        label: 'Idle',
        colour: 'teal',
        capabilities: ['calendar'],
        grantedScopes: ['calendar.readonly'],
        credentialEnc: new Uint8Array([1, 2, 3]),
        status: 'connected',
        nextRefreshAt: now,
      })
      .returning();
    if (!account) throw new Error('failed to insert account');

    const [calendar] = await harness.db
      .insert(accountCalendars)
      .values({
        userId: user.userId,
        accountId: account.id,
        providerCalendarId: 'cal-1',
        name: 'Cal',
        isPrimary: true,
        enabled: true,
      })
      .returning();
    if (!calendar) throw new Error('failed to insert calendar');

    await harness.db.insert(cachedEvents).values({
      userId: user.userId,
      accountId: account.id,
      calendarId: calendar.id,
      providerEventId: 'evt-1',
      title: 'Idle event',
      startsAt: now,
      endsAt: now,
      allDay: false,
    });
    await harness.db.insert(cachedMessages).values({
      userId: user.userId,
      accountId: account.id,
      providerMessageId: 'msg-1',
      fromAddress: 'a@example.com',
      subject: 'hi',
      preview: 'hi',
      receivedAt: now,
      unread: true,
    });

    return { userId: user.userId, accountId: account.id, calendarId: calendar.id };
  }

  it('deletes cached rows for idle users, sets cache_purged_at, keeps the account and credential', async () => {
    const { accountId } = await seedIdleAccount('idle-purge@example.com');

    await runPurge();

    const events = await harness.db
      .select()
      .from(cachedEvents)
      .where(eq(cachedEvents.accountId, accountId));
    const messages = await harness.db
      .select()
      .from(cachedMessages)
      .where(eq(cachedMessages.accountId, accountId));
    expect(events).toEqual([]);
    expect(messages).toEqual([]);

    const [account] = await harness.db
      .select()
      .from(connectedAccounts)
      .where(eq(connectedAccounts.id, accountId));
    expect(account).toBeDefined();
    expect(Array.from(account!.credentialEnc)).toEqual([1, 2, 3]);
    expect(account!.cachePurgedAt).not.toBeNull();
  });

  it('leaves an active user (last_active_at within 30 days) untouched', async () => {
    const user = await harness.asUser('active-no-purge@example.com');
    const now = harness.clock.now();
    const [account] = await harness.db
      .insert(connectedAccounts)
      .values({
        userId: user.userId,
        provider: 'google',
        address: 'active@example.com',
        label: 'Active',
        colour: 'teal',
        capabilities: ['calendar'],
        grantedScopes: ['calendar.readonly'],
        credentialEnc: new Uint8Array([1]),
        status: 'connected',
        nextRefreshAt: now,
      })
      .returning();
    if (!account) throw new Error('failed to insert account');
    const [calendar] = await harness.db
      .insert(accountCalendars)
      .values({
        userId: user.userId,
        accountId: account.id,
        providerCalendarId: 'cal-active',
        name: 'Cal',
        isPrimary: true,
        enabled: true,
      })
      .returning();
    if (!calendar) throw new Error('failed to insert calendar');
    await harness.db.insert(cachedEvents).values({
      userId: user.userId,
      accountId: account.id,
      calendarId: calendar.id,
      providerEventId: 'evt-active',
      title: 'Active event',
      startsAt: now,
      endsAt: now,
      allDay: false,
    });

    await runPurge();

    const events = await harness.db
      .select()
      .from(cachedEvents)
      .where(eq(cachedEvents.accountId, account.id));
    expect(events).toHaveLength(1);

    const [row] = await harness.db
      .select()
      .from(connectedAccounts)
      .where(eq(connectedAccounts.id, account.id));
    expect(row!.cachePurgedAt).toBeNull();
  });

  it('reports purged: true per account on GET /panels/today after a purge', async () => {
    await seedIdleAccount('idle-today@example.com');
    await runPurge();

    const user = await harness.asUser('idle-today@example.com');
    const res = await user.get('/panels/today');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { accounts: Array<{ purged: boolean }> };
    expect(body.accounts).toHaveLength(1);
    expect(body.accounts.every((a) => a.purged)).toBe(true);
  });

  it('cancels a queued panels.refresh job for the idle user before purging (JobRunner.cancelForUser)', async () => {
    const { userId, accountId } = await seedIdleAccount('idle-cancel@example.com');
    await harness.db.insert(jobsTable).values({
      name: 'panels.refresh',
      userId,
      payload: { accountId },
      status: 'queued',
      runAfter: harness.clock.now(),
    });

    await runPurge();

    const rows = await harness.db.select().from(jobsTable).where(eq(jobsTable.userId, userId));
    const refreshJob = rows.find((r) => r.name === 'panels.refresh');
    expect(refreshJob?.status).toBe('failed');
    expect(refreshJob?.error).toBe('cancelled');
  });

  it('audits the purge per idle user', async () => {
    const { userId } = await seedIdleAccount('idle-audit@example.com');
    await runPurge();

    const rows = await harness.db.execute(
      sql`SELECT action FROM audit_log WHERE user_id = ${userId} AND action = 'purge'`,
    );
    expect((rows as unknown as unknown[]).length).toBeGreaterThan(0);
  });
});
