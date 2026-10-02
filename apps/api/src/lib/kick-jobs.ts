import type { Context } from 'hono';

/** T086: kicks the job runner once, non-blocking, right after a user-triggered enqueue
 * (SC-002) — background refreshes still wait for the JOB_TICK_MS tick. On Workers,
 * ties the kick's lifetime to the request via ctx.waitUntil so it isn't cut off when the
 * response is sent; on Node, c.executionCtx throws (no execution context there), so it
 * just runs detached instead. Never awaited in the response path. */
export function kickJobsNow(c: Context, runJobsNow: (() => Promise<void>) | undefined): void {
  if (!runJobsNow) return;
  const p = runJobsNow().catch((err: unknown) => console.error('jobs:kick failed', err));
  try {
    c.executionCtx.waitUntil(p);
  } catch {
    // Node: no executionCtx — let it run detached in the background.
  }
}
