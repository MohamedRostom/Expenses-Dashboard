import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { expenseVersions, notionConnections } from '@desk/db';
import { startHarness, type Harness } from './harness.js';
import { SESSION_COOKIE } from '../src/middleware/session.js';

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
async function connectViaOAuth(sessionToken: string): Promise<Response> {
  const sessionCookie = `${SESSION_COOKIE}=${sessionToken}; ${CSRF_COOKIE}=${CSRF_TOKEN}`;
  const startRes = await h.app.request('/notion/start', { headers: { cookie: sessionCookie } });
  expect(startRes.status).toBe(302);
  const setCookie = startRes.headers.get('set-cookie') ?? '';
  const stateCookieMatch = /desk_notion_oauth_state=([^;]+)/.exec(setCookie);
  const state = stateCookieMatch?.[1];
  expect(state).toBeTruthy();

  return h.app.request(`/notion/callback?code=fake-code&state=${state}`, {
    headers: { cookie: `${sessionCookie}; desk_notion_oauth_state=${state}` },
  });
}

describe('Notion OAuth + connection', () => {
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

  it('error state on a revoked token surfaces on the connection and stops the sync', async () => {
    const user = await h.asUser('notion-revoked@test.com');
    await connectViaOAuth(user.sessionToken);
    await user.put('/notion/connection', {
      databaseId: 'db-e',
      dataSourceId: 'ds-e',
      direction: 'both',
    });

    h.notionFake.failNextWith('unauthorized');
    const syncRes = await user.post('/notion/sync');
    expect(syncRes.status).toBe(200);
    const body = (await syncRes.json()) as { status: string };
    expect(body.status).toBe('error');

    const connRes = await user.get('/notion/connection');
    const connBody = (await connRes.json()) as {
      connection: { status: string; lastError: string | null };
    };
    expect(connBody.connection.status).toBe('error');
    expect(connBody.connection.lastError).toBeTruthy();
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
