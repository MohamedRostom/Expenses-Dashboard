import type { Context } from 'hono';
import { ApiError } from './api-error.js';
import type { SessionUser } from '../middleware/session.js';
import type { AppVariables } from '../app.js';

/** Throws `unauthenticated` if sessionMiddleware didn't attach a user; otherwise returns it.
 * Use at the top of every authenticated route handler instead of checking c.get('user') inline. */
export function requireAuth(c: Context<{ Variables: AppVariables }>): SessionUser {
  const user = c.get('user');
  if (!user) throw new ApiError('unauthenticated', 'Sign in required', 401);
  return user;
}
