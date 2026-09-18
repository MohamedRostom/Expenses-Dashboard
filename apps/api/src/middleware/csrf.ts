import type { MiddlewareHandler } from 'hono';
import { getCookie } from 'hono/cookie';
import { ApiError } from '../lib/api-error.js';

const CSRF_COOKIE = 'desk_csrf';
const CSRF_HEADER = 'x-csrf-token';

/**
 * Double-submit CSRF (research.md R2): on every non-GET request the `desk_csrf` cookie value
 * must equal the `X-CSRF-Token` header. GET/HEAD/OPTIONS are read-only and exempt.
 */
export const csrf: MiddlewareHandler = async (c, next) => {
  const method = c.req.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    return next();
  }

  const cookieValue = getCookie(c, CSRF_COOKIE);
  const headerValue = c.req.header(CSRF_HEADER);

  if (!cookieValue || !headerValue || cookieValue !== headerValue) {
    // No dedicated CSRF code in ErrorCode (research.md R2/contracts errors.ts) — validation_failed
    // is the closest fit for "the request is malformed/untrustworthy as sent".
    throw new ApiError('validation_failed', 'CSRF token missing or invalid', 403);
  }

  return next();
};
