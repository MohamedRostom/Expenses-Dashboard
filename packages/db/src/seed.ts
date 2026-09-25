import { pathToFileURL } from 'node:url';
import { argon2id } from 'hash-wasm';
import { DEFAULT_CATEGORIES, seedColour } from '@desk/core';
import { createDb } from './index.js';
import { categories, flags, users } from './schema.js';

// Mirrors apps/api/src/adapters/password.ts's PARAMS exactly — this is the one other place that
// needs to produce a hash login() will accept, and duplicating the params here (rather than
// importing from apps/api) keeps packages/db's dependency direction one-way.
async function hashPassword(password: string): Promise<string> {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  return argon2id({
    password,
    salt,
    parallelism: 1,
    iterations: 2,
    memorySize: 19 * 1024,
    hashLength: 32,
    outputType: 'encoded',
  });
}

/** Flags shipped so far. Every new user-facing flag merged before announcement gets a row here. */
const DEFAULT_FLAGS: { key: string; description: string }[] = [];

const E2E_USER_ID = '00000000-0000-0000-0000-000000000001';
const E2E_USER_EMAIL = 'e2e@desk.test';

/** Idempotent: safe to run on every deploy/CI run. Upserts, never duplicates. */
export async function seed(databaseUrl: string, opts: { load?: boolean } = {}) {
  const { db, close } = createDb(databaseUrl);
  try {
    for (const f of DEFAULT_FLAGS) {
      await db
        .insert(flags)
        .values({ key: f.key, description: f.description, defaultOn: false })
        .onConflictDoNothing();
    }

    // Was onConflictDoNothing() with no passwordHash at all — smoke.spec.ts (@local) logs in as
    // this user with a password, which login() always 401'd since there was no credential row
    // to check against. onConflictDoUpdate so re-running seed also fixes an already-seeded
    // environment, not just a fresh one.
    const passwordHash = await hashPassword(
      // Not a real quote/phrase — see tests/e2e/fixtures/index.ts's signUpAndVerify comment: the
      // XKCD example password is genuinely flagged by the real HIBP breach-check.
      process.env['E2E_SEEDED_PASSWORD'] ?? 'xk-e2e-Tr0ub4-fixture-2026',
    );
    const [user] = await db
      .insert(users)
      .values({
        id: E2E_USER_ID,
        email: E2E_USER_EMAIL,
        emailVerifiedAt: new Date(),
        // Without this, the router guard (apps/web/src/router.ts) sends smoke.spec.ts's login to
        // /onboarding instead of '/', same class of bug as tests/e2e/fixtures/index.ts's
        // signUpAndVerify — this user is a fixture, not a first-time signup.
        onboardingCompletedAt: new Date(),
        defaultCurrency: 'GBP',
        passwordHash,
      })
      .onConflictDoUpdate({
        target: users.email,
        set: { passwordHash, emailVerifiedAt: new Date(), onboardingCompletedAt: new Date() },
      })
      .returning({ id: users.id });

    // Same defaults sign-up gives (apps/api seedDefaultCategories) — without them the fixture
    // user's add-expense form has no categories. Keyed on (user_id, name), so re-runs are no-ops.
    await db
      .insert(categories)
      .values(
        DEFAULT_CATEGORIES.map((c, i) => ({
          userId: user!.id,
          name: c.name,
          colour: seedColour(i),
          defaultKind: c.defaultKind,
          sortOrder: i,
        })),
      )
      .onConflictDoNothing();

    if (opts.load) {
      // ponytail: --load is meant to insert a synthetic user with 20,000 expenses across five
      // years for SC-010 (load/perf testing). The `expenses` table doesn't exist until Phase 2
      // of the roadmap, so this branch is a documented no-op stub for now. Once packages/db's
      // schema exports `expenses`, replace this comment with batched inserts (chunks of ~1000)
      // referencing the seeded categories for category_id and spreading expense_date across five
      // years, then remove this stub.
      console.log('seed --load: expenses table not yet in schema (Phase 2); skipping.');
    }
  } finally {
    await close();
  }
}

// pathToFileURL, not a hand-built `file://` string: on Windows that gave `file://C:/…` against
// import.meta.url's `file:///C:/…`, so the CLI silently did nothing.
const isMain =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const url = process.env['DATABASE_URL'];
  if (!url) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }
  const load = process.argv.includes('--load');
  await seed(url, { load });
  console.log('seed complete');
}
