import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { expenses as expensesTable, expenseVersions, notionConnections } from '@desk/db';
import { Hono } from 'hono';
import { startHarness, TEST_SECRET_BOX_KEY, type Harness } from './harness.js';
import { createSecretBox } from '../src/adapters/secret-box.js';
import { createNotionService } from '../src/services/notion.js';
import { createNotionRoutes } from '../src/routes/notion.js';
import type { ExpensesService } from '../src/services/expenses.js';
import { SESSION_COOKIE } from '../src/middleware/session.js';
import { notionSyncJob } from '../src/jobs/notion-sync.js';
import { createNotionMockApp } from '../../../infra/mocks/src/notion-fake-routes.js';

const CSRF_COOKIE = '__Host-desk_csrf';
const CSRF_TOKEN = 'test-csrf-token';

let h: Harness;

beforeAll(async () => {
  h = await startHarness();
}, 120_000);

afterAll(async () => {
  await h.close();
});

/** Drives GET /notion/start -> GET /notion/callback directly against h.app (bypassing the
 * ApiClient wrapper, which fixes its cookie header) so the oauth-state cookie set by /start
 * can be threaded into /callback, exactly as a real browser redirect would. */
const OAUTH_COOKIE = '__Host-desk_notion_oauth';

/** Runs /notion/start as the user and returns the oauth cookie pair, ready to send back. */
async function startAttempt(sessionToken: string): Promise<{ pair: string; state: string }> {
  const sessionCookie = `${SESSION_COOKIE}=${sessionToken}; ${CSRF_COOKIE}=${CSRF_TOKEN}`;
  const startRes = await h.app.request('/notion/start', { headers: { cookie: sessionCookie } });
  expect(startRes.status).toBe(302);
  const m = new RegExp(`${OAUTH_COOKIE}=([^;]+)`).exec(startRes.headers.get('set-cookie') ?? '');
  expect(m?.[1]).toBeTruthy();
  return { pair: `${OAUTH_COOKIE}=${m![1]}`, state: m![1]!.split('.')[0]! };
}

async function callback(query: string, cookies: string[]): Promise<Response> {
  return h.app.request(`/notion/callback?${query}`, { headers: { cookie: cookies.join('; ') } });
}

async function connectViaOAuth(sessionToken: string): Promise<Response> {
  const sessionCookie = `${SESSION_COOKIE}=${sessionToken}; ${CSRF_COOKIE}=${CSRF_TOKEN}`;
  const { pair, state } = await startAttempt(sessionToken);
  return callback(`code=fake-code&state=${state}`, [sessionCookie, pair]);
}

const rowFor = async (userId: string) =>
  (await h.db.select().from(notionConnections).where(eq(notionConnections.userId, userId)))[0];

/** Asserts the contract's callback shape: 302 to the outcome, cookie cleared, no body. */
async function expectOutcome(res: Response, outcome: string): Promise<void> {
  expect(res.status).toBe(302);
  expect(res.headers.get('location')).toBe(`/settings/connectors?notion=${outcome}`);
  expect(res.headers.get('set-cookie') ?? '').toMatch(new RegExp(`${OAUTH_COOKIE}=;`));
  expect(await res.text()).toBe('');
}

/** Same routes over a real service with a scripted fetch/authorize base, signed in as `userId`. */
function appWith(userId: string, cfg: { fetchImpl?: typeof fetch; authorizeBrowserBase?: string }) {
  const svc = createNotionService(
    h.db,
    createSecretBox(TEST_SECRET_BOX_KEY),
    {
      clientId: 'cid',
      clientSecret: 'csecret',
      appOrigin: 'https://app.test',
      apiBase: 'https://notion.mock',
      ...cfg,
    },
    {} as ExpensesService,
    { now: () => new Date() },
  );
  const app = new Hono<{ Variables: { user: { id: string } } }>();
  app.use('*', async (c, next) => {
    c.set('user', { id: userId });
    await next();
  });
  app.route('/', createNotionRoutes({ notion: svc, appOrigin: 'https://app.test' }) as never);
  return app;
}

describe('Notion OAuth + connection', () => {
  it('start: signed out goes to login; signed in sets the host-prefixed attempt cookie', async () => {
    const out = await h.app.request('/notion/start');
    expect(out.status).toBe(302);
    expect(out.headers.get('location')).toBe('/login?next=/settings/connectors');

    const user = await h.asUser('notion-start@test.com');
    const res = await h.app.request('/notion/start', {
      headers: { cookie: `${SESSION_COOKIE}=${user.sessionToken}` },
    });
    const sc = res.headers.get('set-cookie') ?? '';
    expect(sc).toMatch(new RegExp(`${OAUTH_COOKIE}=[^;]+\\.${user.userId};`));
    expect(sc).toContain('HttpOnly');
    expect(sc).toContain('Secure');
    expect(sc).toContain('Path=/');
    expect(sc).toContain('Max-Age=600');
    expect(res.headers.get('location')).toMatch(
      /^https:\/\/api\.notion\.com\/v1\/oauth\/authorize\?/,
    );
  });

  it('start: NOTION_AUTHORIZE_BROWSER_BASE, when set, is the authorize base', async () => {
    const user = await h.asUser('notion-browser-base@test.com');
    const res = await appWith(user.userId, {
      authorizeBrowserBase: 'http://localhost:4000/notion',
    }).request('/notion/start');
    expect(res.headers.get('location')).toMatch(
      /^http:\/\/localhost:4000\/notion\/oauth\/authorize\?/,
    );
  });

  it('callback stores both tokens sealed and redirects with notion=connected', async () => {
    const user = await h.asUser('notion-both-tokens@test.com');
    await expectOutcome(await connectViaOAuth(user.sessionToken), 'connected');
    const row = await rowFor(user.userId);
    const dec = (b: Uint8Array | null) => new TextDecoder().decode(b ?? new Uint8Array());
    expect(row!.refreshTokenEnc).toBeTruthy();
    expect(dec(row!.accessTokenEnc)).not.toBe('fake-notion-access-token');
    expect(dec(row!.refreshTokenEnc)).not.toBe('fake-notion-refresh-token');
    expect(dec(row!.refreshTokenEnc)).not.toBe('');
  });

  describe('callback outcomes', () => {
    const sess = (t: string) => `${SESSION_COOKIE}=${t}; ${CSRF_COOKIE}=${CSRF_TOKEN}`;

    it('error=access_denied -> denied, nothing stored', async () => {
      const u = await h.asUser('notion-o-denied@test.com');
      const { pair, state } = await startAttempt(u.sessionToken);
      await expectOutcome(
        await callback(`error=access_denied&state=${state}`, [sess(u.sessionToken), pair]),
        'denied',
      );
      expect(await rowFor(u.userId)).toBeUndefined();
    });

    it('any other error -> failed, nothing stored', async () => {
      const u = await h.asUser('notion-o-failed@test.com');
      const { pair, state } = await startAttempt(u.sessionToken);
      await expectOutcome(
        await callback(`error=server_error&state=${state}`, [sess(u.sessionToken), pair]),
        'failed',
      );
      expect(await rowFor(u.userId)).toBeUndefined();
    });

    it('no cookie -> expired', async () => {
      const u = await h.asUser('notion-o-nocookie@test.com');
      await expectOutcome(await callback('code=c&state=x', [sess(u.sessionToken)]), 'expired');
      expect(await rowFor(u.userId)).toBeUndefined();
    });

    it('wrong state -> expired', async () => {
      const u = await h.asUser('notion-o-badstate@test.com');
      const { pair } = await startAttempt(u.sessionToken);
      await expectOutcome(
        await callback('code=c&state=other', [sess(u.sessionToken), pair]),
        'expired',
      );
      expect(await rowFor(u.userId)).toBeUndefined();
    });

    it('cookie minted for another user -> expired', async () => {
      const a = await h.asUser('notion-o-a@test.com');
      const b = await h.asUser('notion-o-b@test.com');
      const { pair, state } = await startAttempt(a.sessionToken);
      await expectOutcome(
        await callback(`code=c&state=${state}`, [sess(b.sessionToken), pair]),
        'expired',
      );
      expect(await rowFor(b.userId)).toBeUndefined();
    });

    it('signed out -> expired', async () => {
      const u = await h.asUser('notion-o-signedout@test.com');
      const { pair, state } = await startAttempt(u.sessionToken);
      await expectOutcome(await callback(`code=c&state=${state}`, [pair]), 'expired');
      expect(await rowFor(u.userId)).toBeUndefined();
    });

    it('replayed link (cookie already cleared) -> expired', async () => {
      const u = await h.asUser('notion-o-replay@test.com');
      const { state } = await startAttempt(u.sessionToken);
      await expectOutcome(
        await callback(`code=c&state=${state}`, [sess(u.sessionToken)]),
        'expired',
      );
    });

    it('exchange 4xx -> failed, nothing stored', async () => {
      const u = await h.asUser('notion-o-exch4xx@test.com');
      const { pair, state } = await startAttempt(u.sessionToken);
      const app = appWith(u.userId, {
        fetchImpl: async () => new Response('{"error":"invalid_grant"}', { status: 400 }),
      });
      await expectOutcome(
        await app.request(`/notion/callback?code=c&state=${state}`, { headers: { cookie: pair } }),
        'failed',
      );
      expect(await rowFor(u.userId)).toBeUndefined();
    });

    it('Notion unreachable -> failed, nothing stored', async () => {
      const u = await h.asUser('notion-o-unreach@test.com');
      const { pair, state } = await startAttempt(u.sessionToken);
      const app = appWith(u.userId, {
        fetchImpl: async () => {
          throw new TypeError('fetch failed');
        },
      });
      await expectOutcome(
        await app.request(`/notion/callback?code=c&state=${state}`, { headers: { cookie: pair } }),
        'failed',
      );
      expect(await rowFor(u.userId)).toBeUndefined();
    });

    it('nothing shared -> no_pages, connection stored', async () => {
      const u = await h.asUser('notion-o-nopages@test.com');
      h.notionFake.setSharedContent(false);
      try {
        await expectOutcome(await connectViaOAuth(u.sessionToken), 'no_pages');
      } finally {
        h.notionFake.setSharedContent(true);
      }
      expect((await rowFor(u.userId))?.status).toBe('connected');
    });
  });

  it('reconnecting to a different workspace clears database, data source and cursor', async () => {
    const u = await h.asUser('notion-ws-change@test.com');
    await connectViaOAuth(u.sessionToken);
    await h.db
      .update(notionConnections)
      .set({ databaseId: 'db-1', dataSourceId: 'ds-1', cursor: new Date(), workspaceId: 'old-ws' })
      .where(eq(notionConnections.userId, u.userId));
    await connectViaOAuth(u.sessionToken); // mock returns workspace_id 'fake-workspace-id'
    const row = await rowFor(u.userId);
    expect(row!.workspaceId).toBe('fake-workspace-id');
    expect(row!.databaseId).toBeNull();
    expect(row!.dataSourceId).toBeNull();
    expect(row!.cursor).toBeNull();
  });

  it('callback stores an encrypted access token and a connected status', async () => {
    const user = await h.asUser('notion-oauth@test.com');
    const callbackRes = await connectViaOAuth(user.sessionToken);
    expect(callbackRes.status).toBe(302);
    expect(callbackRes.headers.get('location')).toContain('/settings/connectors');

    const [row] = await h.db
      .select()
      .from(notionConnections)
      .where(eq(notionConnections.userId, user.userId));
    expect(row).toBeTruthy();
    expect(row!.status).toBe('connected');
    expect(row!.workspaceName).toBe('Fake Workspace');
    // Encrypted at rest: never the plaintext fake token.
    expect(row!.accessTokenEnc.toString()).not.toContain('fake-notion-access-token');

    const connRes = await user.get('/notion/connection');
    expect(connRes.status).toBe(200);
    const body = (await connRes.json()) as {
      connection: { status: string; workspaceName: string };
    };
    expect(body.connection.status).toBe('connected');
    expect(body.connection.workspaceName).toBe('Fake Workspace');
  });

  it('lists databases with a compatibility flag', async () => {
    const user = await h.asUser('notion-list@test.com');
    await connectViaOAuth(user.sessionToken);

    const res = await user.get('/notion/databases');
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      databases: Array<{
        databaseId: string;
        dataSourceId: string;
        title: string;
        compatible: boolean;
      }>;
    };
    expect(body.databases.length).toBeGreaterThan(0);
    // C10: databaseId and dataSourceId are distinct fields — 2025-09-03 databases are
    // containers of data sources, and queries/writes go against the data source id.
    expect(body.databases[0]!.databaseId).toBeTruthy();
    expect(body.databases[0]!.dataSourceId).toBeTruthy();
    expect(body.databases[0]!.compatible).toBe(true);
  });

  it('creates a database with the known layout', async () => {
    const user = await h.asUser('notion-create@test.com');
    await connectViaOAuth(user.sessionToken);

    const res = await user.post('/notion/databases', {
      parentPageId: 'page-1',
      title: 'My Expenses',
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { database: { id: string; dataSourceId: string } };
    expect(body.database.id).toBeTruthy();
    expect(body.database.dataSourceId).toBeTruthy();
  });

  it('PUT connection reconnecting to the same table resumes links; a different table starts fresh', async () => {
    const user = await h.asUser('notion-reconnect@test.com');
    await connectViaOAuth(user.sessionToken);

    const putSame = await user.put('/notion/connection', {
      databaseId: 'db-a',
      dataSourceId: 'ds-a',
      direction: 'both',
    });
    expect(putSame.status).toBe(200);

    const expenseRes = await user.post('/expenses', {
      description: 'Coffee',
      amount: { minor: 350, currency: 'GBP' },
      date: '2026-09-01',
      categoryId: null,
      paidWith: 'card',
      kind: 'variable',
    });
    const { expense } = (await expenseRes.json()) as { expense: { id: string } };
    await h.db
      .update((await import('@desk/db')).expenses)
      .set({ notionPageId: 'page-linked' })
      .where(eq((await import('@desk/db')).expenses.id, expense.id));

    // Reconnecting to the SAME database (db-a) keeps the link.
    const putSameAgain = await user.put('/notion/connection', {
      databaseId: 'db-a',
      dataSourceId: 'ds-a',
      direction: 'both',
    });
    expect(putSameAgain.status).toBe(200);
    let [row] = await h.db
      .select()
      .from((await import('@desk/db')).expenses)
      .where(eq((await import('@desk/db')).expenses.id, expense.id));
    expect(row!.notionPageId).toBe('page-linked');

    // Switching to a DIFFERENT database clears the link and the cursor.
    const putDifferent = await user.put('/notion/connection', {
      databaseId: 'db-b',
      dataSourceId: 'ds-b',
      direction: 'both',
    });
    expect(putDifferent.status).toBe(200);
    [row] = await h.db
      .select()
      .from((await import('@desk/db')).expenses)
      .where(eq((await import('@desk/db')).expenses.id, expense.id));
    expect(row!.notionPageId).toBeNull();

    const [conn] = await h.db
      .select()
      .from(notionConnections)
      .where(eq(notionConnections.userId, user.userId));
    expect(conn!.cursor).toBeNull();
  });

  it('DELETE connection keeps expense rows and their notion_page_id links', async () => {
    const user = await h.asUser('notion-disconnect@test.com');
    await connectViaOAuth(user.sessionToken);
    await user.put('/notion/connection', {
      databaseId: 'db-x',
      dataSourceId: 'ds-x',
      direction: 'both',
    });

    const expenseRes = await user.post('/expenses', {
      description: 'Lunch',
      amount: { minor: 800, currency: 'GBP' },
      date: '2026-09-02',
      categoryId: null,
      paidWith: 'card',
      kind: 'variable',
    });
    const { expenses } = await import('@desk/db');
    const { expense } = (await expenseRes.json()) as { expense: { id: string } };
    await h.db
      .update(expenses)
      .set({ notionPageId: 'page-kept' })
      .where(eq(expenses.id, expense.id));

    const delRes = await user.delete('/notion/connection');
    expect(delRes.status).toBe(204);

    const [conn] = await h.db
      .select()
      .from(notionConnections)
      .where(eq(notionConnections.userId, user.userId));
    expect(conn!.status).toBe('disconnected');

    const [row] = await h.db.select().from(expenses).where(eq(expenses.id, expense.id));
    expect(row!.notionPageId).toBe('page-kept');
  });

  it('sync-now debounces repeat calls within the window', async () => {
    const user = await h.asUser('notion-debounce@test.com');
    await connectViaOAuth(user.sessionToken);
    await user.put('/notion/connection', {
      databaseId: 'db-d',
      dataSourceId: 'ds-d',
      direction: 'both',
    });

    const first = await user.post('/notion/sync');
    const firstBody = (await first.json()) as { applied: number };

    const second = await user.post('/notion/sync');
    const secondBody = (await second.json()) as { applied: number };

    // The debounced repeat did not re-run the diff (no new applied count reported for it —
    // it echoes the still-fresh status from the first call rather than hitting Notion again).
    expect(second.status).toBe(200);
    expect(secondBody.applied).toBe(0);
    void firstBody;
  });

  // N+1 guards. Per-entry Notion calls and expense writes legitimately scale with N, so each
  // test varies only the thing under test and keeps everything else identical.
  const remoteProps = (description: string, category: string | null) => ({
    Expense: { title: [{ plain_text: description }] },
    Amount: { number: 5 },
    Currency: { select: { name: 'GBP' } },
    Date: { date: { start: '2026-09-10' } },
    ...(category ? { Category: { select: { name: category } } } : {}),
    'Paid with': { select: { name: 'card' } },
    Kind: { select: { name: 'variable' } },
    'Added via': { select: { name: 'notion' } },
  });
  const connect = async (email: string, direction: string) => {
    const user = await h.asUser(email);
    await connectViaOAuth(user.sessionToken);
    await user.put('/notion/connection', {
      databaseId: `db-${email}`,
      dataSourceId: `ds-${email}`,
      direction,
    });
    return user;
  };

  it('importing pages with a category costs the same queries as without (no per-row category lookup)', async () => {
    const measure = async (tag: string, category: string | null) => {
      const user = await connect(`notion-cat-${tag}@test.com`, 'from_notion');
      const pageIds: string[] = [];
      for (let i = 0; i < 5; i++) {
        const p = await h.notionFake.createPage('ds', remoteProps(`${tag} ${i}`, category));
        pageIds.push(p.id);
      }
      const before = h.queries();
      const body = (await (await user.post('/notion/sync')).json()) as { applied: number };
      const delta = h.queries() - before;
      expect(body.applied).toBe(5);
      for (const id of pageIds) await h.notionFake.archivePage(id);
      return delta;
    };
    const without = await measure('plain', null);
    const withCategory = await measure('cat', 'Groceries');
    // one category load for the whole pass, not one per row
    expect(withCategory).toBeLessThanOrEqual(without + 1);
  });

  it('recording sync conflicts costs the same queries for 1 conflict as for 5', async () => {
    const measure = async (n: number) => {
      const user = await connect(`notion-conflict-${n}@test.com`, 'to_notion');
      for (let i = 0; i < n; i++) {
        const res = await user.post('/expenses', {
          description: `Local ${n} ${i}`,
          amount: { minor: 100, currency: 'GBP' },
          date: '2026-09-10',
          categoryId: null,
          paidWith: 'card',
          kind: 'variable',
        });
        const { expense } = (await res.json()) as { expense: { id: string } };
        // remote edited after the local row, content differs: a conflict the remote side wins,
        // which a to_notion-only connection records but does not apply.
        const page = await h.notionFake.createPage('ds', remoteProps(`Remote ${n} ${i}`, null));
        await h.db
          .update(expensesTable)
          .set({ notionPageId: page.id })
          .where(eq(expensesTable.id, expense.id));
      }
      const before = h.queries();
      const body = (await (await user.post('/notion/sync')).json()) as { conflicts: number };
      const delta = h.queries() - before;
      expect(body.conflicts).toBe(n);
      return delta;
    };
    expect(await measure(5)).toBe(await measure(1));
  });

  it('applies a sync and writes expense_versions for created/updated rows', async () => {
    const user = await h.asUser('notion-sync-run@test.com');
    await connectViaOAuth(user.sessionToken);
    await user.put('/notion/connection', {
      databaseId: 'db-s',
      dataSourceId: 'ds-s',
      direction: 'both',
    });

    const expenseRes = await user.post('/expenses', {
      description: 'Groceries',
      amount: { minor: 1200, currency: 'GBP' },
      date: '2026-09-03',
      categoryId: null,
      paidWith: 'card',
      kind: 'variable',
    });
    const { expense } = (await expenseRes.json()) as { expense: { id: string } };

    const syncRes = await user.post('/notion/sync');
    expect(syncRes.status).toBe(200);
    const syncBody = (await syncRes.json()) as { applied: number };
    expect(syncBody.applied).toBeGreaterThan(0);

    const versionsRes = await user.get(`/expenses/${expense.id}/versions`);
    expect(versionsRes.status).toBe(200);
    const versionsBody = (await versionsRes.json()) as { versions: Array<{ source: string }> };
    expect(versionsBody.versions.length).toBeGreaterThan(0);
    expect(versionsBody.versions.some((v) => v.source === 'app')).toBe(true);

    const rows = await h.db
      .select()
      .from(expenseVersions)
      .where(eq(expenseVersions.expenseId, expense.id));
    expect(rows.length).toBeGreaterThan(0);
  });
});

// Spec 005 T032/T033 (BUG-001): token renewal, reconnect_needed and revoke-on-disconnect, against
// a service of the test's own so the clock and the Notion fetch are scriptable.
describe('Notion token renewal and revoke', () => {
  const box = createSecretBox(TEST_SECRET_BOX_KEY);
  const open = async (b: Uint8Array | null) =>
    box.open(new TextDecoder().decode(b ?? new Uint8Array()));

  function rig(wrap?: (next: typeof fetch) => typeof fetch) {
    const clock = { t: new Date('2026-10-01T00:00:00Z') };
    const mock = createNotionMockApp(h.notionFake);
    const calls = { n: 0 };
    const real: typeof fetch = async (input, init) => {
      calls.n += 1;
      return mock.request(String(input).replace('https://notion.mock', ''), init);
    };
    const svc = createNotionService(
      h.db,
      box,
      {
        clientId: 'cid',
        clientSecret: 'csecret',
        appOrigin: 'https://app.test',
        apiBase: 'https://notion.mock',
        fetchImpl: wrap ? wrap(real) : real,
      },
      {} as ExpensesService,
      { now: () => clock.t },
    );
    return {
      svc,
      clock,
      calls,
      advance: () => {
        clock.t = new Date(clock.t.getTime() + 11_000);
      },
    };
  }

  async function connected(svc: ReturnType<typeof rig>['svc'], email: string, withRefresh = true) {
    const u = await h.asUser(email);
    await svc.connect(u.userId, {
      access_token: 'at-old',
      ...(withRefresh && { refresh_token: 'rt-old' }),
      workspace_id: 'w',
      workspace_name: 'W',
      bot_id: 'b',
    });
    await svc.setConnection(u.userId, {
      databaseId: 'd',
      dataSourceId: 'ds',
      direction: 'to_notion',
    });
    return u.userId;
  }

  it('401 then a successful renewal: sync succeeds, both tokens replaced', async () => {
    const { svc } = rig();
    const id = await connected(svc, 'notion-renew-ok@test.com');
    h.notionFake.failNextWith('unauthorized');
    const res = await svc.syncNow(id);
    expect(res.status).toBe('connected');
    const row = await rowFor(id);
    expect(row!.status).toBe('connected');
    expect(await open(row!.accessTokenEnc)).toMatch(/^fake-notion-access-token-/);
    expect(await open(row!.refreshTokenEnc)).toMatch(/^fake-notion-refresh-token-/);
  });

  it('401 then a refused renewal: reconnect_needed, then no Notion calls at all', async () => {
    const { svc, calls, advance } = rig();
    const id = await connected(svc, 'notion-renew-refused@test.com');
    h.notionFake.failNextWith('unauthorized');
    h.notionFake.failNextWith('refresh_refused');
    expect((await svc.syncNow(id)).status).toBe('reconnect_needed');
    expect((await rowFor(id))!.status).toBe('reconnect_needed');

    advance();
    const before = calls.n;
    expect((await svc.syncNow(id)).status).toBe('reconnect_needed');
    expect(calls.n).toBe(before);

    // the debounced write trigger does nothing either
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    svc.triggerSyncSoon(id);
    await vi.advanceTimersByTimeAsync(11_000);
    vi.useRealTimers();
    await new Promise((r) => setTimeout(r, 300));
    expect(calls.n).toBe(before);
  });

  it('legacy row without a refresh token: 401 goes straight to reconnect_needed', async () => {
    const { svc } = rig();
    const id = await connected(svc, 'notion-legacy@test.com', false);
    expect((await rowFor(id))!.refreshTokenEnc).toBeNull();
    h.notionFake.failNextWith('unauthorized');
    expect((await svc.syncNow(id)).status).toBe('reconnect_needed');
  });

  it('a transient 5xx is status error and the next sync retries; reconnect restores connected', async () => {
    let failOnce = true;
    const { svc, advance } = rig((next) => async (input, init) => {
      if (failOnce && String(input).includes('/query')) {
        failOnce = false;
        return new Response('{}', { status: 503 });
      }
      return next(input, init);
    });
    const id = await connected(svc, 'notion-transient@test.com');
    expect((await svc.syncNow(id)).status).toBe('error');
    advance();
    expect((await svc.syncNow(id)).status).toBe('connected');

    h.notionFake.failNextWith('unauthorized');
    h.notionFake.failNextWith('refresh_refused');
    advance();
    expect((await svc.syncNow(id)).status).toBe('reconnect_needed');
    await svc.connect(id, {
      access_token: 'at-new',
      refresh_token: 'rt-new',
      workspace_id: 'w',
      workspace_name: 'W',
      bot_id: 'b',
    });
    expect((await rowFor(id))!.status).toBe('connected');
  });

  it('SC-001.4: the job reschedules within 5 minutes, and refused renewal flags the same run', async () => {
    const { svc, clock } = rig();
    const id = await connected(svc, 'notion-job@test.com');
    const scheduled: Array<{ runAfter?: Date | undefined }> = [];
    const job = notionSyncJob({
      notion: svc,
      clock: { now: () => clock.t },
      enqueue: async (_n, _p, opts) => {
        scheduled.push({ runAfter: opts?.runAfter });
        return 'j';
      },
    });
    await job({ userId: id }, { updateProgress: async () => {} });
    expect(scheduled).toHaveLength(1);
    expect(scheduled[0]!.runAfter!.getTime() - clock.t.getTime()).toBeLessThanOrEqual(5 * 60_000);

    clock.t = new Date(clock.t.getTime() + 11_000);
    h.notionFake.failNextWith('unauthorized');
    h.notionFake.failNextWith('refresh_refused');
    await job({ userId: id }, { updateProgress: async () => {} });
    expect((await rowFor(id))!.status).toBe('reconnect_needed');
    expect(scheduled).toHaveLength(1); // nothing rescheduled for reconnect_needed
  });

  it('DELETE /notion/connection revokes at Notion and clears both tokens, even if revoke fails', async () => {
    const { svc } = rig();
    const id = await connected(svc, 'notion-revoke-ok@test.com');
    h.notionFake.revoked.length = 0;
    await svc.disconnectConnection(id);
    expect(h.notionFake.revoked).toEqual(['at-old']);
    let row = await rowFor(id);
    expect(row!.status).toBe('disconnected');
    expect(row!.accessTokenEnc.length).toBe(0);
    expect(row!.refreshTokenEnc).toBeNull();

    const id2 = await connected(svc, 'notion-revoke-500@test.com');
    h.notionFake.failNextWith('revoke_error');
    await svc.disconnectConnection(id2);
    row = await rowFor(id2);
    expect(row!.accessTokenEnc.length).toBe(0);
    expect(row!.refreshTokenEnc).toBeNull();
  });

  it('a revoke that never answers is abandoned after 5 s and the tokens are still cleared', async () => {
    const { svc } = rig(
      (next) => (input, init) =>
        String(input).includes('/oauth/revoke')
          ? new Promise<Response>((_res, rej) =>
              init?.signal?.addEventListener('abort', () => rej(new Error('aborted'))),
            )
          : next(input, init),
    );
    const id = await connected(svc, 'notion-revoke-hang@test.com');
    await svc.disconnectConnection(id);
    expect((await rowFor(id))!.accessTokenEnc.length).toBe(0);
  }, 15_000);

  it('DELETE /me revokes at Notion first and still deletes the account when revoke fails', async () => {
    for (const fail of [false, true]) {
      const u = await h.asUser(`notion-me-${fail}@test.com`);
      await connectViaOAuth(u.sessionToken);
      h.notionFake.revoked.length = 0;
      if (fail) h.notionFake.failNextWith('revoke_error');
      const res = await u.delete('/me', { password: 'test-password' });
      expect(res.status).toBe(204);
      expect(h.notionFake.revoked).toEqual(['fake-notion-access-token']);
      expect(await rowFor(u.userId)).toBeUndefined();
    }
  });
});
