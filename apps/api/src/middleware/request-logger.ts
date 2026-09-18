import type { MiddlewareHandler } from 'hono';
import { hashUserId, type Logger } from '../adapters/logger.js';

/** Context variables this middleware reads/writes. A later auth middleware sets `userId`. */
export type RequestLoggerVariables = {
  requestId: string;
  userId?: string;
};

/**
 * Hono middleware: logs one JSON line per request via `logger`. Reads an optional userId set on
 * the context by a later auth middleware (c.set('userId', ...)) and logs only its hash, never
 * the raw id. Not yet mounted into app.ts — a later task creates app.ts and wires this in.
 */
export function requestLogger(
  logger: Logger,
): MiddlewareHandler<{ Variables: RequestLoggerVariables }> {
  return async (c, next) => {
    const start = Date.now();
    const requestId = crypto.randomUUID();
    c.set('requestId', requestId);
    await next();
    const userId = c.get('userId');
    logger.log({
      requestId,
      hashedUserId: userId ? await hashUserId(userId) : null,
      route: c.req.routePath ?? c.req.path,
      status: c.res.status,
      durationMs: Date.now() - start,
    });
  };
}
