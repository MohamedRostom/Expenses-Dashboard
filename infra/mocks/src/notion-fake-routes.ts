// T083: Notion-shaped fake routes backed by FakeNotion, shared between infra/mocks' standalone
// server (e2e-ci, docker-compose NOTION_API_BASE) and apps/api/test/notion.test.ts (mounted
// in-process via Hono's `.request()`, no real port needed).
//
// BUG-001 switches (mounted at /notion, NOTION_API_BASE=http://mocks:4000/notion). e2e drives them with
//   POST /notion/__control { authorize?: 'ok'|'denied', refresh?: 'ok'|'refused',
//                            revoke?: 'ok'|'error', sharedContent?: boolean }
// (partial bodies merge; `{ reset: true }` restores defaults). State is per mock app instance.
// Routes: GET /oauth/authorize (redirects to redirect_uri with code+state, or error=access_denied+state
// when authorize='denied'), POST /oauth/token (code exchange now also returns refresh_token;
// grant_type refresh_token -> 400 invalid_grant when refresh='refused', else rotated tokens),
// POST /oauth/revoke (500 when revoke='error'), POST /search (empty results when sharedContent=false).
import { Hono } from 'hono';
import { FakeNotion, NotionAuthError, NotionApiError } from '@desk/connectors/notion';

export function createNotionMockApp(fake: FakeNotion = new FakeNotion()) {
  const app = new Hono();

  function handleError(err: unknown): Response {
    if (err instanceof NotionAuthError) {
      return new Response(JSON.stringify({ message: err.message }), { status: 401 });
    }
    if (err instanceof NotionApiError) {
      return new Response(JSON.stringify({ message: err.message }), { status: err.status });
    }
    throw err;
  }

  const sw = { authorize: 'ok', refresh: 'ok', revoke: 'ok' };
  app.post('/__control', async (c) => {
    const b = (await c.req.json()) as Partial<typeof sw> & {
      sharedContent?: boolean;
      reset?: boolean;
    };
    if (b.reset) Object.assign(sw, { authorize: 'ok', refresh: 'ok', revoke: 'ok' });
    if (b.authorize) sw.authorize = b.authorize;
    if (b.refresh) sw.refresh = b.refresh;
    if (b.revoke) sw.revoke = b.revoke;
    if (b.reset) fake.setSharedContent(true);
    if (typeof b.sharedContent === 'boolean') fake.setSharedContent(b.sharedContent);
    return c.json({ ...sw });
  });

  app.get('/oauth/authorize', (c) => {
    const redirect = c.req.query('redirect_uri');
    if (!redirect) return c.text('redirect_uri required', 400);
    const url = new URL(redirect);
    if (sw.authorize === 'denied') url.searchParams.set('error', 'access_denied');
    else url.searchParams.set('code', 'fake-notion-code');
    const state = c.req.query('state');
    if (state) url.searchParams.set('state', state);
    return c.redirect(url.toString(), 302);
  });

  app.post('/oauth/revoke', async (c) => {
    try {
      if (sw.revoke === 'error') fake.failNextWith('revoke_error');
      await fake.revokeToken((await c.req.json()).token);
      return c.json({});
    } catch (err) {
      return handleError(err);
    }
  });

  app.post('/oauth/token', async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as {
      grant_type?: string;
      refresh_token?: string;
    };
    if (body.grant_type === 'refresh_token') {
      try {
        if (sw.refresh === 'refused') fake.failNextWith('refresh_refused');
        return c.json(await fake.refreshToken(body.refresh_token ?? ''));
      } catch {
        return c.json({ error: 'invalid_grant' }, 400);
      }
    }
    return c.json({
      access_token: 'fake-notion-access-token',
      refresh_token: 'fake-notion-refresh-token',
      workspace_id: 'fake-workspace-id',
      workspace_name: 'Fake Workspace',
      bot_id: 'fake-bot-id',
    });
  });

  app.post('/search', async (c) => {
    try {
      const results = await fake.searchDatabases();
      if (!(await fake.hasSharedContent())) return c.json({ results: [] });
      return c.json({
        results: results.map((d) => ({
          id: d.dataSourceId,
          name: d.title,
          parent: { type: 'database_id', database_id: d.databaseId },
          properties: d.properties,
        })),
      });
    } catch (err) {
      return handleError(err);
    }
  });

  app.post('/databases', async (c) => {
    try {
      const body = (await c.req.json()) as { title?: Array<{ text?: { content?: string } }> };
      const title = body.title?.[0]?.text?.content ?? 'Untitled';
      const created = await fake.createDatabase('fake-parent-page', title);
      return c.json({ id: created.id, data_sources: [{ id: created.dataSourceId }] }, 201);
    } catch (err) {
      return handleError(err);
    }
  });

  app.get('/data_sources/:id', async (c) => {
    // ensureLayout's GET — the fake tracks a flat property set, not per-data-source, so this
    // returns the fake's current view regardless of :id (fine for a single-connection fake).
    return c.json({ properties: {} });
  });

  app.patch('/data_sources/:id', async (c) => {
    try {
      await fake.ensureLayout(c.req.param('id'));
      return c.json({ ok: true });
    } catch (err) {
      return handleError(err);
    }
  });

  app.post('/data_sources/:id/query', async (c) => {
    try {
      const body = (await c.req.json().catch(() => ({}))) as { start_cursor?: string };
      const result = await fake.queryDataSource(c.req.param('id'), body.start_cursor);
      return c.json(result);
    } catch (err) {
      return handleError(err);
    }
  });

  app.post('/pages', async (c) => {
    try {
      const body = (await c.req.json()) as {
        parent: { data_source_id: string };
        properties: Record<string, unknown>;
      };
      const page = await fake.createPage(body.parent.data_source_id, body.properties);
      return c.json(page, 201);
    } catch (err) {
      return handleError(err);
    }
  });

  app.patch('/pages/:id', async (c) => {
    try {
      const body = (await c.req.json()) as {
        properties?: Record<string, unknown>;
        archived?: boolean;
      };
      const page = body.archived
        ? await fake.archivePage(c.req.param('id'))
        : await fake.updatePage(c.req.param('id'), body.properties ?? {});
      return c.json(page);
    } catch (err) {
      return handleError(err);
    }
  });

  return app;
}
