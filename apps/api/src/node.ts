import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { runMigrations } from '@desk/db/migrate';
import pkg from '../package.json' with { type: 'json' };
import { createApp } from './app.js';
import { parseEnv } from './env.js';

// Stage 1 entry point (Fly.io container). Migrations run on start; the built web app is
// served from ./public next to the bundle so one process serves both.
const env = parseEnv(process.env);
await runMigrations(env.DATABASE_URL);

const app = createApp({ version: pkg.version, sha: env.GIT_SHA });
app.use('/*', serveStatic({ root: './public' }));

serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`desk api ${pkg.version} (${env.GIT_SHA}) listening on :${info.port}`);
});
