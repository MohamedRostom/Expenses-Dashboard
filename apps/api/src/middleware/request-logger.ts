import type { MiddlewareHandler } from 'hono';
import { hashUserId, type Logger } from '../adapters/logger.js';

/** Context variables this middleware reads/writes. `user` is set by middleware/session.ts
 * (c.set('user', ...)) — this used to read a `userId` var nothing ever set, so hashedUserId was
 * always null regardless of who was signed in. */
export type RequestLoggerVariables = {
  requestId: string;
  user?: { id: string } | null;
  /** Set by middleware/errors.ts on an unhandled error, so this middleware can pass the real
   * exception (not a synthetic one) on to a Sentry-reporting Logger. */
  lastError?: Error;
};

/**
 * Hono middleware: logs one JSON line per request via `logger`. Reads the signed-in user set on
 * the context by middleware/session.ts and logs only their hashed id, never the raw one.
 */
export function requestLogger(
  logger: Logger,
): MiddlewareHandler<{ Variables: RequestLoggerVariables }> {
  return async (c, next) => {
    const start = Date.now();
    const requestId = crypto.randomUUID();
    c.set('requestId', requestId);
    await next();
    const userId = c.get('user')?.id;
    const event: Record<string, unknown> = {
      requestId,
      hashedUserId: userId ? await hashUserId(userId) : null,
      route: c.req.routePath ?? c.req.path,
      status: c.res.status,
      durationMs: Date.now() - start,
    };
    // Non-enumerable: JSON.stringify(event) in the base stdout logger skips it (an Error has no
    // enumerable own properties, so it would otherwise print as "{}"), but logger-node.ts's
    // Sentry wrapper reads it directly off the event object.
    const lastError = c.get('lastError');
    if (lastError) Object.defineProperty(event, 'errorObject', { value: lastError });
    logger.log(event as never);
  };
}
