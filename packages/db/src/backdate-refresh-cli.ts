import { pathToFileURL } from 'node:url';
import { eq, and } from 'drizzle-orm';
import { createDb } from './index.js';
import { users, connectedAccounts } from './schema.js';

/**
 * `pnpm --filter @desk/db backdate-refresh <email> <provider> <minutesAgo>` (T029): sets a
 * connected account's `last_refresh_at` into the past, for e2e specs that need to prove staleness
 * behaviour (the 2-minute auto-refresh threshold, the tier-based "stale" UI notice) without
 * either waiting for real time to pass or adding a clock override to the running api service —
 * this is a test/CI-only DB write, the same shape as `flags-cli.ts`'s `flags set`.
 */
const USAGE = 'usage: backdate-refresh <email> <provider> <minutesAgo>';

export async function runBackdateRefreshCli(
  argv: string[],
  databaseUrl: string | undefined,
): Promise<void> {
  const [email, provider, minutesAgoStr] = argv;
  const minutesAgo = Number(minutesAgoStr);
  if (!email || !provider || !minutesAgoStr || !Number.isFinite(minutesAgo)) {
    throw new Error(USAGE);
  }
  if (!databaseUrl) throw new Error('DATABASE_URL is required');

  const { db, close } = createDb(databaseUrl);
  try {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    if (!user) throw new Error(`no user with email ${email}`);

    const backdatedAt = new Date(Date.now() - minutesAgo * 60_000);
    const result = await db
      .update(connectedAccounts)
      .set({ lastRefreshAt: backdatedAt })
      .where(and(eq(connectedAccounts.userId, user.id), eq(connectedAccounts.provider, provider)))
      .returning({ id: connectedAccounts.id });

    if (result.length === 0) {
      throw new Error(`no connected ${provider} account for ${email}`);
    }
  } finally {
    await close();
  }
}

const isMain =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  await runBackdateRefreshCli(process.argv.slice(2), process.env['DATABASE_URL']);
  console.log('last_refresh_at backdated');
}
