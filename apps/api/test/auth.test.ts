import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { sessions as sessionsTable, users as usersTable } from '@desk/db';
import { startHarness, type Harness } from './harness.js';
import { SESSION_COOKIE } from '../src/middleware/session.js';

// T030: failing-first tests for /auth/register, /auth/verify, /auth/login, /auth/logout.

describe('auth', () => {
  let h: Harness;

  beforeAll(async () => {
    h = await startHarness();
  }, 120_000);

  afterAll(async () => {
    await h.close();
  });

  const csrfHeaders = { 'content-type': 'application/json', 'x-csrf-token': 'test-csrf-token' };
  function withCsrf(cookies = ''): Record<string, string> {
    return {
      ...csrfHeaders,
      cookie: `__Host-desk_csrf=test-csrf-token${cookies ? '; ' + cookies : ''}`,
    };
  }

  async function registerAndVerify(
    email: string,
    password = 'a-good-long-password',
  ): Promise<{
    cookie: string;
  }> {
    await h.app.request('/auth/register', {
      method: 'POST',
      headers: withCsrf(),
      body: JSON.stringify({
        email,
        password,
        defaultCurrency: 'GBP',
        timeZone: 'UTC',
      }),
    });
    // pull the raw token out of the sent mail link
    const msg = h.mailer.sent.find((m) => m.to === email);
    if (!msg) throw new Error('verify mail not sent');
    const href = msg.html.match(/href="([^"]+)"/)![1] as string;
    // Links must point at the deployed app (APP_ORIGIN), not a placeholder host.
    expect(href.startsWith('https://app.test/verify?token=')).toBe(true);
    const token = new URL(href).searchParams.get('token')!;
    const res = await h.app.request('/auth/verify', {
      method: 'POST',
      headers: withCsrf(),
      body: JSON.stringify({ token }),
    });
    const setCookie = res.headers.get('set-cookie') ?? '';
    const cookieVal = setCookie.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`))?.[1];
    if (!cookieVal) throw new Error('verify did not set session cookie');
    return { cookie: `${SESSION_COOKIE}=${cookieVal}` };
  }

  it('register always returns 202', async () => {
    const email = `reg-${crypto.randomUUID()}@example.com`;
    const res = await h.app.request('/auth/register', {
      method: 'POST',
      headers: withCsrf(),
      body: JSON.stringify({
        email,
        password: 'a-good-long-password',
        defaultCurrency: 'GBP',
        timeZone: 'UTC',
      }),
    });
    expect(res.status).toBe(202);

    // registering the same email again still returns 202 (no enumeration)
    const res2 = await h.app.request('/auth/register', {
      method: 'POST',
      headers: withCsrf(),
      body: JSON.stringify({
        email,
        password: 'another-good-password',
        defaultCurrency: 'GBP',
        timeZone: 'UTC',
      }),
    });
    expect(res2.status).toBe(202);
  });

  it('login refuses an unverified account (FR-001)', async () => {
    const email = `unverified-${crypto.randomUUID()}@example.com`;
    await h.app.request('/auth/register', {
      method: 'POST',
      headers: withCsrf(),
      body: JSON.stringify({
        email,
        password: 'a-good-long-password',
        defaultCurrency: 'GBP',
        timeZone: 'UTC',
      }),
    });

    const res = await h.app.request('/auth/login', {
      method: 'POST',
      headers: withCsrf(),
      body: JSON.stringify({ email, password: 'a-good-long-password' }),
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('email_unverified');
  });

  it('POST /auth/verify/resend sends a new verify link for an unverified account', async () => {
    const email = `resend-${crypto.randomUUID()}@example.com`;
    await h.app.request('/auth/register', {
      method: 'POST',
      headers: withCsrf(),
      body: JSON.stringify({
        email,
        password: 'a-good-long-password',
        defaultCurrency: 'GBP',
        timeZone: 'UTC',
      }),
    });
    const before = h.mailer.sent.filter((m) => m.to === email).length;

    const res = await h.app.request('/auth/verify/resend', {
      method: 'POST',
      headers: withCsrf(),
      body: JSON.stringify({ email }),
    });
    expect(res.status).toBe(202);
    expect(h.mailer.sent.filter((m) => m.to === email).length).toBe(before + 1);
  });

  it('POST /auth/verify/resend is a no-op (still 202) for an unknown email', async () => {
    const res = await h.app.request('/auth/verify/resend', {
      method: 'POST',
      headers: withCsrf(),
      body: JSON.stringify({ email: `nobody-${crypto.randomUUID()}@example.com` }),
    });
    expect(res.status).toBe(202);
  });

  it('register refuses breached passwords', async () => {
    const email = `breach-${crypto.randomUUID()}@example.com`;
    const before = h.mailer.sent.length;
    const res = await h.app.request('/auth/register', {
      method: 'POST',
      headers: withCsrf(),
      body: JSON.stringify({
        email,
        password: 'password123456',
        defaultCurrency: 'GBP',
        timeZone: 'UTC',
      }),
    });
    const body = (await res.json()) as { error: { code: string } };
    expect(res.status).toBe(400);
    expect(body.error.code).toBe('validation_failed');
    expect(h.mailer.sent.length).toBe(before);
  });

  it('verify sets a session cookie tied to a live session row', async () => {
    const email = `verify-${crypto.randomUUID()}@example.com`;
    const { cookie } = await registerAndVerify(email);
    expect(cookie).toContain(SESSION_COOKIE);

    const [user] = await h.db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);
    expect(user?.emailVerifiedAt).toBeTruthy();

    const rows = await h.db.select().from(sessionsTable).where(eq(sessionsTable.userId, user!.id));
    expect(rows.some((r) => r.revokedAt === null)).toBe(true);
  });

  it('login rotates the session (new cookie value each login)', async () => {
    const email = `login-${crypto.randomUUID()}@example.com`;
    const password = 'a-good-long-password';
    await registerAndVerify(email, password);

    const res1 = await h.app.request('/auth/login', {
      method: 'POST',
      headers: withCsrf(),
      body: JSON.stringify({ email, password }),
    });
    expect(res1.status).toBe(200);
    const cookie1 = res1.headers
      .get('set-cookie')
      ?.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`))?.[1];

    const res2 = await h.app.request('/auth/login', {
      method: 'POST',
      headers: withCsrf(),
      body: JSON.stringify({ email, password }),
    });
    expect(res2.status).toBe(200);
    const cookie2 = res2.headers
      .get('set-cookie')
      ?.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`))?.[1];

    expect(cookie1).toBeTruthy();
    expect(cookie2).toBeTruthy();
    expect(cookie1).not.toBe(cookie2);
  });

  it('wrong password returns 401', async () => {
    const email = `wrongpw-${crypto.randomUUID()}@example.com`;
    await registerAndVerify(email, 'a-good-long-password');

    const res = await h.app.request('/auth/login', {
      method: 'POST',
      headers: withCsrf(),
      body: JSON.stringify({ email, password: 'totally-wrong-password' }),
    });
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('unauthenticated');
  });

  it('locks out after 10 attempts per email within 15 minutes', async () => {
    const email = `lockout-${crypto.randomUUID()}@example.com`;
    await registerAndVerify(email, 'a-good-long-password');

    let last: Response | undefined;
    for (let i = 0; i < 11; i++) {
      last = await h.app.request('/auth/login', {
        method: 'POST',
        headers: withCsrf(),
        body: JSON.stringify({ email, password: 'wrong-password-again' }),
      });
    }
    expect(last!.status).toBe(429);
    const body = (await last!.json()) as { error: { message: string } };
    expect(body.error.message).toBe('Too many attempts');
  });

  it('logout revokes the session', async () => {
    const email = `logout-${crypto.randomUUID()}@example.com`;
    const { cookie } = await registerAndVerify(email);

    const out = await h.app.request('/auth/logout', {
      method: 'POST',
      headers: withCsrf(cookie),
    });
    expect(out.status).toBe(204);

    const [user] = await h.db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);
    const rows = await h.db.select().from(sessionsTable).where(eq(sessionsTable.userId, user!.id));
    expect(rows.every((r) => r.revokedAt !== null)).toBe(true);
  });
});
