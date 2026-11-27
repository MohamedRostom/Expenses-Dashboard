import { startHarness, type Harness } from './harness.js';
import { requestAs } from './unconfigured.js';

/**
 * SC-001.5 (BUG-001): an API call that asks for JSON never gets HTML or plain text back. Every
 * registered route is called with `Accept: application/json` (signed in, dummy path params) and
 * must answer JSON, or an empty-bodied 2xx/3xx. SPA page routes (/login, /settings, ...) are not
 * registered in the app: node.ts serves index.html for them only to GET/HEAD navigations whose
 * Accept includes text/html, so an unknown path asked for as JSON is a 404 `not_found` envelope.
 */

/** Routes that legitimately answer non-JSON; each needs a reason. */
const NON_JSON_ALLOWED: Record<string, string> = {};

describe('every route answers JSON', () => {
  let harness: Harness;
  let user: Awaited<ReturnType<Harness['asUser']>>;

  beforeAll(async () => {
    harness = await startHarness();
    user = await harness.asUser('routes-json@example.com');
  }, 120_000);

  afterAll(async () => {
    await harness?.close();
  });

  it('unknown path -> 404 not_found JSON', async () => {
    const res = await requestAs(harness.app, user, 'GET', '/no/such/path', {
      accept: 'application/json',
    });
    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).toContain('application/json');
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('not_found');
  });

  it('all registered routes', async () => {
    const seen = new Set<string>();
    const bad: string[] = [];
    for (const r of harness.app.routes) {
      if (r.method === 'ALL') continue; // middleware
      const path = r.path
        .replace(/:[A-Za-z]+(\{[^}]*\})?\??/g, '00000000-0000-0000-0000-000000000000')
        .replace(/\*/g, 'x');
      const key = `${r.method} ${path}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (NON_JSON_ALLOWED[`${r.method} ${r.path}`]) continue;

      const res = await requestAs(harness.app, user, r.method, path, {
        accept: 'application/json',
      });
      const type = res.headers.get('content-type') ?? '';
      const emptyOk = res.status >= 200 && res.status < 400 && (await res.clone().text()) === '';
      if (!type.includes('application/json') && !emptyOk)
        bad.push(`${key} -> ${res.status} ${type}`);
    }
    expect(seen.size).toBeGreaterThan(50);
    expect(bad).toEqual([]);
  }, 120_000);
});
