import { eq } from 'drizzle-orm';
import type { Db } from '@desk/db';
import { connectedAccounts, users } from '@desk/db';
import type { JobHandler } from './index.js';
import type { SecretBox } from '../adapters/secret-box.js';
import type { Clock } from '../app.js';
import { tierFor, nextDueAt, statusAfterFailures } from '@desk/core';
import { AuthError, RateLimited } from '@desk/connectors/panels';

export type PanelsRefreshDeps = {
  db: Db;
  secretBox: SecretBox;
  clock: Clock;
};

export function panelsRefreshJob(deps: PanelsRefreshDeps): JobHandler {
  return async (payload) => {
    const { accountId } = payload as { accountId: string };
    const now = deps.clock.now();

    // Load the account
    const [account] = await deps.db
      .select()
      .from(connectedAccounts)
      .where(eq(connectedAccounts.id, accountId));

    if (!account) {
      // Account may have been deleted; silently exit
      return;
    }

    // Load the user to determine refresh tier
    const [user] = await deps.db.select().from(users).where(eq(users.id, account.userId));

    if (!user) {
      return;
    }

    // Determine the tier based on last_active_at
    const tier = tierFor(user.lastActiveAt, now);

    // Stubs for now; Phase 3 and 4 will fill these in
    const refreshCalendar = async () => ({ rotatedCredential: undefined });
    const refreshMail = async () => ({ rotatedCredential: undefined });

    try {
      // For now, just run the stubs (no actual data fetching)
      const calendarResult = await refreshCalendar();
      const mailResult = await refreshMail();

      // Check if credential was rotated
      const rotatedCredential =
        (calendarResult as { rotatedCredential?: unknown }).rotatedCredential ||
        (mailResult as { rotatedCredential?: unknown }).rotatedCredential;

      if (rotatedCredential) {
        // Re-seal and store the rotated credential
        const sealed = await deps.secretBox.seal(JSON.stringify(rotatedCredential));
        await deps.db
          .update(connectedAccounts)
          .set({ credentialEnc: Buffer.from(sealed, 'hex') })
          .where(eq(connectedAccounts.id, accountId));
      }

      // Success: reset failures, set last_refresh_at, status = connected, next_refresh_at via policy
      const nextDue = nextDueAt(tier, now, 0);
      await deps.db
        .update(connectedAccounts)
        .set({
          consecutiveFailures: 0,
          lastRefreshAt: now,
          lastError: null,
          status: 'connected',
          nextRefreshAt: nextDue,
        })
        .where(eq(connectedAccounts.id, accountId));
    } catch (error) {
      // Handle specific error types
      if (error instanceof AuthError) {
        // Access revoked: set status to reconnect_needed
        await deps.db
          .update(connectedAccounts)
          .set({
            status: 'reconnect_needed',
            lastError: 'access_revoked',
          })
          .where(eq(connectedAccounts.id, accountId));
      } else if (error instanceof RateLimited) {
        // Rate limited: reschedule
        const retryAt = new Date(now.getTime() + error.retryAfterMs);
        await deps.db
          .update(connectedAccounts)
          .set({
            nextRefreshAt: retryAt,
            lastError: 'rate_limited',
          })
          .where(eq(connectedAccounts.id, accountId));
      } else {
        // Other error: increment failures, set status and next_refresh_at via policy
        const currentFailures = (account.consecutiveFailures || 0) + 1;
        const newStatus = statusAfterFailures(currentFailures);
        const nextDue = nextDueAt(tier, now, currentFailures);

        const lastErrorCode =
          error instanceof Error && error.message ? 'provider_unreachable' : 'provider_unreachable';

        await deps.db
          .update(connectedAccounts)
          .set({
            consecutiveFailures: currentFailures,
            lastError: lastErrorCode,
            status: newStatus,
            nextRefreshAt: nextDue,
          })
          .where(eq(connectedAccounts.id, accountId));
      }
    }
  };
}
