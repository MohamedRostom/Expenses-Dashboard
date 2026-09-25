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
import { FrankfurterRates, FakeRates } from '@desk/connectors/rates';
import { createNodeLogger } from './adapters/logger-node.js';
import { JobRunner } from './jobs/runner.js';
import { registerAllJobs } from './jobs/register.js';
import { registerJob } from './jobs/index.js';
import { feedbackDigestJob } from './jobs/feedback-digest.js';
import { createRatesService } from './services/rates.js';

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

// SMTP_URL is the documented variable (.env.example, compose: smtp://mailpit:1025) — read via
// the validated `env` object (env.ts), not raw process.env, so a typo'd var name is caught at
// startup like every other config value instead of silently falling through to the default.
const smtp = new URL(env.SMTP_URL ?? 'smtp://localhost:1025');
const mailer: Mailer = env.RESEND_API_KEY
  ? new ResendMailer(env.RESEND_API_KEY, env.MAIL_FROM ?? 'noreply@example.com')
  : new SmtpMailer({
      host: smtp.hostname,
      port: Number(smtp.port || 1025),
      from: env.MAIL_FROM ?? 'noreply@example.com',
    });

const clock: Clock = { now: () => new Date() };
// e2e-ci previously always used FrankfurterRates, hitting the live API from every compose run —
// flaky (rate limits, network) and untestable against known fixtures. RATES_PROVIDER=fake
// selects the deterministic FakeRates used by apps/api's own tests instead.
const ratesProvider =
  process.env['RATES_PROVIDER'] === 'fake' ? new FakeRates() : new FrankfurterRates();
const limiter = new PgRateLimiter(queryDb);

// C1: jobs actually run — register the recurring handlers and poll for due jobs in-process.
// Stage 2 (worker.ts) does the same registration on its own cron trigger; C13's Fly machine
// schedule is the safety net if this interval ever stalls (e.g. a deploy restart racing a job).
const jobRunner = new JobRunner(queryDb);
registerAllJobs({
  db,
  getRate: createRatesService(db, ratesProvider).getRate,
  ratesProvider,
  limiter,
});
registerJob(
  'feedback.digest',
  feedbackDigestJob({
    db,
    mailer,
    digestEmail: env.FEEDBACK_DIGEST_EMAIL,
    clock,
    enqueue: (name, payload, opts) => jobRunner.enqueue(name, payload, opts),
  }),
);
const JOB_TICK_MS = 30_000;
setInterval(() => {
  jobRunner.runDueJobs().catch((err) => console.error('jobs:tick failed', err));
}, JOB_TICK_MS);

const app = createApp({
  db,
  hasher: passwordHasher,
  sessions: new PgSessionStore(queryDb),
  limiter,
  mailer,
  secretBox: createSecretBox(env.SECRET_BOX_KEY),
  breachChecker: new HibpBreachChecker(),
  rates: ratesProvider,
  jobs: jobRunner,
  clock,
  build: { version: pkg.version, sha: env.GIT_SHA },
  appOrigin: env.APP_ORIGIN,
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

app.use('/*', serveStatic({ root: './public' }));
app.use('/*', async (c) => {
  // SPA fallback: any route serveStatic didn't match (client routes like /login, /register, ...)
  // gets index.html with the per-request CSP nonce substituted in.
  const html = await readFile('./public/index.html', 'utf8');
  return c.html(html.replaceAll('%NONCE%', c.get('cspNonce')));
});

serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`desk api ${pkg.version} (${env.GIT_SHA}) listening on :${info.port}`);
});
