import { createMiddleware } from 'hono/factory';
import type { Db } from '@desk/db';
import { resolveAllFlags } from '@desk/db';
import type { AppVariables } from '../app.js';
import { ApiError } from '../lib/api-error.js';

/** Middleware that requires a feature flag to be on for the current user.
 * If off, throws a 404 not_found error. */
export function requireFlag(db: Db, key: string) {
  return createMiddleware<{ Variables: AppVariables }>(async (c, next) => {
    const user = c.get('user');
    if (!user) throw new ApiError('unauthenticated', 'Not authenticated', 401);

    const flags = await resolveAllFlags(db, user.id);
    if (!flags[key]) {
      throw new ApiError('not_found', 'This feature is not available', 404);
    }

    await next();
  });
}
