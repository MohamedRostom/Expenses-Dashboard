// T083: Notion-shaped fake routes backed by FakeNotion, shared between infra/mocks' standalone
// server (e2e-ci, docker-compose NOTION_API_BASE) and apps/api/test/notion.test.ts (mounted
// in-process via Hono's `.request()`, no real port needed).
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

  app.post('/oauth/token', async (c) => {
    return c.json({
      access_token: 'fake-notion-access-token',
      workspace_id: 'fake-workspace-id',
      workspace_name: 'Fake Workspace',
      bot_id: 'fake-bot-id',
    });
  });

  app.post('/search', async (c) => {
    try {
      const results = await fake.searchDatabases();
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
