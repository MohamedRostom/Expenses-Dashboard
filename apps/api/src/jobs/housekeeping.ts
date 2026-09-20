// T043: housekeeping — prunes rate_limits (>1h old), purges never-verified users after 7 days
// (cascades their sessions/tokens), purges audit_log and (T127) expense_versions rows older
// than 12 months (FR-015's "visible per expense for 12 months").
import { and, isNull, lt } from 'drizzle-orm';
import { auditLog, expenseVersions, users, type Db } from '@desk/db';
import type { RateLimiter } from '../adapters/rate-limiter.js';
import type { JobHandler } from './index.js';

const ONE_HOUR_MS = 60 * 60 * 1000;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const TWELVE_MONTHS_MS = 365 * 24 * 60 * 60 * 1000;

export function housekeepingJob(db: Db, limiter: RateLimiter): JobHandler {
  return async (_payload, ctx) => {
    const STEPS = 4;
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
    done += 1;
    await ctx.updateProgress(done, STEPS);

    await db.delete(expenseVersions).where(lt(expenseVersions.createdAt, auditCutoff));
    done += 1;
    await ctx.updateProgress(done, STEPS);
  };
}
