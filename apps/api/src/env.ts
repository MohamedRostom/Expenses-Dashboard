import { z } from 'zod';

/** Every variable the Node entry point reads. Keep .env.example in sync. */
const envObjectSchema = z.object({
  DATABASE_URL: z.string().min(1),
  PORT: z.coerce.number().int().positive().default(3000),
  GIT_SHA: z
    .string()
    .optional()
    .transform((s) => (s && s.length > 0 ? s : 'unknown')),
  SESSION_SECRET: z.string().min(1),
  SECRET_BOX_KEY: z.string().min(1),
  APP_ORIGIN: z.string().min(1),
  REGISTER_IP_LIMIT_PER_HOUR: z.coerce.number().int().positive().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_PANELS_CLIENT_ID: z.string().optional(),
  GOOGLE_PANELS_CLIENT_SECRET: z.string().optional(),
  GOOGLE_API_BASE: z.string().default('https://www.googleapis.com'),
  GOOGLE_OAUTH_BASE: z.string().url().optional(),
  // T029 fix: in compose, GOOGLE_OAUTH_BASE/MICROSOFT_LOGIN_BASE point at the `mocks` service
  // name (e.g. http://mocks:4000/google), which the api container can resolve but a browser on
  // the host cannot — the OAuth authorize redirect (302 sent to the browser) needs a
  // host-reachable base, while the token/revoke calls (server-to-server, from inside the api
  // container) keep using the base above. Optional and unused outside compose/e2e-ci; when unset
  // the authorize URL falls back to GOOGLE_OAUTH_BASE/MICROSOFT_LOGIN_BASE as before.
  GOOGLE_OAUTH_BROWSER_BASE: z.string().url().optional(),
  MICROSOFT_CLIENT_ID: z.string().optional(),
  MICROSOFT_CLIENT_SECRET: z.string().optional(),
  GRAPH_API_BASE: z.string().default('https://graph.microsoft.com'),
  MICROSOFT_LOGIN_BASE: z.string().url().optional(),
  MICROSOFT_LOGIN_BROWSER_BASE: z.string().url().optional(),
  NOTION_CLIENT_ID: z.string().optional(),
  NOTION_CLIENT_SECRET: z.string().optional(),
  NOTION_API_BASE: z.string().optional(),
  OPEN_METEO_API_BASE: z.string().url().optional(),
  // T113: optional Sentry DSN — logger-node.ts/logger-worker.ts are no-ops without it.
  SENTRY_DSN: z.string().optional(),
  // T112: owner inbox for the daily feedback digest; the job skips sending when unset.
  FEEDBACK_DIGEST_EMAIL: z.string().optional(),
  // Mail: SMTP is the default (compose: smtp://mailpit:1025); setting RESEND_API_KEY switches
  // to Resend instead. Previously read straight from process.env with a silent default,
  // bypassing this schema entirely — a typo'd var name would fall through unnoticed.
  SMTP_URL: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  MAIL_FROM: z.string().optional(),
  // Mail and calendar connectors: caldav and imap test endpoints (optional).
  CALDAV_TEST_URL: z.string().optional(),
  IMAP_TEST_HOST: z.string().optional(),
  // T070/FR-017: bypasses createStandards's public-address check, so e2e-ci can reach the
  // compose `mocks` service at its private Docker address. Only ever set (true) in
  // infra/docker-compose.yml; refused below on any Fly deployment (FLY_APP_NAME is set there;
  // NODE_ENV can't be the marker because the compose image is the production image).
  // z.coerce.boolean() would treat any non-empty string (including "false") as true, so this
  // reads the string exactly, the same way ROUTES/expenses.ts's showPending flag does.
  STANDARDS_ALLOW_PRIVATE_HOSTS: z
    .string()
    .optional()
    .transform((s) => s === 'true'),
  // Comma list of flag keys switched on globally at startup (node.ts). Set only by
  // deploy-preview.yml so a PR preview shows the features under review; refused on production.
  FLAGS_ON: z
    .string()
    .optional()
    .transform((s) =>
      s
        ?.split(',')
        .map((k) => k.trim())
        .filter(Boolean),
    ),
  FLY_APP_NAME: z.string().optional(),
});

export const envSchema = envObjectSchema
  .refine((env) => Boolean(env.GOOGLE_CLIENT_ID) === Boolean(env.GOOGLE_CLIENT_SECRET), {
    message: 'GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set together or not at all',
    path: ['GOOGLE_CLIENT_ID'],
  })
  .refine(
    (env) => Boolean(env.GOOGLE_PANELS_CLIENT_ID) === Boolean(env.GOOGLE_PANELS_CLIENT_SECRET),
    {
      message:
        'GOOGLE_PANELS_CLIENT_ID and GOOGLE_PANELS_CLIENT_SECRET must be set together or not at all',
      path: ['GOOGLE_PANELS_CLIENT_ID'],
    },
  )
  .refine((env) => Boolean(env.MICROSOFT_CLIENT_ID) === Boolean(env.MICROSOFT_CLIENT_SECRET), {
    message: 'MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET must be set together or not at all',
    path: ['MICROSOFT_CLIENT_ID'],
  })
  .refine((env) => Boolean(env.NOTION_CLIENT_ID) === Boolean(env.NOTION_CLIENT_SECRET), {
    message: 'NOTION_CLIENT_ID and NOTION_CLIENT_SECRET must be set together or not at all',
    path: ['NOTION_CLIENT_ID'],
  })
  .refine((env) => !(env.STANDARDS_ALLOW_PRIVATE_HOSTS && env.FLY_APP_NAME), {
    message: 'STANDARDS_ALLOW_PRIVATE_HOSTS must not be set on a Fly deployment',
    path: ['STANDARDS_ALLOW_PRIVATE_HOSTS'],
  })
  .refine((env) => !(env.FLAGS_ON?.length && env.FLY_APP_NAME === 'ros-desk-production'), {
    message: 'FLAGS_ON must not be set on production',
    path: ['FLAGS_ON'],
  });
export type Env = z.infer<typeof envSchema>;

/** The subset of the schema the Workers entry point receives as bindings. */
export const bindingsSchema = envObjectSchema.pick({ GIT_SHA: true, APP_ORIGIN: true });
export type Bindings = z.infer<typeof bindingsSchema>;

function fail(issues: z.core.$ZodIssue[]): never {
  const lines = issues.map((i) => `  ${i.path.join('.')}: ${i.message}`);
  throw new Error(`Refusing to start, invalid environment:\n${lines.join('\n')}`);
}

/** Parses the environment and throws a readable error naming each missing or invalid variable. */
export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source);
  return result.success ? result.data : fail(result.error.issues);
}

/** Same contract for Cloudflare bindings, so both entry points refuse the same bad input. */
export function parseBindings(source: unknown): Bindings {
  const result = bindingsSchema.safeParse(source);
  return result.success ? result.data : fail(result.error.issues);
}

/**
 * T117: the two Stage 2 resource bindings from wrangler.toml, on top of the string vars above.
 * These are runtime objects (a Hyperdrive handle, a KVNamespace), not env strings, so they
 * are asserted present rather than zod-validated — zod has nothing useful to check on a class
 * instance the platform hands us.
 *
 * T125: SECRET_BOX_KEY/RESEND_API_KEY/MAIL_FROM are read the same way but stay optional and
 * unvalidated here (unlike node.ts's envSchema, which requires SECRET_BOX_KEY) — Rostom hasn't
 * created these as `wrangler secret put` values yet (CLAUDE.md to-dos), and /healthz must keep
 * working without them. worker.ts wires the mailer/secretBox for real when present and falls
 * back to a placeholder that only fails if something actually tries to use it otherwise.
 */
export interface WorkersBindings {
  HYPERDRIVE: { connectionString: string };
  SESSIONS_KV: unknown;
  // `| undefined` (not just `?`) because parseWorkersBindings always sets these keys, possibly
  // to undefined — exactOptionalPropertyTypes treats a present-but-undefined value differently
  // from an absent key.
  SECRET_BOX_KEY?: string | undefined;
  RESEND_API_KEY?: string | undefined;
  MAIL_FROM?: string | undefined;
}

export function parseWorkersBindings(source: unknown): Bindings & WorkersBindings {
  const bindings = parseBindings(source);
  const env = source as Partial<WorkersBindings>;
  if (!env.HYPERDRIVE?.connectionString) {
    throw new Error(
      'Refusing to start, invalid environment:\n  HYPERDRIVE: missing binding (see infra/cloudflare/wrangler.toml [[hyperdrive]])',
    );
  }
  if (!env.SESSIONS_KV) {
    throw new Error(
      'Refusing to start, invalid environment:\n  SESSIONS_KV: missing binding (see infra/cloudflare/wrangler.toml [[kv_namespaces]])',
    );
  }
  return {
    ...bindings,
    HYPERDRIVE: env.HYPERDRIVE,
    SESSIONS_KV: env.SESSIONS_KV,
    SECRET_BOX_KEY: env.SECRET_BOX_KEY,
    RESEND_API_KEY: env.RESEND_API_KEY,
    MAIL_FROM: env.MAIL_FROM,
  };
}
