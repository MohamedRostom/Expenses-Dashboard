// Mock connectors for local dev/e2e-ci: frankfurter + Notion fakes arrive with their phases.
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { createNotionMockApp } from './notion-fake-routes.js';

const app = new Hono();

// T083: NOTION_API_BASE points here at /notion — see infra/docker-compose.yml.
app.route('/notion', createNotionMockApp());

const port = Number(process.env.PORT ?? 4000);
serve({ fetch: app.fetch, port });
console.log(`[mocks] listening on :${port}`);
