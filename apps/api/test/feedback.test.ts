import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startHarness, type Harness } from './harness.js';

// T109: failing-first tests for POST /feedback — 2,000-char limit, consent-gated metadata,
// per-user rate limit (5/hour, see routes/feedback.ts).

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function j(res: Response): Promise<any> {
  return res.json();
}

describe('POST /feedback', () => {
  let h: Harness;

  beforeAll(async () => {
    h = await startHarness();
  }, 120_000);

  afterAll(async () => {
    await h.close();
  });

  it('accepts feedback from an authenticated user', async () => {
    const user = await h.asUser('feedback-basic@example.com');
    const res = await user.post('/feedback', {
      page: '/month',
      message: 'Loving the app so far',
      contactOk: false,
    });
    expect(res.status).toBe(202);
  });

  it('rejects a message over 2,000 characters', async () => {
    const user = await h.asUser('feedback-toolong@example.com');
    const res = await user.post('/feedback', {
      page: '/month',
      message: 'x'.repeat(2001),
      contactOk: false,
    });
    expect(res.status).toBe(400);
  });

  it('accepts a message at exactly the 2,000-character limit', async () => {
    const user = await h.asUser('feedback-atlimit@example.com');
    const res = await user.post('/feedback', {
      page: '/month',
      message: 'x'.repeat(2000),
      contactOk: false,
    });
    expect(res.status).toBe(202);
  });

  it('omits identifying metadata when contactOk is false', async () => {
    const user = await h.asUser('feedback-noconsent@example.com');
    const res = await user.post('/feedback', {
      page: '/settings',
      message: 'no consent here',
      contactOk: false,
    });
    expect(res.status).toBe(202);

    const rows = await h.db.query.feedback.findMany({
      where: (f, { eq }) => eq(f.userId, user.userId),
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.userAgent).toBeNull();
  });

  it('captures the user agent when contactOk is true', async () => {
    const user = await h.asUser('feedback-consent@example.com');
    const res = await h.app.request('/feedback', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: `__Host-desk_session=${user.sessionToken}; __Host-desk_csrf=test-csrf-token`,
        'x-csrf-token': 'test-csrf-token',
        'user-agent': 'vitest-agent/1.0',
      },
      body: JSON.stringify({
        page: '/settings',
        message: 'happy to be contacted',
        contactOk: true,
      }),
    });
    expect(res.status).toBe(202);

    const rows = await h.db.query.feedback.findMany({
      where: (f, { eq }) => eq(f.userId, user.userId),
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.userAgent).not.toBeNull();
  });

  it('allows an anonymous (unauthenticated) submission with a null user_id', async () => {
    // No session cookie — still needs the CSRF double-submit pair, per middleware/csrf.ts.
    const res = await h.app.request('/feedback', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: '__Host-desk_csrf=anon-csrf-token',
        'x-csrf-token': 'anon-csrf-token',
      },
      body: JSON.stringify({ page: '/landing', message: 'anonymous note', contactOk: false }),
    });
    expect(res.status).toBe(202);
  });

  it('rate limits repeated submissions from the same user', async () => {
    const user = await h.asUser('feedback-ratelimited@example.com');
    let last: Response | undefined;
    for (let i = 0; i < 6; i++) {
      last = await user.post('/feedback', {
        page: '/month',
        message: `attempt ${i}`,
        contactOk: false,
      });
    }
    expect(last?.status).toBe(429);
    const body = await j(last!);
    expect(body.error.code).toBe('rate_limited');
  });
});
