import { Hono } from 'hono';
import { FeedbackRequest } from '@desk/contracts';
import { feedback } from '@desk/db';
import type { Db } from '@desk/db';
import type { AppVariables } from '../app.js';
import type { RateLimiter } from '../adapters/rate-limiter.js';
import { ApiError } from '../lib/api-error.js';
import { clientIp } from '../lib/client-ip.js';

// T112: 5 submissions/hour — enough for genuine bug reports, cheap to abuse-proof, documented
// here rather than made configurable (nobody has asked for a different number).
const FEEDBACK_LIMIT = 5;
const FEEDBACK_WINDOW_MS = 60 * 60 * 1000;

/** POST /feedback — authenticated or anonymous (contracts/api.md doesn't require auth; the
 * feedback table's user_id is nullable). Rate limited per user when signed in, per IP otherwise. */
export function createFeedbackRoutes(db: Db, limiter: RateLimiter) {
  const app = new Hono<{ Variables: AppVariables }>();

  app.post('/feedback', async (c) => {
    const user = c.get('user');
    const input = FeedbackRequest.parse(await c.req.json());

    const limitKey = user ? `feedback:user:${user.id}` : `feedback:ip:${clientIp(c) ?? 'unknown'}`;
    const allowed = await limiter.hit(limitKey, FEEDBACK_LIMIT, FEEDBACK_WINDOW_MS);
    if (!allowed) throw new ApiError('rate_limited', 'Too much feedback, try again later', 429);

    // Consent-gated metadata: only store identifying fields (user agent) when the submitter
    // opted in to being contacted about their feedback.
    const userAgent = input.contactOk ? (c.req.header('user-agent') ?? null) : null;

    await db.insert(feedback).values({
      userId: user?.id ?? null,
      page: input.page,
      message: input.message,
      contactOk: input.contactOk,
      userAgent,
    });

    return c.body(null, 202);
  });

  return app;
}
