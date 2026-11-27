import { startHarness, type Harness } from './harness.js';
import { requestAs, unconfiguredNotionApp } from './unconfigured.js';

// BUG-001 / contracts/notion-api.md "When Notion is not configured".
const JSON_ROUTES: [string, string][] = [
  ['GET', '/notion/connection'],
  ['PUT', '/notion/connection'],
  ['DELETE', '/notion/connection'],
  ['GET', '/notion/databases'],
  ['POST', '/notion/databases'],
  ['POST', '/notion/sync'],
];

describe('Notion not configured', () => {
  let harness: Harness;
  let app: ReturnType<typeof unconfiguredNotionApp>;
  let user: Awaited<ReturnType<Harness['asUser']>>;

  beforeAll(async () => {
    harness = await startHarness();
    app = unconfiguredNotionApp(harness);
    user = await harness.asUser('notion-unavailable@example.com');
  }, 120_000);

  afterAll(async () => {
    await harness?.close();
  });

  it.each(JSON_ROUTES)('%s %s signed in -> 503 feature_unavailable', async (method, path) => {
    const res = await requestAs(app, user, method, path);
    expect(res.status).toBe(503);
    expect(res.headers.get('content-type')).toContain('application/json');
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('feature_unavailable');
  });

  it.each(JSON_ROUTES)('%s %s unauthenticated -> 401', async (method, path) => {
    const res = await requestAs(app, null, method, path);
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('unauthenticated');
  });

  it.each(['/notion/start', '/notion/callback'])('GET %s -> 302 unavailable', async (path) => {
    const res = await requestAs(app, user, 'GET', path);
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/settings/connectors?notion=unavailable');
  });
});
