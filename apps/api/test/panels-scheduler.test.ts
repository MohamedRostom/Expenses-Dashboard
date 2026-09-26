import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { sql, eq } from 'drizzle-orm';
import { setGlobalFlag, jobs as jobsTable } from '@desk/db';
import { startHarness, type Harness } from './harness.js';
import { jobs as jobRegistry } from '../src/jobs/index.js';

/** Raw SQL so the read doesn't depend on the Drizzle schema having the column yet (T011). */
async function lastActiveAt(harness: Harness, userId: string): Promise<Date | null> {
  const rows = (await harness.db.execute(
    sql`SELECT last_active_at FROM users WHERE id = ${userId}`,
  )) as unknown as { last_active_at: Date | null }[];
  return rows[0]?.last_active_at ?? null;
}

// Helper to parse JSON responses
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function j(res: Response): Promise<any> {
  return res.json();
}

/** Runs the registered panels.scheduler handler once, as the job tick would. */
async function runScheduler(): Promise<void> {
  const handler = jobRegistry.get('panels.scheduler');
  if (!handler) throw new Error('panels.scheduler is not registered');
  await handler({}, { updateProgress: async () => {} });
}

describe('Panels Scheduler API (T008)', () => {
  let harness: Harness;

  beforeAll(async () => {
    harness = await startHarness(undefined, { withJobs: true });
    // Enable panels.today flag for all routes to work
    await setGlobalFlag(harness.db, 'panels.today', true);
  }, 120_000);

  afterAll(async () => {
    await harness.close();
  });

  describe('panels.scheduler job', () => {
    it('enqueues exactly one panels.refresh per unpaused account whose next_refresh_at is due', async () => {
      const user = await harness.asUser('scheduler@example.com');
      const now = harness.clock.now();
      const future = new Date(now.getTime() + 60_000);
      const uuid = crypto.randomUUID();

      // Insert test accounts with all required columns
      // connected_accounts table doesn't exist yet, so this fails at runtime (expected red)
      await harness.db.execute(sql`
        INSERT INTO connected_accounts
        (id, user_id, provider, address, label, colour, capabilities, granted_scopes, credential_enc, status, next_refresh_at, paused_at)
        VALUES
        (${uuid}, ${user.userId}, 'google', 'alice@example.com', 'Alice', '#1f6e5a', ARRAY['calendar']::text[], ARRAY['calendar.readonly']::text[], decode('00', 'hex'), 'connected', ${now.toISOString()}, NULL),
        (${crypto.randomUUID()}, ${user.userId}, 'google', 'bob@example.com', 'Bob', '#1f6e5a', ARRAY['calendar']::text[], ARRAY['calendar.readonly']::text[], decode('00', 'hex'), 'connected', ${future.toISOString()}, NULL),
        (${crypto.randomUUID()}, ${user.userId}, 'google', 'charlie@example.com', 'Charlie', '#1f6e5a', ARRAY['calendar']::text[], ARRAY['calendar.readonly']::text[], decode('00', 'hex'), 'connected', ${now.toISOString()}, ${now.toISOString()}),
        (${crypto.randomUUID()}, ${user.userId}, 'google', 'diana@example.com', 'Diana', '#1f6e5a', ARRAY['calendar']::text[], ARRAY['calendar.readonly']::text[], decode('00', 'hex'), 'error', ${now.toISOString()}, NULL)
      `);

      await runScheduler();

      const jobsBefore = await harness.db
        .select()
        .from(jobsTable)
        .where(eq(jobsTable.userId, user.userId));

      // Expect exactly one job enqueued for the due unpaused account
      // The scheduler should enqueue only the first account (due now, not paused, not error)
      expect(jobsBefore.filter((j) => j.name === 'panels.refresh')).toHaveLength(1);
      expect(jobsBefore[0]?.payload).toEqual({ accountId: uuid });
    });

    it('does not double-enqueue the same account when scheduler runs twice', async () => {
      const user = await harness.asUser('dedup@example.com');
      const now = harness.clock.now();
      const accountId = crypto.randomUUID();

      // Insert one account
      await harness.db.execute(sql`
        INSERT INTO connected_accounts
        (id, user_id, provider, address, label, colour, capabilities, granted_scopes, credential_enc, status, next_refresh_at)
        VALUES
        (${accountId}, ${user.userId}, 'google', 'test@example.com', 'Test', '#1f6e5a', ARRAY['calendar']::text[], ARRAY['calendar.readonly']::text[], decode('00', 'hex'), 'connected', ${now.toISOString()})
      `);

      await runScheduler();
      const jobsFirst = await harness.db
        .select()
        .from(jobsTable)
        .where(eq(jobsTable.userId, user.userId));
      const countFirst = jobsFirst.filter((j) => j.name === 'panels.refresh').length;

      await runScheduler();

      const jobsSecond = await harness.db
        .select()
        .from(jobsTable)
        .where(eq(jobsTable.userId, user.userId));
      const countSecond = jobsSecond.filter((j) => j.name === 'panels.refresh').length;

      // Expect the same count (no double-enqueue)
      expect(countFirst).toBe(1);
      expect(countSecond).toBe(1);
    });
  });

  describe('POST /today/refresh', () => {
    it('marks every unpaused account older than 2 minutes as due and returns 202 { queued: [ids] }', async () => {
      const user = await harness.asUser('refresh@example.com');
      const now = harness.clock.now();
      const oldTime = new Date(now.getTime() - 3 * 60 * 1000); // 3 minutes old
      const accountId = crypto.randomUUID();

      // Insert an account with old last_refresh_at
      await harness.db.execute(sql`
        INSERT INTO connected_accounts
        (id, user_id, provider, address, label, colour, capabilities, granted_scopes, credential_enc, status, next_refresh_at, last_refresh_at)
        VALUES
        (${accountId}, ${user.userId}, 'google', 'old@example.com', 'Old', '#1f6e5a', ARRAY['calendar']::text[], ARRAY['calendar.readonly']::text[], decode('00', 'hex'), 'connected', ${now.toISOString()}, ${oldTime.toISOString()})
      `);

      const res = await user.post('/today/refresh');
      expect(res.status).toBe(202);
      const body = await j(res);
      expect(body).toHaveProperty('queued');
      expect(Array.isArray(body.queued)).toBe(true);
      expect(body.queued).toContain(accountId);
    });

    it('returns 429 rate_limited with retryAfterSeconds on second call within a minute', async () => {
      const user = await harness.asUser('ratelimit@example.com');
      // Fixed one-minute windows: start just after a boundary so +30 s stays in the same window.
      harness.clock.set(
        new Date(Math.ceil(harness.clock.now().getTime() / 60_000) * 60_000 + 1_000),
      );

      const res1 = await user.post('/today/refresh');
      expect(res1.status).toBe(202);

      // Advance clock 30 seconds
      harness.clock.set(new Date(harness.clock.now().getTime() + 30_000));

      // Second call within the minute should be rate-limited
      const res2 = await user.post('/today/refresh');
      expect(res2.status).toBe(429);
      const body = await j(res2);
      expect(body.error.code).toBe('rate_limited');
      expect(typeof body.retryAfterSeconds).toBe('number');
    });

    it('allows a second call after a minute has passed', async () => {
      const user = await harness.asUser('ratelimit2@example.com');

      const res1 = await user.post('/today/refresh');
      expect(res1.status).toBe(202);

      // Advance clock 61 seconds (past the 1-minute rate limit)
      harness.clock.set(new Date(harness.clock.now().getTime() + 61_000));

      const res2 = await user.post('/today/refresh');
      expect(res2.status).toBe(202);
    });
  });

  describe('POST /connections/:id/refresh', () => {
    it('on an error-status account, enqueues panels.refresh directly (bypassing scheduler skip)', async () => {
      const user = await harness.asUser('error-refresh@example.com');
      const now = harness.clock.now();
      const accountId = crypto.randomUUID();

      // Insert an account in error status
      await harness.db.execute(sql`
        INSERT INTO connected_accounts
        (id, user_id, provider, address, label, colour, capabilities, granted_scopes, credential_enc, status, next_refresh_at)
        VALUES
        (${accountId}, ${user.userId}, 'google', 'error@example.com', 'Error', '#1f6e5a', ARRAY['calendar']::text[], ARRAY['calendar.readonly']::text[], decode('00', 'hex'), 'error', ${now.toISOString()})
      `);

      // Call POST /connections/:id/refresh on the error account
      const res = await user.post(`/connections/${accountId}/refresh`);
      expect(res.status).toBe(202);

      // Verify a panels.refresh job was enqueued for this account
      const jobsAfter = await harness.db
        .select()
        .from(jobsTable)
        .where(eq(jobsTable.userId, user.userId));
      expect(jobsAfter.filter((j) => j.name === 'panels.refresh')).toHaveLength(1);
    });

    it('shares the same rate limit as POST /today/refresh keyed on user', async () => {
      const user = await harness.asUser('shared-limit@example.com');
      // Fixed one-minute windows: start just after a boundary so +30 s stays in the same window.
      harness.clock.set(
        new Date(Math.ceil(harness.clock.now().getTime() / 60_000) * 60_000 + 1_000),
      );
      const accountId = crypto.randomUUID();
      const now = harness.clock.now();

      // Insert an account
      await harness.db.execute(sql`
        INSERT INTO connected_accounts
        (id, user_id, provider, address, label, colour, capabilities, granted_scopes, credential_enc, status, next_refresh_at)
        VALUES
        (${accountId}, ${user.userId}, 'google', 'shared@example.com', 'Shared', '#1f6e5a', ARRAY['calendar']::text[], ARRAY['calendar.readonly']::text[], decode('00', 'hex'), 'connected', ${now.toISOString()})
      `);

      // Call POST /today/refresh
      const res1 = await user.post('/today/refresh');
      expect(res1.status).toBe(202);

      // Advance clock 30 seconds (within the 1-minute limit)
      harness.clock.set(new Date(harness.clock.now().getTime() + 30_000));

      // Call POST /connections/:id/refresh — should be rate-limited by the same key
      const res2 = await user.post(`/connections/${accountId}/refresh`);
      expect(res2.status).toBe(429);
      const body = await j(res2);
      expect(body.error.code).toBe('rate_limited');
    });
  });

  describe('authenticated request', () => {
    it('updates users.last_active_at on first request', async () => {
      const user = await harness.asUser('active@example.com');
      const before = harness.clock.now();

      // Make a request
      await user.get('/me');

      // Query the users table to verify last_active_at was set
      const userRow = await lastActiveAt(harness, user.userId);

      expect(userRow).not.toBeNull();
      expect(new Date(userRow!).getTime()).toBeGreaterThanOrEqual(before.getTime());
    });

    it('does not update users.last_active_at again within 5 minutes', async () => {
      const user = await harness.asUser('nodup@example.com');

      // First request
      await user.get('/me');
      const afterFirst = await lastActiveAt(harness, user.userId);

      // Advance 4 minutes (within 5-minute window)
      harness.clock.set(new Date(harness.clock.now().getTime() + 4 * 60 * 1000));

      // Second request; last_active_at should not change
      await user.get('/me');
      const afterSecond = await lastActiveAt(harness, user.userId);

      // Timestamps should be equal (not updated within 5-minute window)
      expect(afterFirst).toBeTruthy();
      expect(new Date(afterSecond!).getTime()).toBe(new Date(afterFirst!).getTime());
    });

    it('updates users.last_active_at again after 5 minutes', async () => {
      const user = await harness.asUser('update-again@example.com');

      // First request
      await user.get('/me');
      const afterFirst = await lastActiveAt(harness, user.userId);

      // Advance 6 minutes (beyond 5-minute window)
      harness.clock.set(new Date(harness.clock.now().getTime() + 6 * 60 * 1000));

      // Second request; last_active_at should update
      await user.get('/me');
      const afterSecond = await lastActiveAt(harness, user.userId);

      // Timestamp should be more recent
      expect(new Date(afterSecond!).getTime()).toBeGreaterThan(new Date(afterFirst!).getTime());
    });

    // The harness uses the Postgres session store. last_active_at is written by the session
    // middleware on users (not sessions), so the KV session store on Stage 2 takes the same path.
  });
});
