import { Hono } from 'hono';
import type { HealthResponseT } from '@desk/contracts';
import type { Db } from '@desk/db';
import type { PasswordHasher } from './adapters/password.js';
import type { SessionStore } from './adapters/session-store.js';
import type { RateLimiter } from './adapters/rate-limiter.js';
import type { Mailer } from './adapters/mailer.js';
import type { SecretBox } from './adapters/secret-box.js';
import type { BreachChecker } from './adapters/breach-checker.js';
import { logger as defaultLogger } from './adapters/logger.js';
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
import { createRatesService } from './services/rates.js';
import { createExpensesService } from './services/expenses.js';
import { createCaptureService } from './services/capture.js';
import type { RatesProvider } from '@desk/connectors/rates';

export type BuildInfo = Omit<HealthResponseT, 'status'>;

/** JobRunner (research.md R7) lands in a later task — placeholder for now. */
export type RatesDep = RatesProvider;
export type JobsDep = unknown;
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
  /** Undefined until GOOGLE_CLIENT_ID/SECRET are configured (env.ts) — /auth/google/* 404s. */
  google: GoogleConfig | undefined;
};

export type AppVariables = RequestLoggerVariables & SessionVariables & CspNonceVariables;

/** The Desk API. Runtime-agnostic: node.ts and worker.ts wrap it with their adapters. */
export function createApp(deps: AppDeps) {
  const app = new Hono<{ Variables: AppVariables }>();

  app.use('*', secureHeadersMiddleware);
  app.use('*', requestLogger(defaultLogger));
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
    }),
  );
  app.route('/', createMiscRoutes(deps.db));
  app.route('/', createSummaryRoutes(deps.db));
  app.route('/', createRatesRoutes(deps.db, deps.rates));
  app.route(
    '/',
    createExpensesRoutes({
      db: deps.db,
      rates: createRatesService(deps.db, deps.rates),
      clock: deps.clock,
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
  app.route('/', createCaptureRoutes(captureService));

  app.get('/healthz', (c) => {
    const body: HealthResponseT = {
      status: 'ok',
      version: deps.build.version,
      sha: deps.build.sha,
    };
    return c.json(body);
  });

  return app;
}
