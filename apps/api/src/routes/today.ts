import { Hono } from 'hono';
import type { AppVariables } from '../app.js';
import { requireAuth } from '../lib/require-auth.js';
import type { PanelsService } from '../services/panels.js';
import type { RateLimiter } from '../adapters/rate-limiter.js';
import type { Clock } from '../app.js';

const RATE_LIMIT_KEY_PREFIX = 'panels.refresh:';
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_PER_MINUTE = 1;

type TodayRouteDeps = {
  panels: PanelsService;
  limiter: RateLimiter;
  clock: Clock;
};

export function createTodayRoutes(deps: TodayRouteDeps) {
  const app = new Hono<{ Variables: AppVariables }>();

  // GET /panels/today
  app.get('/', async (c) => {
    const user = requireAuth(c);
    const now = deps.clock.now();

    const payload = await deps.panels.todayPayload(user.id, now);
    return c.json(payload);
  });

  // POST /panels/today/refresh
  app.post('/refresh', async (c) => {
    const user = requireAuth(c);

    // Check rate limit
    const rateLimitKey = `${RATE_LIMIT_KEY_PREFIX}${user.id}`;
    const allowed = await deps.limiter.hit(
      rateLimitKey,
      RATE_LIMIT_PER_MINUTE,
      RATE_LIMIT_WINDOW_MS,
    );

    if (!allowed) {
      // Calculate retry-after seconds — return a custom error response
      const retryAfterSeconds = Math.ceil(RATE_LIMIT_WINDOW_MS / 1000);
      return c.json(
        {
          error: { code: 'rate_limited', message: 'Rate limited: one refresh per minute' },
          retryAfterSeconds,
        },
        429,
      );
    }

    // Mark accounts older than 2 minutes as due
    const twoMinutesMs = 2 * 60 * 1000;
    const queued = await deps.panels.markDue(user.id, twoMinutesMs);

    return c.json({ queued }, 202);
  });

  return app;
}
