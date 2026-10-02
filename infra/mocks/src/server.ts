// Mock connectors for local dev/e2e-ci: frankfurter + Notion fakes arrive with their phases.
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { createNotionMockApp } from './notion-fake-routes.js';
import { createGoogleMockApp } from './google.js';
import { createGraphMockApp } from './graph.js';
import { createCalDavMockApp } from './caldav.js';
import { createImapMockApp, createImapStore, startImapMockServer } from './imap.js';

const app = new Hono();

// T083: NOTION_API_BASE points here at /notion — see infra/docker-compose.yml.
app.route('/notion', createNotionMockApp());

// T004: Provider mocks at their respective API bases — see infra/docker-compose.yml.
app.route('/google', createGoogleMockApp());
app.route('/graph', createGraphMockApp());
app.route('/caldav', createCalDavMockApp('/caldav'));

// T052: the IMAP control route lives at the mocks app's root (POST /__control/imap/messages),
// sharing an ImapStore with the real TCP server below so an added message is visible immediately.
const imapStore = createImapStore();
app.route('/', createImapMockApp(imapStore));
// Compose sets IMAP_MOCK_PORT=143 so the api reaches it on a port FR-017 allows (993 or 143).
const imapPort = Number(process.env['IMAP_MOCK_PORT'] ?? 1143);
startImapMockServer(imapPort, imapStore);
console.log(`[mocks] IMAP listening on :${imapPort}`);

const port = Number(process.env.PORT ?? 4000);
serve({ fetch: app.fetch, port });
console.log(`[mocks] listening on :${port}`);
