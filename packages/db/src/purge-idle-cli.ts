import { pathToFileURL } from 'node:url';
import { eq } from 'drizzle-orm';
import { createDb } from './index.js';
import { users, connectedAccounts, cachedEvents, cachedMessages } from './schema.js';

/**
 * `pnpm --filter @desk/db purge-idle <email>` (T058): simulates `panels.purge`
 * (apps/api/src/jobs/panels-purge.ts) for one user directly against the compose database, for an
 * e2e spec that needs to prove the "purged -> loading, not stale rows" UI behaviour without a
 * clock-override route on the running api service (there is none — the mocks expose a per-account
 * clock for provider data, not a way to fast-forward the api's own JobRunner).
 *
 * ponytail: this writes the same end state the real job leaves (cache rows gone,
 * `cache_purged_at` set, `users.last_active_at` backdated past the 30-day cutoff) but skips the
 * job's own machinery (`JobRunner.cancelForUser`, the audit row, re-enqueuing itself) — none of
 * that is observable from the browser side this spec drives. If a future spec needs those too,
 * promote this into a real trigger route behind a test-only flag instead of duplicating more of
 * the job here.
 */
const USAGE = 'usage: purge-idle <email>';
const IDLE_DAYS = 31;

export async function runPurgeIdleCli(
  argv: string[],
  databaseUrl: string | undefined,
): Promise<void> {
  const [email] = argv;
  if (!email) throw new Error(USAGE);
  if (!databaseUrl) throw new Error('DATABASE_URL is required');

  const { db, close } = createDb(databaseUrl);
  try {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    if (!user) throw new Error(`no user with email ${email}`);

    const idleSince = new Date(Date.now() - IDLE_DAYS * 24 * 60 * 60 * 1000);
    const now = new Date();

    await db.update(users).set({ lastActiveAt: idleSince }).where(eq(users.id, user.id));
    await db.delete(cachedEvents).where(eq(cachedEvents.userId, user.id));
    await db.delete(cachedMessages).where(eq(cachedMessages.userId, user.id));
    await db
      .update(connectedAccounts)
      .set({ cachePurgedAt: now })
      .where(eq(connectedAccounts.userId, user.id));
  } finally {
    await close();
  }
}

const isMain =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  await runPurgeIdleCli(process.argv.slice(2), process.env['DATABASE_URL']);
  console.log('idle purge simulated');
}
