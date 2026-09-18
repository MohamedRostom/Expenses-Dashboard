import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { readFile } from 'node:fs/promises';
import postgres from 'postgres';
import { createDb } from '@desk/db';
import { runMigrations } from '@desk/db/migrate';
import pkg from '../package.json' with { type: 'json' };
import { createApp, type Clock } from './app.js';
import { parseEnv } from './env.js';
import { passwordHasher } from './adapters/password.js';
import { PgSessionStore } from './adapters/session-store.js';
import { PgRateLimiter } from './adapters/rate-limiter.js';
import { SmtpMailer, ResendMailer, type Mailer } from './adapters/mailer.js';
import { createSecretBox } from './adapters/secret-box.js';
import { HibpBreachChecker } from './adapters/breach-checker.js';
import type { Db as QueryDb } from './adapters/rate-limiter.js';
import { FrankfurterRates } from '@desk/connectors/rates';
import { createNodeLogger } from './adapters/logger-node.js';

// Stage 1 entry point (Fly.io container). Migrations run on start; the built web app is
// served from ./public next to the bundle so one process serves both.
const env = parseEnv(process.env);
await runMigrations(env.DATABASE_URL);

const { db } = createDb(env.DATABASE_URL);

// Bridges postgres-js to the small `.query(sql, params)` port PgSessionStore/PgRateLimiter want
// (ponytail: one client, two call shapes — cheaper than a second connection pool).
const rawClient = postgres(env.DATABASE_URL);
const queryDb: QueryDb = {
  query: async (sql, params) => ({ rows: await rawClient.unsafe(sql, params as never[]) }),
};

const mailer: Mailer = process.env['RESEND_API_KEY']
  ? new ResendMailer(
      process.env['RESEND_API_KEY'],
      process.env['MAIL_FROM'] ?? 'noreply@example.com',
    )
  : new SmtpMailer({
      host: process.env['SMTP_HOST'] ?? 'localhost',
      port: Number(process.env['SMTP_PORT'] ?? 1025),
      from: process.env['MAIL_FROM'] ?? 'noreply@example.com',
    });

const clock: Clock = { now: () => new Date() };

const app = createApp({
  db,
  hasher: passwordHasher,
  sessions: new PgSessionStore(queryDb),
  limiter: new PgRateLimiter(queryDb),
  mailer,
  secretBox: createSecretBox(env.SECRET_BOX_KEY),
  breachChecker: new HibpBreachChecker(),
  rates: new FrankfurterRates(),
  jobs: undefined,
  clock,
  build: { version: pkg.version, sha: env.GIT_SHA },
  logger: createNodeLogger(env.SENTRY_DSN),
  google:
    env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
      ? {
          clientId: env.GOOGLE_CLIENT_ID,
          clientSecret: env.GOOGLE_CLIENT_SECRET,
          appOrigin: env.APP_ORIGIN,
        }
      : undefined,
  notion:
    env.NOTION_CLIENT_ID && env.NOTION_CLIENT_SECRET
      ? {
          clientId: env.NOTION_CLIENT_ID,
          clientSecret: env.NOTION_CLIENT_SECRET,
          appOrigin: env.APP_ORIGIN,
          apiBase: env.NOTION_API_BASE,
        }
      : undefined,
});

app.use('/*', async (c, next) => {
  if (c.req.path === '/' || c.req.path === '/index.html') {
    const html = await readFile('./public/index.html', 'utf8');
    return c.html(html.replaceAll('%NONCE%', c.get('cspNonce')));
  }
  return next();
});
app.use('/*', serveStatic({ root: './public' }));

serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`desk api ${pkg.version} (${env.GIT_SHA}) listening on :${info.port}`);
});
