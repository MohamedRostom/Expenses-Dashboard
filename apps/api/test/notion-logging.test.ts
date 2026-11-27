import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { startHarness, TEST_SECRET_BOX_KEY, type Harness } from './harness.js';
import { createSecretBox } from '../src/adapters/secret-box.js';
import { hashUserId, type Logger } from '../src/adapters/logger.js';
import { createNotionService } from '../src/services/notion.js';
import { createNotionRoutes } from '../src/routes/notion.js';
import type { ExpensesService } from '../src/services/expenses.js';

// Spec 005 T034 / FR-001.12 / research R10: one structured entry per failed exchange, renewal,
// refused access and failed revoke, carrying Notion's error code and never a secret.

let h: Harness;
beforeAll(async () => {
  h = await startHarness();
}, 120_000);
afterAll(async () => {
  await h.close();
});

// Uppercase hex: cannot collide with the lowercase event names, ids or error codes in the log.
const rnd = () => crypto.randomUUID().replace(/-/g, '').toUpperCase();

describe('Notion failure logging', () => {
  it('logs each failure once, with an error code and no secret', async () => {
    const entries: Array<Record<string, unknown>> = [];
    const logger: Logger = { log: (e) => void entries.push(e) };
    const ACCESS = `AT${rnd()}`;
    const REFRESH = `RT${rnd()}`;
    const CODE = `CODE${rnd()}`;
    const STATE = `STATE${rnd()}`;

    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      if (url.endsWith('/oauth/revoke')) return new Response('{}', { status: 500 });
      if (url.endsWith('/oauth/token')) {
        return new Response(
          JSON.stringify({ error: 'invalid_grant', error_description: `bad ${init?.body}` }),
          { status: 400 },
        );
      }
      return new Response('{}', { status: 401 }); // every API call: access refused
    };
    const svc = createNotionService(
      h.db,
      createSecretBox(TEST_SECRET_BOX_KEY),
      {
        clientId: 'cid',
        clientSecret: 'csecret',
        appOrigin: 'https://app.test',
        apiBase: 'https://notion.mock',
        fetchImpl,
      },
      {} as ExpensesService,
      { now: () => new Date() },
      undefined,
      logger,
    );
    const u = await h.asUser('notion-logging@test.com');
    const app = new Hono<{ Variables: { user: { id: string } } }>();
    app.use('*', async (c, next) => {
      c.set('user', { id: u.userId });
      await next();
    });
    app.route('/', createNotionRoutes({ notion: svc, appOrigin: 'https://app.test' }) as never);

    // 1. failed exchange (through the callback's failed seam)
    const res = await app.request(`/notion/callback?code=${CODE}&state=${STATE}`, {
      headers: { cookie: `__Host-desk_notion_oauth=${STATE}.${u.userId}` },
    });
    expect(res.headers.get('location')).toBe('/settings/connectors?notion=failed');

    // 2 + 3. a 401 whose renewal is refused: failed renewal, then refused access
    await svc.connect(u.userId, {
      access_token: ACCESS,
      refresh_token: REFRESH,
      workspace_id: 'w',
      workspace_name: 'W',
      bot_id: 'b',
    });
    await svc.setConnection(u.userId, {
      databaseId: 'd',
      dataSourceId: 'ds',
      direction: 'to_notion',
    });
    expect((await svc.syncNow(u.userId)).status).toBe('reconnect_needed');

    // 4. failed revoke
    await app.request('/notion/connection', { method: 'DELETE' });

    const find = (event: string, outcome: string) =>
      entries.filter((e) => e.event === event && e.outcome === outcome);
    for (const [event, outcome, notionError] of [
      ['notion.oauth', 'exchange_failed', 'invalid_grant'],
      ['notion.oauth', 'refresh_failed', 'unauthorized'],
      ['notion.sync', 'access_refused', 'unauthorized'],
      ['notion.oauth', 'revoke_failed', 'http_500'],
    ] as const) {
      const hits = find(event, outcome);
      expect(hits, `${event}/${outcome}`).toHaveLength(1);
      expect(hits[0]).toMatchObject({
        event,
        outcome,
        hashedUserId: await hashUserId(u.userId),
        notionError,
      });
    }
    expect(entries).toHaveLength(4);

    const text = JSON.stringify(entries);
    expect(entries.every((e) => !('userId' in e))).toBe(true);
    for (const secret of [ACCESS, REFRESH, CODE, STATE, u.userId]) {
      for (let i = 0; i + 6 <= secret.length; i++) {
        expect(text).not.toContain(secret.slice(i, i + 6));
      }
    }
  });
});
