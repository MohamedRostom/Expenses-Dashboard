import { argon2id } from 'hash-wasm';
import { createDb } from './index.js';
import { flags, users } from './schema.js';

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

const DEFAULT_CATEGORIES = [
  'Rent',
  'Council tax',
  'Utilities',
  'Internet',
  'Phone',
  'Subscriptions',
  'Groceries',
  'Eating out',
  'Transport',
  'Cycling',
  'Gym & health',
  'Personal care',
  'Clothing',
  'Entertainment',
  'Household',
  'Driving lessons',
  'Travel',
  'Other',
];

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
      process.env['E2E_SEEDED_PASSWORD'] ?? 'correct horse battery staple',
    );
    await db
      .insert(users)
      .values({
        id: E2E_USER_ID,
        email: E2E_USER_EMAIL,
        emailVerifiedAt: new Date(),
        defaultCurrency: 'GBP',
        passwordHash,
      })
      .onConflictDoUpdate({
        target: users.email,
        set: { passwordHash, emailVerifiedAt: new Date() },
      });

    if (opts.load) {
      // ponytail: --load is meant to insert a synthetic user with 20,000 expenses across five
      // years for SC-010 (load/perf testing). The `expenses` table doesn't exist until Phase 2
      // of the roadmap, so this branch is a documented no-op stub for now. Once packages/db's
      // schema exports `expenses`, replace this comment with batched inserts (chunks of ~1000)
      // referencing DEFAULT_CATEGORIES for category_id and spreading expense_date across five
      // years, then remove this stub.
      console.log('seed --load: expenses table not yet in schema (Phase 2); skipping.');
    }
  } finally {
    await close();
  }
}

// Referenced so DEFAULT_CATEGORIES stays wired for the future --load branch and any early caller
// seeding categories ahead of Phase 2 (categories has no schema yet either).
export { DEFAULT_CATEGORIES };

const isMain =
  process.argv[1] && import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`;
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
