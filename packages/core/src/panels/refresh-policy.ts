export type Tier = 'active' | 'idle';

export const ERROR_AFTER_FAILURES = 20;

/** Determine the tier based on last activity. Active if within 24 hours, idle otherwise.
 * A null lastActiveAt is treated as idle. */
export function tierFor(lastActiveAt: Date | null, now: Date): Tier {
  if (lastActiveAt === null) {
    return 'idle';
  }

  const elapsedMs = now.getTime() - lastActiveAt.getTime();
  const hours24InMs = 24 * 60 * 60 * 1000;

  return elapsedMs <= hours24InMs ? 'active' : 'idle';
}

/** Calculate the next refresh due time based on tier, last refresh, and failure count.
 * Active tier starts at 5 minutes, idle at 1 hour. Interval doubles per consecutive failure,
 * capped at 1 hour. */
export function nextDueAt(tier: Tier, lastRefreshAt: Date, consecutiveFailures: number): Date {
  const baseIntervalMs = tier === 'active' ? 5 * 60 * 1000 : 60 * 60 * 1000;
  const maxIntervalMs = 60 * 60 * 1000;

  // Calculate interval: baseInterval * 2^consecutiveFailures, capped at maxInterval
  let intervalMs = baseIntervalMs * Math.pow(2, consecutiveFailures);
  intervalMs = Math.min(intervalMs, maxIntervalMs);

  const nextDue = new Date(lastRefreshAt.getTime() + intervalMs);
  return nextDue;
}

/** Determine the status based on consecutive failure count.
 * Returns 'error' when failures >= ERROR_AFTER_FAILURES, otherwise 'connected'. */
export function statusAfterFailures(consecutiveFailures: number): 'connected' | 'error' {
  return consecutiveFailures >= ERROR_AFTER_FAILURES ? 'error' : 'connected';
}

/** Check if a refresh should happen immediately when the user opens the Today page.
 * Returns true if lastRefreshAt is null or older than 2 minutes. */
export function shouldRefreshOnOpen(lastRefreshAt: Date | null, now: Date): boolean {
  if (lastRefreshAt === null) {
    return true;
  }

  const elapsedMs = now.getTime() - lastRefreshAt.getTime();
  const twoMinutesInMs = 2 * 60 * 1000;

  return elapsedMs > twoMinutesInMs;
}
