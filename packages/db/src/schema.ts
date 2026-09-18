import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  customType,
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

/** Raw bytes column (token hashes, encrypted secrets) — drizzle-orm has no built-in `bytea`. */
const bytea = customType<{ data: Buffer }>({
  dataType() {
    return 'bytea';
  },
});

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
    // Deliberately NOT cascaded: data-model.md requires audit rows to survive account
    // deletion, pseudonymised (see DELETE /me in routes/me.ts, which nulls this column and
    // records a one-way hash in `details` before the user row is deleted).
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    actor: text('actor').notNull(),
    action: text('action').notNull(),
    subject: text('subject').notNull(),
    details: jsonb('details'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('audit_log_user_id_idx').on(t.userId)],
);

export const categories = pgTable(
  'categories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    colour: text('colour').notNull(),
    defaultKind: text('default_kind'),
    budgetMinor: bigint('budget_minor', { mode: 'number' }),
    sortOrder: integer('sort_order').notNull().default(0),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('categories_user_id_idx').on(t.userId),
    uniqueIndex('categories_user_id_name_unique').on(t.userId, t.name),
  ],
);

export const importProfiles = pgTable(
  'import_profiles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    mapping: jsonb('mapping').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('import_profiles_user_id_idx').on(t.userId),
    uniqueIndex('import_profiles_user_id_name_unique').on(t.userId, t.name),
  ],
);

export const importBatches = pgTable(
  'import_batches',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    profileId: uuid('profile_id').references(() => importProfiles.id, { onDelete: 'set null' }),
    fileName: text('file_name').notNull(),
    rowCount: integer('row_count').notNull(),
    status: text('status').notNull().default('previewing'),
    createdExpenses: integer('created_expenses').notNull().default(0),
    duplicates: integer('duplicates').notNull().default(0),
    errors: integer('errors').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (t) => [index('import_batches_user_id_idx').on(t.userId)],
);

export const importRows = pgTable(
  'import_rows',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    batchId: uuid('batch_id')
      .notNull()
      .references(() => importBatches.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    rowNumber: integer('row_number').notNull(),
    raw: jsonb('raw').notNull(),
    parsed: jsonb('parsed'),
    fingerprint: text('fingerprint'),
    externalId: text('external_id'),
    status: text('status').notNull(),
    error: text('error'),
    expenseId: uuid('expense_id'),
  },
  (t) => [
    index('import_rows_batch_id_idx').on(t.batchId),
    index('import_rows_user_id_fingerprint_idx').on(t.userId, t.fingerprint),
  ],
);

export const expenses = pgTable(
  'expenses',
  {
    // Client-generated UUID v7; no defaultRandom so an insert without an id fails loudly.
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'set null' }),
    description: text('description').notNull(),
    expenseDate: date('expense_date').notNull(),
    paidWith: text('paid_with').notNull(),
    kind: text('kind').notNull(),
    notes: text('notes'),
    amountOriginal: bigint('amount_original', { mode: 'number' }).notNull(),
    currencyOriginal: text('currency_original').notNull(),
    rateToDefault: numeric('rate_to_default', { precision: 20, scale: 10 }),
    rateDate: date('rate_date'),
    rateSource: text('rate_source'),
    amountDefault: bigint('amount_default', { mode: 'number' }),
    rateOverridden: boolean('rate_overridden').notNull().default(false),
    addedVia: text('added_via').notNull(),
    importBatchId: uuid('import_batch_id'),
    notionPageId: text('notion_page_id'),
    notionLastEditedAt: timestamp('notion_last_edited_at', { withTimezone: true }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('expenses_user_id_expense_date_idx').on(t.userId, t.expenseDate),
    index('expenses_user_id_deleted_at_idx').on(t.userId, t.deletedAt),
    index('expenses_user_id_category_id_idx').on(t.userId, t.categoryId),
    uniqueIndex('expenses_user_id_notion_page_id_unique')
      .on(t.userId, t.notionPageId)
      .where(sql`notion_page_id IS NOT NULL`),
  ],
);

// T086: Phase 3 capture (data-model.md "Phase 3: Notion and capture").
export const captureTokens = pgTable(
  'capture_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: bytea('token_hash').notNull().unique(),
    label: text('label').notNull().default('generic'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  },
  (t) => [index('capture_tokens_user_id_idx').on(t.userId)],
);

export const captureReceipts = pgTable(
  'capture_receipts',
  {
    tokenId: uuid('token_id')
      .notNull()
      .references(() => captureTokens.id, { onDelete: 'cascade' }),
    receiptKey: text('receipt_key').notNull(),
    expenseId: uuid('expense_id').notNull(),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.tokenId, t.receiptKey] })],
);

export const captureCategoryMap = pgTable(
  'capture_category_map',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    label: text('label').notNull(),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => categories.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.userId, t.label] })],
);

// T077: Phase 3 Notion sync (data-model.md "Phase 3: Notion and capture").
export const notionConnections = pgTable(
  'notion_connections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: 'cascade' }),
    workspaceId: text('workspace_id').notNull(),
    workspaceName: text('workspace_name').notNull(),
    botId: text('bot_id').notNull(),
    accessTokenEnc: bytea('access_token_enc').notNull(),
    databaseId: text('database_id'),
    dataSourceId: text('data_source_id'),
    direction: text('direction').notNull(),
    status: text('status').notNull().default('connected'),
    lastSyncAt: timestamp('last_sync_at', { withTimezone: true }),
    lastError: text('last_error'),
    cursor: timestamp('cursor', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('notion_connections_user_id_idx').on(t.userId)],
);

export const expenseVersions = pgTable(
  'expense_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    expenseId: uuid('expense_id')
      .notNull()
      .references(() => expenses.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    source: text('source').notNull(),
    snapshot: jsonb('snapshot').notNull(),
    editedAt: timestamp('edited_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('expense_versions_expense_id_idx').on(t.expenseId),
    index('expense_versions_user_id_idx').on(t.userId),
  ],
);

// T112: beta feedback widget submissions. user_id is nullable — anonymous visitors can submit.
// user_agent (and any future identifying metadata) is only populated when contactOk is true
// (consent-gated per data-model.md/POST /feedback design notes).
export const feedback = pgTable(
  'feedback',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    page: text('page').notNull(),
    message: text('message').notNull(),
    contactOk: boolean('contact_ok').notNull().default(false),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('feedback_created_at_idx').on(t.createdAt)],
);
