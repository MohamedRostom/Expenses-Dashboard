import type { MiddlewareHandler } from 'hono';
import { getCookie } from 'hono/cookie';
import { eq } from 'drizzle-orm';
import type { Db } from '@desk/db';
import { users } from '@desk/db';
import type { SessionStore, Session } from '../adapters/session-store.js';

export const SESSION_COOKIE = '__Host-desk_session';

export type SessionUser = typeof users.$inferSelect;

export type SessionVariables = {
  user: SessionUser | null;
  session: Session | null;
};

/** SHA-256 of the raw session token, hex-encoded — matches SessionStore.tokenHash (research.md R2). */
async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Loads the session/user for the `__Host-desk_session` cookie if present and valid, and sets
 * them on context (c.get('user'), c.get('session')). Does NOT reject unauthenticated requests —
 * routes requiring auth check c.get('user') themselves and throw an `unauthenticated` ApiError.
 */
export function sessionMiddleware(
  db: Db,
  sessions: SessionStore,
): MiddlewareHandler<{ Variables: SessionVariables }> {
  return async (c, next) => {
    c.set('user', null);
    c.set('session', null);

    const token = getCookie(c, SESSION_COOKIE);
    if (token) {
      const tokenHash = await hashToken(token);
      const session = await sessions.touch(tokenHash);
      if (session) {
        const [user] = await db.select().from(users).where(eq(users.id, session.userId)).limit(1);
        if (user) {
          c.set('user', user);
          c.set('session', session);
        }
      }
    }

    return next();
  };
}
