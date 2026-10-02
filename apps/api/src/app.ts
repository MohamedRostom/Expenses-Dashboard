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
import { createConnectionsRoutes } from './routes/connections.js';
import { createTodayRoutes } from './routes/today.js';
import { createRatesService } from './services/rates.js';
import { createExpensesService } from './services/expenses.js';
import { createCaptureService } from './services/capture.js';
import { createNotionService, type NotionConfig } from './services/notion.js';
import { ConnectionsService } from './services/connections.js';
import { PanelsService } from './services/panels.js';
import { requireFlag } from './middleware/require-flag.js';
import { registerJob, panelsRefreshJob, panelsSchedulerJob, panelsPurgeJob } from './jobs/index.js';
import { ensurePanelsScheduler } from './jobs/panels-scheduler.js';
import { ensurePanelsPurge } from './jobs/panels-purge.js';
import { notionSyncJob } from './jobs/notion-sync.js';
import type { RatesProvider } from '@desk/connectors/rates';
import type { CalendarSource, MailSource } from '@desk/connectors/panels';
import { createGoogleCalendarSource } from '@desk/connectors/google/calendar';
import { createMicrosoftCalendarSource } from '@desk/connectors/microsoft/calendar';
import { createGmailSource } from '@desk/connectors/google/gmail';
import { createMicrosoftMailSource } from '@desk/connectors/microsoft/mail';
import { ImapMailSource } from '@desk/connectors/imap/client';
import type { Connect } from '@desk/connectors/imap/socket';
import { createCalDavSource } from '@desk/connectors/caldav/client';
import type { HostResolver } from './lib/host-policy.js';

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
      /** JobRunner has this; not every caller's fake does — guard with `?.` before calling. */
      cancelForUser?(userId: string): Promise<void>;
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
  /** Sign-ups allowed per IP per hour (default 20). Raised only in compose for the e2e-ci suite. */
  registerIpLimitPerHour?: number | undefined;
  /** T113: defaults to the plain JSON-stdout logger; node.ts/worker.ts pass
   * createNodeLogger/createWorkerLogger(env.SENTRY_DSN) once Sentry is wired in. */
  logger?: Logger;
  /** Undefined until GOOGLE_CLIENT_ID/SECRET are configured (env.ts) — /auth/google/* 404s. */
  google: GoogleConfig | undefined;
  /** Undefined until NOTION_CLIENT_ID/SECRET are configured (env.ts) — /notion/* 404s. */
  notion: NotionConfig | undefined;
  /** Google OAuth for panels. */
  googlePanels: { clientId: string; clientSecret: string } | undefined;
  /** Microsoft OAuth for panels. */
  microsoft: { clientId: string; clientSecret: string } | undefined;
  /** Optional OAuth endpoint overrides for Google (for mocking in tests/compose). */
  googleOAuthEndpoints?: { authorize?: string; token?: string; revoke?: string };
  /** Optional OAuth endpoint overrides for Microsoft (for mocking in tests/compose). */
  microsoftOAuthEndpoints?: { authorize?: string; token?: string };
  /** Google Calendar/Gmail API base (GOOGLE_API_BASE); defaults to the real API. */
  googleApiBase?: string;
  /** Microsoft Graph API base (GRAPH_API_BASE); defaults to the real API. */
  graphApiBase?: string;
  /** Calendar sources per provider for the panels.refresh job. Built from googlePanels/microsoft
   * (plus 'standards', always available — CalDAV needs no OAuth config) when omitted; pass
   * explicit fakes in tests to script provider behaviour. */
  calendarSources?: Partial<Record<'google' | 'microsoft' | 'standards', CalendarSource>>;
  /** Mail sources per provider for the panels.refresh job. Built from googlePanels/microsoft/
   * socketConnect when omitted; pass explicit fakes in tests to script provider behaviour.
   * Whether the Google source is actually used is gated per-account on the panels.google_mail
   * flag in panels-refresh.ts (ADR-0004 CASA gate), not here. */
  mailSources?: Partial<Record<'google' | 'microsoft' | 'standards', MailSource>>;
  /** Real TCP socket dialer for the standards (IMAP) mail source — node.ts passes
   * socketNodeConnect (node:tls/node:net), worker.ts passes
   * createSocketWorkerConnect(cfConnect) (cloudflare:sockets). Undefined means no standards
   * mail source is built (the Connections settings section hides that option). */
  socketConnect?: Connect | undefined;
  /** T070/FR-017: resolves a hostname to the addresses it answers to, so createStandards can
   * refuse a non-public one. node.ts passes adapters/host-resolver-node.ts's resolveHostNode;
   * undefined (Workers, for now) makes createStandards refuse to run rather than skip the check. */
  hostResolver?: HostResolver | undefined;
  /** STANDARDS_ALLOW_PRIVATE_HOSTS (env.ts) — bypasses createStandards's public-address check so
   * e2e-ci can reach the compose `mocks` service at its private Docker address. Off by default;
   * env.ts refuses it outright when a production marker is set. */
  standardsAllowPrivateHosts?: boolean | undefined;
  /** Kicks the job runner once right after a user-triggered refresh (SC-002); background
   * refreshes still wait for the tick. */
  runJobsNow?: (() => Promise<void>) | undefined;
};

export type AppVariables = RequestLoggerVariables & SessionVariables & CspNonceVariables;

/** The Desk API. Runtime-agnostic: node.ts and worker.ts wrap it with their adapters. */
export function createApp(deps: AppDeps) {
  const app = new Hono<{ Variables: AppVariables }>();

  app.use('*', secureHeadersMiddleware);
  app.use('*', requestLogger(deps.logger ?? defaultLogger));
  app.use('*', sessionMiddleware(deps.db, deps.sessions, deps.clock));
  app.use('*', csrf);

  app.onError(errorHandler);

  // Real calendar sources built from AppDeps when the caller hasn't supplied fakes (tests do).
  // Hoisted above createMeRoutes: DELETE /me needs ConnectionsService.revokeAllForUser, which
  // needs these to revoke at the provider.
  const calendarSources: Partial<Record<'google' | 'microsoft' | 'standards', CalendarSource>> =
    deps.calendarSources ?? {
      ...(deps.googlePanels && {
        google: createGoogleCalendarSource({
          clientId: deps.googlePanels.clientId,
          clientSecret: deps.googlePanels.clientSecret,
          apiBase: deps.googleApiBase ?? 'https://www.googleapis.com',
          ...(deps.googleOAuthEndpoints && { oauthEndpoints: deps.googleOAuthEndpoints }),
          fetchImpl: globalThis.fetch,
        }),
      }),
      ...(deps.microsoft && {
        microsoft: createMicrosoftCalendarSource({
          clientId: deps.microsoft.clientId,
          clientSecret: deps.microsoft.clientSecret,
          apiBase: deps.graphApiBase ?? 'https://graph.microsoft.com',
          ...(deps.microsoftOAuthEndpoints && { oauthEndpoints: deps.microsoftOAuthEndpoints }),
          fetchImpl: globalThis.fetch,
        }),
      }),
      // CalDAV needs no OAuth client config (Basic auth, per-account credential) — always built,
      // so panels.refresh can refresh a standards account's enabled calendars (T070).
      standards: createCalDavSource(),
    };

  // Real mail sources built from AppDeps when the caller hasn't supplied fakes (tests do).
  // Google is always built when googlePanels is configured — the panels.google_mail flag gates
  // its per-account *use* in panels-refresh.ts, not whether the client exists (ADR-0004).
  const mailSources: Partial<Record<'google' | 'microsoft' | 'standards', MailSource>> =
    deps.mailSources ?? {
      ...(deps.googlePanels && {
        google: createGmailSource({
          clientId: deps.googlePanels.clientId,
          clientSecret: deps.googlePanels.clientSecret,
          apiBase: deps.googleApiBase ?? 'https://www.googleapis.com',
          ...(deps.googleOAuthEndpoints && { oauthEndpoints: deps.googleOAuthEndpoints }),
          fetchImpl: globalThis.fetch,
        }),
      }),
      ...(deps.microsoft && {
        microsoft: createMicrosoftMailSource({
          clientId: deps.microsoft.clientId,
          clientSecret: deps.microsoft.clientSecret,
          apiBase: deps.graphApiBase ?? 'https://graph.microsoft.com',
          ...(deps.microsoftOAuthEndpoints && { oauthEndpoints: deps.microsoftOAuthEndpoints }),
          fetchImpl: globalThis.fetch,
        }),
      }),
      ...(deps.socketConnect && { standards: new ImapMailSource(deps.socketConnect) }),
    };

  const connectionsService = new ConnectionsService({
    db: deps.db,
    secretBox: deps.secretBox,
    clock: deps.clock,
    calendarSources,
    mailSources,
    enqueue: deps.jobs
      ? deps.jobs.enqueue.bind(deps.jobs)
      : async () => {
          throw new Error('jobs runner not configured');
        },
    limiter: deps.limiter,
    hostResolver:
      deps.hostResolver ??
      (async () => {
        // ponytail: no Workers-compatible DNS resolver yet — createStandards is unreachable until
        // worker.ts wires one; add a DNS-over-HTTPS adapter there when Workers needs it for real.
        throw new Error('createStandards: no hostResolver configured for this runtime');
      }),
    allowPrivateHosts: deps.standardsAllowPrivateHosts ?? false,
  });

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
      connections: connectionsService,
      jobs: deps.jobs,
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

  // Panels service for Today and account refreshes
  const panelsService = new PanelsService({
    db: deps.db,
    clock: deps.clock,
    appOrigin: deps.appOrigin,
    enqueue: deps.jobs
      ? deps.jobs.enqueue.bind(deps.jobs)
      : async () => {
          throw new Error('jobs runner not configured');
        },
  });

  // Register panels jobs
  if (deps.jobs) {
    registerJob(
      'panels.refresh',
      panelsRefreshJob({
        db: deps.db,
        secretBox: deps.secretBox,
        clock: deps.clock,
        calendarSources,
        mailSources,
      }),
    );
    registerJob(
      'panels.scheduler',
      panelsSchedulerJob({
        db: deps.db,
        clock: deps.clock,
        enqueue: deps.jobs.enqueue.bind(deps.jobs),
      }),
    );
    registerJob(
      'panels.purge',
      panelsPurgeJob({
        db: deps.db,
        clock: deps.clock,
        enqueue: deps.jobs.enqueue.bind(deps.jobs),
        cancelForUser: deps.jobs.cancelForUser
          ? deps.jobs.cancelForUser.bind(deps.jobs)
          : async () => {},
      }),
    );

    // Start the recurring scheduler once; it re-enqueues itself every minute after that.
    // ponytail: fire-and-forget at app creation; if it is ever lost, the next app start re-seeds it.
    void ensurePanelsScheduler(deps.db, deps.jobs.enqueue.bind(deps.jobs), deps.clock.now()).catch(
      (err) => console.error('panels.scheduler: could not enqueue', err),
    );
    // Same pattern for the daily purge.
    void ensurePanelsPurge(deps.db, deps.jobs.enqueue.bind(deps.jobs), deps.clock.now()).catch(
      (err) => console.error('panels.purge: could not enqueue', err),
    );
  }

  // Mount connections routes under /connections with the panels.today flag check
  const connectionsRouter = new Hono<{ Variables: AppVariables }>();
  connectionsRouter.use('/*', requireFlag(deps.db, 'panels.today'));
  connectionsRouter.route(
    '/',
    createConnectionsRoutes({
      db: deps.db,
      secretBox: deps.secretBox,
      clock: deps.clock,
      appOrigin: deps.appOrigin,
      google: deps.googlePanels,
      microsoft: deps.microsoft,
      googleOAuthEndpoints: deps.googleOAuthEndpoints,
      microsoftOAuthEndpoints: deps.microsoftOAuthEndpoints,
      connections: connectionsService,
      panels: panelsService,
      calendarSources,
      limiter: deps.limiter,
      jobs: deps.jobs,
      runJobsNow: deps.runJobsNow,
    }),
  );
  app.route('/connections', connectionsRouter);

  // Today routes with the panels.today flag
  const todayRouter = new Hono<{ Variables: AppVariables }>();
  todayRouter.use('/*', requireFlag(deps.db, 'panels.today'));
  todayRouter.route(
    '/',
    createTodayRoutes({
      panels: panelsService,
      limiter: deps.limiter,
      clock: deps.clock,
      runJobsNow: deps.runJobsNow,
    }),
  );
  app.route('/panels/today', todayRouter);

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
