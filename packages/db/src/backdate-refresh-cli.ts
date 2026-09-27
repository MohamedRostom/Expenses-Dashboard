import { pathToFileURL } from 'node:url';
import { eq, and } from 'drizzle-orm';
import { createDb } from './index.js';
import { users, connectedAccounts, accountCalendars } from './schema.js';

/**
 * `pnpm --filter @desk/db backdate-refresh <email> <provider> <minutesAgo>` (T029): sets a
 * connected account's `last_refresh_at` into the past, for e2e specs that need to prove staleness
 * behaviour (the 2-minute auto-refresh threshold, the tier-based "stale" UI notice) without
 * either waiting for real time to pass or adding a clock override to the running api service —
 * this is a test/CI-only DB write, the same shape as `flags-cli.ts`'s `flags set`.
 *
 * Also clears the account's stored calendar cursor(s), forcing its next refresh to be a full
 * resync rather than an incremental one. This matters for e2e specs that delete a mock event and
 * expect it to disappear: once a cursor exists, apps/api/src/jobs/panels-refresh.ts only deletes
 * stale cached rows that come back tombstoned (`status: 'cancelled'` / `@removed`), but
 * GoogleFake/GraphFake's `deleteEvent` (packages/connectors/src/{google,microsoft}/fake.ts)
 * physically removes the item instead of tombstoning it — real Google/Graph delta feeds send a
 * tombstone for a deletion, so this is a mock-fidelity gap, not a real API behaviour. A full
 * resync (no cursor) deletes by "not seen in this fetch" instead, which does still work
 * correctly against the fakes as they are today — see this run's report for the fuller finding.
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

    for (const { id: accountId } of result) {
      await db
        .update(accountCalendars)
        .set({ cursor: null })
        .where(eq(accountCalendars.accountId, accountId));
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
