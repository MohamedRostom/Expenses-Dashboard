import { Hono } from 'hono';
import { csrf } from '../../src/middleware/csrf.js';
import { errorHandler } from '../../src/middleware/errors.js';

function buildApp() {
  const app = new Hono();
  app.onError(errorHandler);
  app.use('*', csrf);
  app.get('/x', (c) => c.text('ok'));
  app.post('/x', (c) => c.text('ok'));
  return app;
}

describe('csrf middleware', () => {
  it('allows GET requests without a token', async () => {
    const res = await buildApp().request('/x');
    expect(res.status).toBe(200);
  });

  it('issues the csrf cookie on a GET that has none, so a fresh browser can make its first POST', async () => {
    const res = await buildApp().request('/x');
    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).toMatch(/^desk_csrf=[^;]+; Max-Age=\d+; Path=\/; Secure; SameSite=Lax$/);
    // The value the browser stores is the one the client will echo back in the header.
    const token = setCookie.match(/^desk_csrf=([^;]+)/)?.[1] ?? '';
    const post = await buildApp().request('/x', {
      method: 'POST',
      headers: { cookie: `desk_csrf=${token}`, 'x-csrf-token': token },
    });
    expect(post.status).toBe(200);
  });

  it('does not rotate an existing csrf cookie on GET', async () => {
    const res = await buildApp().request('/x', { headers: { cookie: 'desk_csrf=abc123' } });
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('allows a non-GET request when the cookie and header match', async () => {
    const res = await buildApp().request('/x', {
      method: 'POST',
      headers: { cookie: 'desk_csrf=abc123', 'x-csrf-token': 'abc123' },
    });
    expect(res.status).toBe(200);
  });

  it('rejects a non-GET request with no csrf cookie or header', async () => {
    const res = await buildApp().request('/x', { method: 'POST' });
    expect(res.status).toBe(403);
    const body = (await res.json()) as {
      error: { code: string; message: string; details?: Record<string, unknown> };
    };
    expect(body.error.code).toBe('validation_failed');
  });

  it('rejects a non-GET request when cookie and header disagree', async () => {
    const res = await buildApp().request('/x', {
      method: 'POST',
      headers: { cookie: 'desk_csrf=abc123', 'x-csrf-token': 'different' },
    });
    expect(res.status).toBe(403);
  });
});
