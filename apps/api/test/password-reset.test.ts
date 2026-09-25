import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { sessions as sessionsTable, users as usersTable } from '@desk/db';
import { startHarness, type Harness } from './harness.js';
import { SESSION_COOKIE } from '../src/middleware/session.js';

// T031: failing-first tests for /auth/password/forgot and /auth/password/reset.

describe('password reset', () => {
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
      body: JSON.stringify({ email, password, defaultCurrency: 'GBP', timeZone: 'UTC' }),
    });
    const msg = h.mailer.sent.find((m) => m.to === email);
    if (!msg) throw new Error('verify mail not sent');
    const href = msg.html.match(/href="([^"]+)"/)![1] as string;
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

  function extractResetToken(html: string): string {
    const href = html.match(/href="([^"]+)"/)![1] as string;
    return new URL(href).searchParams.get('token')!;
  }

  it('forgot always returns 202', async () => {
    const res = await h.app.request('/auth/password/forgot', {
      method: 'POST',
      headers: withCsrf(),
      body: JSON.stringify({ email: `nobody-${crypto.randomUUID()}@example.com` }),
    });
    expect(res.status).toBe(202);
  });

  it('forgot sends a reset mail for a known email', async () => {
    const email = `forgot-${crypto.randomUUID()}@example.com`;
    await registerAndVerify(email);
    const before = h.mailer.sent.length;

    const res = await h.app.request('/auth/password/forgot', {
      method: 'POST',
      headers: withCsrf(),
      body: JSON.stringify({ email }),
    });
    expect(res.status).toBe(202);
    expect(h.mailer.sent.length).toBe(before + 1);
  });

  it('reset link is single use and updates the password', async () => {
    const email = `reset-${crypto.randomUUID()}@example.com`;
    await registerAndVerify(email, 'original-password-123');

    await h.app.request('/auth/password/forgot', {
      method: 'POST',
      headers: withCsrf(),
      body: JSON.stringify({ email }),
    });
    const msg = h.mailer.sent.filter((m) => m.to === email).pop()!;
    const token = extractResetToken(msg.html);

    const res = await h.app.request('/auth/password/reset', {
      method: 'POST',
      headers: withCsrf(),
      body: JSON.stringify({ token, password: 'brand-new-password-456' }),
    });
    expect(res.status).toBe(204);

    // old password no longer works
    const loginOld = await h.app.request('/auth/login', {
      method: 'POST',
      headers: withCsrf(),
      body: JSON.stringify({ email, password: 'original-password-123' }),
    });
    expect(loginOld.status).toBe(401);

    // new password works
    const loginNew = await h.app.request('/auth/login', {
      method: 'POST',
      headers: withCsrf(),
      body: JSON.stringify({ email, password: 'brand-new-password-456' }),
    });
    expect(loginNew.status).toBe(200);

    // token cannot be reused
    const reused = await h.app.request('/auth/password/reset', {
      method: 'POST',
      headers: withCsrf(),
      body: JSON.stringify({ token, password: 'yet-another-password-789' }),
    });
    expect(reused.status).toBe(404);
    const body = (await reused.json()) as { error: { code: string } };
    expect(body.error.code).toBe('not_found');
  });

  it('reset revokes other sessions', async () => {
    const email = `revoke-${crypto.randomUUID()}@example.com`;
    await registerAndVerify(email, 'original-password-123');

    const [user] = await h.db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);

    await h.app.request('/auth/password/forgot', {
      method: 'POST',
      headers: withCsrf(),
      body: JSON.stringify({ email }),
    });
    const msg = h.mailer.sent.filter((m) => m.to === email).pop()!;
    const token = extractResetToken(msg.html);

    await h.app.request('/auth/password/reset', {
      method: 'POST',
      headers: withCsrf(),
      body: JSON.stringify({ token, password: 'brand-new-password-456' }),
    });

    const rows = await h.db.select().from(sessionsTable).where(eq(sessionsTable.userId, user!.id));
    expect(rows.every((r) => r.revokedAt !== null)).toBe(true);
  });

  it('expired reset token returns a clear error', async () => {
    const email = `expired-${crypto.randomUUID()}@example.com`;
    await registerAndVerify(email);

    h.clock.set(new Date('2026-09-18T00:00:00Z'));
    await h.app.request('/auth/password/forgot', {
      method: 'POST',
      headers: withCsrf(),
      body: JSON.stringify({ email }),
    });
    const msg = h.mailer.sent.filter((m) => m.to === email).pop()!;
    const token = extractResetToken(msg.html);

    // 20 minute expiry: jump forward 21 minutes
    h.clock.set(new Date('2026-09-18T00:21:00Z'));

    const res = await h.app.request('/auth/password/reset', {
      method: 'POST',
      headers: withCsrf(),
      body: JSON.stringify({ token, password: 'brand-new-password-456' }),
    });
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('not_found');
  });
});
