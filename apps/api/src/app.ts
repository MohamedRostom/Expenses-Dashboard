import { Hono } from 'hono';
import { sql } from 'drizzle-orm';
import type { HealthResponseT } from '@desk/contracts';
import type { Db } from '@desk/db';
import type { PasswordHasher } from './adapters/password.js';
import type { SessionStore } from './adapters/session-store.js';
import type { RateLimiter } from './adapters/rate-limiter.js';
import type { Mailer } from './adapters/mailer.js';
import type { SecretBox } from './adapters/secret-box.js';
import type { BreachChecker } from './adapters/breach-checker.js';
import { logger as defaultLogger, type Logger } from './adapters/logger.js';
import { requestLogger, type RequestLoggerVariables } from './middleware/request-logger.js';
import { sessionMiddleware, type SessionVariables } from './middleware/session.js';
import { csrf } from './middleware/csrf.js';
import { errorHandler } from './middleware/errors.js';
import { secureHeadersMiddleware, type CspNonceVariables } from './middleware/secure-headers.js';
import { authRoutes } from './routes/auth.js';
import { createGoogleRoutes, type GoogleConfig } from './routes/google.js';
import { createMeRoutes } from './routes/me.js';
import { createMiscRoutes } from './routes/misc.js';
import { createSummaryRoutes } from './routes/summary.js';
import { createRatesRoutes } from './routes/rates.js';
import { createExpensesRoutes } from './routes/expenses.js';
import { createCategoriesRoutes } from './routes/categories.js';
import { createImportsRoutes } from './routes/imports.js';
import { createHooksRoutes } from './routes/hooks.js';
import { createCaptureRoutes } from './routes/capture.js';
import { createNotionRoutes } from './routes/notion.js';
import { createFeedbackRoutes } from './routes/feedback.js';
import { createRatesService } from './services/rates.js';
import { createExpensesService } from './services/expenses.js';
import { createCaptureService } from './services/capture.js';
import { createNotionService, type NotionConfig } from './services/notion.js';
import { registerJob } from './jobs/index.js';
import { notionSyncJob } from './jobs/notion-sync.js';
import type { RatesProvider } from '@desk/connectors/rates';

export type BuildInfo = Omit<HealthResponseT, 'status' | 'db'>;

export type RatesDep = RatesProvider;
/** C1: the subset of JobRunner routes need — enqueue only, no direct DB/runner access. */
export type JobsDep =
  | {
      enqueue(
        name: string,
        payload: unknown,
        opts?: { userId?: string; runAfter?: Date },
      ): Promise<string>;
    }
  | undefined;
export type Clock = { now(): Date };

export type AppDeps = {
  db: Db;
  hasher: PasswordHasher;
  sessions: SessionStore;
  limiter: RateLimiter;
  mailer: Mailer;
  secretBox: SecretBox;
  breachChecker: BreachChecker;
  rates: RatesDep;
  jobs: JobsDep;
  clock: Clock;
  build: BuildInfo;
  /** Public origin of the web app (APP_ORIGIN) — used for links in mail. */
  appOrigin: string;
  /** T113: defaults to the plain JSON-stdout logger; node.ts/worker.ts pass
   * createNodeLogger/createWorkerLogger(env.SENTRY_DSN) once Sentry is wired in. */
  logger?: Logger;
  /** Undefined until GOOGLE_CLIENT_ID/SECRET are configured (env.ts) — /auth/google/* 404s. */
  google: GoogleConfig | undefined;
  /** Undefined until NOTION_CLIENT_ID/SECRET are configured (env.ts) — /notion/* 404s. */
  notion: NotionConfig | undefined;
};

export type AppVariables = RequestLoggerVariables & SessionVariables & CspNonceVariables;

/** The Desk API. Runtime-agnostic: node.ts and worker.ts wrap it with their adapters. */
export function createApp(deps: AppDeps) {
  const app = new Hono<{ Variables: AppVariables }>();

  app.use('*', secureHeadersMiddleware);
  app.use('*', requestLogger(deps.logger ?? defaultLogger));
  app.use('*', sessionMiddleware(deps.db, deps.sessions));
  app.use('*', csrf);

  app.onError(errorHandler);

  app.route('/auth', authRoutes(deps));
  if (deps.google) {
    app.route(
      '/auth/google',
      createGoogleRoutes({
        db: deps.db,
        sessions: deps.sessions,
        clock: deps.clock,
        google: deps.google,
      }),
    );
  }

  app.route(
    '/',
    createMeRoutes({
      db: deps.db,
      hasher: deps.hasher,
      mailer: deps.mailer,
      sessionStore: deps.sessions,
      clock: deps.clock,
      appOrigin: deps.appOrigin,
      limiter: deps.limiter,
    }),
  );
  // Built up front (not inside the `if (deps.notion)` block below) so its debounced
  // triggerSyncSoon can be wired into the expenses routes' onWrite hook (T080 R8).
  const notionService = deps.notion
    ? createNotionService(
        deps.db,
        deps.secretBox,
        deps.notion,
        createExpensesService(deps.db, createRatesService(deps.db, deps.rates), deps.clock),
        deps.clock,
        deps.jobs?.enqueue.bind(deps.jobs),
      )
    : undefined;

  // C1: registers the recurring `notion.sync` handler on the shared job registry — the actual
  // enqueue (first run) happens in NotionService.setConnection above; this just makes sure
  // there's a handler waiting when JobRunner.runDueJobs picks it up.
  if (notionService && deps.jobs) {
    registerJob(
      'notion.sync',
      notionSyncJob({ notion: notionService, enqueue: deps.jobs.enqueue.bind(deps.jobs) }),
    );
  }

  app.route('/', createMiscRoutes(deps.db));
  app.route('/', createSummaryRoutes(deps.db, deps.clock));
  app.route('/', createRatesRoutes(deps.db, deps.rates));
  app.route(
    '/',
    createExpensesRoutes({
      db: deps.db,
      rates: createRatesService(deps.db, deps.rates),
      clock: deps.clock,
      onWrite: notionService ? (userId) => notionService.triggerSyncSoon(userId) : undefined,
    }),
  );
  app.route('/', createCategoriesRoutes(deps.db));
  app.route(
    '/',
    createImportsRoutes({
      db: deps.db,
      expensesService: createExpensesService(
        deps.db,
        createRatesService(deps.db, deps.rates),
        deps.clock,
      ),
    }),
  );

  const captureService = createCaptureService(
    deps.db,
    createExpensesService(deps.db, createRatesService(deps.db, deps.rates), deps.clock),
    deps.limiter,
    deps.clock,
  );
  app.route('/', createHooksRoutes(captureService));
  app.route('/', createCaptureRoutes(captureService, deps.appOrigin));

  if (notionService && deps.notion) {
    app.route('/', createNotionRoutes({ notion: notionService, appOrigin: deps.notion.appOrigin }));
  }

  app.route('/', createFeedbackRoutes(deps.db, deps.limiter));

  app.get('/healthz', async (c) => {
    // T109: trivial query with a short timeout — never lets a slow/broken DB fail the whole
    // check; 'degraded' communicates it instead, still 200. The timer is cleared once either
    // side settles — previously it kept running in the background even after the query won the
    // race, a dangling handle for the rest of its 1.5s every time the DB answered promptly.
    let timeoutHandle: ReturnType<typeof setTimeout>;
    const dbStatus = await Promise.race([
      Promise.resolve()
        .then(() => deps.db.execute(sql`SELECT 1`))
        .then(() => 'ok' as const)
        .catch(() => 'degraded' as const),
      new Promise<'degraded'>((resolve) => {
        timeoutHandle = setTimeout(() => resolve('degraded'), 1500);
      }),
    ]);
    clearTimeout(timeoutHandle!);
    const body: HealthResponseT = {
      status: 'ok',
      version: deps.build.version,
      sha: deps.build.sha,
      db: dbStatus,
    };
    return c.json(body);
  });

  return app;
}
