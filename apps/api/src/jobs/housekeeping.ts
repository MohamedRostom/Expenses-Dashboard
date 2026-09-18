// T043: housekeeping — prunes rate_limits (>1h old), purges never-verified users after 7 days
// (cascades their sessions/tokens), purges audit_log rows older than 12 months. expense_versions
// doesn't exist yet (Phase 3) so that part of the 12-month purge is skipped — noted, not silently
// dropped.
import { and, isNull, lt } from 'drizzle-orm';
import { auditLog, users, type Db } from '@desk/db';
import type { RateLimiter } from '../adapters/rate-limiter.js';
import type { JobHandler } from './index.js';

const ONE_HOUR_MS = 60 * 60 * 1000;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const TWELVE_MONTHS_MS = 365 * 24 * 60 * 60 * 1000;

export function housekeepingJob(db: Db, limiter: RateLimiter): JobHandler {
  return async (_payload, ctx) => {
    const STEPS = 3;
    let done = 0;
    await ctx.updateProgress(done, STEPS);

    await limiter.prune(ONE_HOUR_MS);
    done += 1;
    await ctx.updateProgress(done, STEPS);

    const unverifiedCutoff = new Date(Date.now() - SEVEN_DAYS_MS);
    await db
      .delete(users)
      .where(and(isNull(users.emailVerifiedAt), lt(users.createdAt, unverifiedCutoff)));
    done += 1;
    await ctx.updateProgress(done, STEPS);

    const auditCutoff = new Date(Date.now() - TWELVE_MONTHS_MS);
    await db.delete(auditLog).where(lt(auditLog.createdAt, auditCutoff));
    // ponytail: expense_versions purge skipped — table doesn't exist until Phase 3.
    done += 1;
    await ctx.updateProgress(done, STEPS);
  };
}
