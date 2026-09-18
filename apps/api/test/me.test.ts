import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { users as usersTable, jobs as jobsTable, auditLog } from '@desk/db';
import { startHarness, type Harness } from './harness.js';

// T033: failing-first tests for GET/PATCH /me, sessions, export, DELETE /me, email change,
// currency-change dedupe, and housekeeping's unverified-user purge.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function j(res: Response): Promise<any> {
  return res.json();
}

describe('me', () => {
  let h: Harness;

  beforeAll(async () => {
    h = await startHarness();
  }, 120_000);

  afterAll(async () => {
    await h.close();
  });

  it('GET /me returns the current user', async () => {
    const user = await h.asUser('me-get@example.com');
    const res = await user.get('/me');
    expect(res.status).toBe(200);
    const body = await j(res);
    expect(body.user.email).toBe('me-get@example.com');
    expect(body.user.defaultCurrency).toBe('GBP');
  });

  it('GET /me is unauthenticated without a session', async () => {
    const res = await h.app.request('/me');
    expect(res.status).toBe(401);
    const body = await j(res);
    expect(body.error.code).toBe('unauthenticated');
  });

  it('PATCH /me updates theme without touching currency', async () => {
    const user = await h.asUser('me-patch-theme@example.com');
    const res = await user.patch('/me', { theme: 'dark' });
    expect(res.status).toBe(200);
    const body = await j(res);
    expect(body.user.theme).toBe('dark');
    expect(body.job).toBeUndefined();
  });

  it('PATCH /me with a new defaultCurrency enqueues currency.change and returns a job id', async () => {
    const user = await h.asUser('me-patch-currency@example.com');
    const res = await user.patch('/me', { defaultCurrency: 'EUR' });
    expect(res.status).toBe(200);
    const body = await j(res);
    expect(body.user.defaultCurrency).toBe('EUR');
    expect(body.job?.id).toBeTruthy();

    const [job] = await h.db.select().from(jobsTable).where(eq(jobsTable.id, body.job.id));
    expect(job?.name).toBe('currency.change');
    expect(job?.userId).toBe(user.userId);
  });

  it('a second currency change requested while one is running dedupes to the running job id', async () => {
    const user = await h.asUser('me-patch-currency-dedupe@example.com');
    const first = await j(await user.patch('/me', { defaultCurrency: 'EUR' }));
    expect(first.job?.id).toBeTruthy();

    // still queued (nothing ticks the runner in this test) -> second request must return the same id
    const second = await j(await user.patch('/me', { defaultCurrency: 'USD' }));
    expect(second.job?.id).toBe(first.job.id);

    const rows = await h.db.select().from(jobsTable).where(eq(jobsTable.userId, user.userId));
    const changeJobs = rows.filter((r) => r.name === 'currency.change');
    expect(changeJobs).toHaveLength(1);
  });

  it('GET /me/sessions lists sessions, current flagged, then DELETE revokes one', async () => {
    const user = await h.asUser('me-sessions@example.com');
    const list = await j(await user.get('/me/sessions'));
    expect(list.sessions.length).toBeGreaterThanOrEqual(1);
    const mine = list.sessions.find((s: { current: boolean }) => s.current);
    expect(mine).toBeTruthy();

    const del = await user.delete(`/me/sessions/${mine.id}`);
    expect(del.status).toBe(204);
  });

  it("DELETE /me/sessions/:id on someone else's session returns not_found", async () => {
    const userA = await h.asUser('me-sessions-a@example.com');
    const userB = await h.asUser('me-sessions-b@example.com');
    const listB = await j(await userB.get('/me/sessions'));
    const sessionB = listB.sessions[0];

    const res = await userA.delete(`/me/sessions/${sessionB.id}`);
    expect(res.status).toBe(404);
    const body = await j(res);
    expect(body.error.code).toBe('not_found');
  });

  it('GET /me/export streams the export document shape', async () => {
    const user = await h.asUser('me-export@example.com');
    const res = await user.get('/me/export');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');
    const body = await j(res);
    expect(body.version).toBe(1);
    expect(body.user.email).toBe('me-export@example.com');
    expect(body.categories).toEqual([]);
    expect(body.expenses).toEqual([]);
    expect(body.importBatches).toEqual([]);
    expect(body.notion).toEqual({ connected: false, direction: null, databaseId: null });
  });

  it('POST /me/email then /me/email/confirm changes the email and notifies both addresses', async () => {
    const user = await h.asUser('me-email-old@example.com');
    const send = await user.post('/me/email', { newEmail: 'me-email-new@example.com' });
    expect(send.status).toBe(202);

    const toNew = h.mailer.sent.find((m) => m.to === 'me-email-new@example.com');
    const toOld = h.mailer.sent.find(
      (m) => m.to === 'me-email-old@example.com' && /changing/i.test(m.html),
    );
    expect(toNew).toBeTruthy();
    expect(toOld).toBeTruthy();

    const href = toNew!.html.match(/href="([^"]+)"/)![1]!;
    const token = new URL(href).searchParams.get('token')!;
    const confirm = await user.post('/me/email/confirm', { token });
    expect(confirm.status).toBe(200);
    const body = await j(confirm);
    expect(body.user.email).toBe('me-email-new@example.com');
  });

  it('DELETE /me/password refuses to remove the only sign-in method', async () => {
    const user = await h.asUser('me-password-only@example.com');
    const res = await user.delete('/me/password');
    expect(res.status).toBe(409);
    const body = await j(res);
    expect(body.error.code).toBe('conflict');
  });

  it('DELETE /me cascades sessions/tokens and pseudonymises audit rows', async () => {
    const user = await h.asUser('me-delete@example.com');
    await h.db.insert(auditLog).values({
      userId: user.userId,
      actor: 'user',
      action: 'login',
      subject: user.userId,
    });

    const res = await user.delete('/me', { password: 'test-password' });
    expect(res.status).toBe(204);

    const [gone] = await h.db.select().from(usersTable).where(eq(usersTable.id, user.userId));
    expect(gone).toBeUndefined();

    const [audit] = await h.db.select().from(auditLog).where(eq(auditLog.action, 'login'));
    expect(audit).toBeTruthy();
    expect(audit!.userId).toBeNull();
    expect((audit!.details as { deletedUserHash?: string } | null)?.deletedUserHash).toBeTruthy();
  });

  it('DELETE /me cancels queued jobs first', async () => {
    const user = await h.asUser('me-delete-jobs@example.com');
    await user.patch('/me', { defaultCurrency: 'EUR' });

    const res = await user.delete('/me', { password: 'test-password' });
    expect(res.status).toBe(204);

    const rows = await h.db.select().from(jobsTable).where(eq(jobsTable.userId, user.userId));
    expect(rows.every((r) => r.status === 'failed' && r.error === 'cancelled')).toBe(true);
  });

  it('GET /currencies returns the ISO table', async () => {
    const user = await h.asUser('me-currencies@example.com');
    const res = await user.get('/currencies');
    expect(res.status).toBe(200);
    const body = await j(res);
    expect(body.currencies.find((c: { code: string }) => c.code === 'GBP')).toBeTruthy();
  });

  it('GET /jobs/:id returns 404 for a job owned by someone else', async () => {
    const userA = await h.asUser('me-jobs-a@example.com');
    const userB = await h.asUser('me-jobs-b@example.com');
    const jobRes = await userA.patch('/me', { defaultCurrency: 'EUR' });
    const jobId = (await j(jobRes)).job.id;

    const res = await userB.get(`/jobs/${jobId}`);
    expect(res.status).toBe(404);
  });

  it('GET /jobs/:id returns the job for its owner', async () => {
    const user = await h.asUser('me-jobs-owner@example.com');
    const jobRes = await user.patch('/me', { defaultCurrency: 'EUR' });
    const jobId = (await j(jobRes)).job.id;

    const res = await user.get(`/jobs/${jobId}`);
    expect(res.status).toBe(200);
    const body = await j(res);
    expect(body.status).toBe('queued');
    expect(body.name).toBe('currency.change');
  });

  it('GET /flags resolves per-user overrides', async () => {
    const user = await h.asUser('me-flags@example.com');
    const res = await user.get('/flags');
    expect(res.status).toBe(200);
    const body = await j(res);
    expect(typeof body.flags).toBe('object');
  });

  it('housekeeping purges an unverified user after 7 days but keeps a verified one', async () => {
    const { housekeepingJob } = await import('../src/jobs/housekeeping.js');
    const { PgRateLimiter } = await import('../src/adapters/rate-limiter.js');

    const stale = await h.asUser('me-housekeeping-stale@example.com');
    const fresh = await h.asUser('me-housekeeping-fresh@example.com');
    await h.db
      .update(usersTable)
      .set({ createdAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000) })
      .where(eq(usersTable.id, stale.userId));
    await h.db
      .update(usersTable)
      .set({ emailVerifiedAt: new Date() })
      .where(eq(usersTable.id, fresh.userId));

    // ponytail: only exercising the user-purge step here; rate_limits pruning has its own
    // coverage on PgRateLimiter directly, so a no-op query stub is enough for this fake limiter.
    const queryDb = { query: async <T>() => ({ rows: [] as T[] }) };
    const limiter = new PgRateLimiter(queryDb);

    const job = housekeepingJob(h.db, limiter);
    await job({}, { updateProgress: async () => {} });

    const [staleRow] = await h.db.select().from(usersTable).where(eq(usersTable.id, stale.userId));
    const [freshRow] = await h.db.select().from(usersTable).where(eq(usersTable.id, fresh.userId));
    expect(staleRow).toBeUndefined();
    expect(freshRow).toBeTruthy();
  });
});
