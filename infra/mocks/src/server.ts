// Mock connectors for local dev/e2e-ci: frankfurter + Notion fakes arrive with their phases.
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { createNotionMockApp } from './notion-fake-routes.js';
import { createGoogleMockApp } from './google.js';
import { createGraphMockApp } from './graph.js';
import { createCalDavMockApp } from './caldav.js';

const app = new Hono();

// T083: NOTION_API_BASE points here at /notion — see infra/docker-compose.yml.
app.route('/notion', createNotionMockApp());

// T004: Provider mocks at their respective API bases — see infra/docker-compose.yml.
app.route('/google', createGoogleMockApp());
app.route('/graph', createGraphMockApp());
app.route('/caldav', createCalDavMockApp());

const port = Number(process.env.PORT ?? 4000);
serve({ fetch: app.fetch, port });
console.log(`[mocks] listening on :${port}`);
