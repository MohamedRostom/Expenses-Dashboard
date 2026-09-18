// Mock connectors for local dev/e2e-ci: frankfurter + Notion fakes arrive with their phases.
// A frozen clock so tests can move time deterministically (used by Playwright fixtures).
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { createNotionMockApp } from './notion-fake-routes.js';

const app = new Hono();

let frozenAt: string | null = null;

app.get('/clock', (c) => c.json({ now: frozenAt ?? new Date().toISOString() }));

app.post('/clock', async (c) => {
  const body = await c.req.json<{ iso: string }>();
  frozenAt = body.iso;
  return c.json({ now: frozenAt });
});

// T083: NOTION_API_BASE points here at /notion — see infra/docker-compose.yml.
app.route('/notion', createNotionMockApp());

const port = Number(process.env.PORT ?? 4000);
serve({ fetch: app.fetch, port });
console.log(`[mocks] listening on :${port}`);
