import {
  boolean,
  date,
  index,
  inet,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
  passwordHash: text('password_hash'),
  defaultCurrency: text('default_currency').notNull(),
  theme: text('theme').notNull().default('system'),
  timeZone: text('time_zone').notNull().default('UTC'),
  onboardingCompletedAt: timestamp('onboarding_completed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const oauthAccounts = pgTable(
  'oauth_accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    providerSubject: text('provider_subject').notNull(),
    emailAtLink: text('email_at_link').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('oauth_accounts_user_id_idx').on(t.userId),
    uniqueIndex('oauth_accounts_provider_subject_unique').on(t.provider, t.providerSubject),
  ],
);

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    userAgent: text('user_agent'),
    ip: inet('ip'),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => [index('sessions_user_id_expires_at_idx').on(t.userId, t.expiresAt)],
);

export const emailTokens = pgTable(
  'email_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    purpose: text('purpose').notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('email_tokens_user_id_idx').on(t.userId)],
);

export const rateLimits = pgTable(
  'rate_limits',
  {
    key: text('key').notNull(),
    windowStart: timestamp('window_start', { withTimezone: true }).notNull(),
    count: integer('count').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.key, t.windowStart] })],
);

export const fxRates = pgTable(
  'fx_rates',
  {
    rateDate: date('rate_date').notNull(),
    base: text('base').notNull(),
    quote: text('quote').notNull(),
    rate: numeric('rate', { precision: 20, scale: 10 }).notNull(),
    source: text('source').notNull(),
    fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.rateDate, t.base, t.quote] })],
);

export const jobs = pgTable(
  'jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    payload: jsonb('payload').notNull(),
    status: text('status').notNull().default('queued'),
    runAfter: timestamp('run_after', { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    progressDone: integer('progress_done').notNull().default(0),
    progressTotal: integer('progress_total'),
    error: text('error'),
    attempts: integer('attempts').notNull().default(0),
  },
  (t) => [index('jobs_status_run_after_idx').on(t.status, t.runAfter)],
);

export const flags = pgTable('flags', {
  key: text('key').primaryKey(),
  description: text('description').notNull(),
  defaultOn: boolean('default_on').notNull().default(false),
});

export const userFlags = pgTable(
  'user_flags',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    key: text('key')
      .notNull()
      .references(() => flags.key, { onDelete: 'cascade' }),
    enabled: boolean('enabled').notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.key] }), index('user_flags_user_id_idx').on(t.userId)],
);

export const auditLog = pgTable(
  'audit_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    actor: text('actor').notNull(),
    action: text('action').notNull(),
    subject: text('subject').notNull(),
    details: jsonb('details'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('audit_log_user_id_idx').on(t.userId)],
);
