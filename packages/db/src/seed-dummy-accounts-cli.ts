import { pathToFileURL } from 'node:url';
import { eq } from 'drizzle-orm';
import { createDb } from './index.js';
import { users, connectedAccounts } from './schema.js';

/**
 * `pnpm --filter @desk/db seed-dummy-accounts <email> <count>` (T057): inserts `count`
 * `connected_accounts` rows for a user directly, to reach the ten-account limit (FR-... the
 * connect button's `isLimitReached` in apps/web/src/views/ConnectionsView.vue is a pure
 * `accounts.length >= 10` check, so proving it doesn't need real provider data).
 *
 * ponytail: real (non-standards) accounts can't do this — the mocks' fake OAuth identity
 * (infra/mocks/src/google.ts, graph.ts) always returns the same one address regardless of which
 * mock key is used, so ten real connects would just merge into one row via the
 * `(user_id, provider, address)` unique index; and `POST /connections/standards` (T070) isn't
 * built yet. `provider: 'standards'` with no real credential is safe here specifically because
 * `disconnect()`'s revoke step (apps/api/src/services/connections.ts) looks the provider up in
 * `calendarSources`, which has no 'standards' entry, and returns immediately without ever
 * touching `credential_enc` — so these rows are also safely disconnectable through the real UI.
 */
const USAGE = 'usage: seed-dummy-accounts <email> <count>';

export async function runSeedDummyAccountsCli(
  argv: string[],
  databaseUrl: string | undefined,
): Promise<void> {
  const [email, countStr] = argv;
  const count = Number(countStr);
  if (!email || !countStr || !Number.isFinite(count) || count < 1) throw new Error(USAGE);
  if (!databaseUrl) throw new Error('DATABASE_URL is required');

  const { db, close } = createDb(databaseUrl);
  try {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    if (!user) throw new Error(`no user with email ${email}`);

    const now = new Date();
    for (let i = 0; i < count; i++) {
      const address = `dummy-${crypto.randomUUID()}@example.test`;
      await db.insert(connectedAccounts).values({
        userId: user.id,
        provider: 'standards',
        address,
        label: address,
        colour: 'slate',
        capabilities: ['mail'],
        grantedScopes: [],
        credentialEnc: Buffer.from('seed-dummy-accounts-cli placeholder, never opened'),
        status: 'connected',
        nextRefreshAt: now,
      });
    }
  } finally {
    await close();
  }
}

const isMain =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  await runSeedDummyAccountsCli(process.argv.slice(2), process.env['DATABASE_URL']);
  console.log('dummy accounts seeded');
}
