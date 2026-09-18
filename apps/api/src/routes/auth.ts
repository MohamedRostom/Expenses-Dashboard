import { Hono, type Context } from 'hono';
import { setCookie, deleteCookie, getCookie } from 'hono/cookie';
import type { users } from '@desk/db';
import {
  RegisterRequest,
  VerifyRequest,
  LoginRequest,
  ForgotPasswordRequest,
  ResetPasswordRequest,
  type UserResponseT,
} from '@desk/contracts';
import type { AppDeps, AppVariables } from '../app.js';
import { ApiError } from '../lib/api-error.js';
import { SESSION_COOKIE } from '../middleware/session.js';
import * as auth from '../services/auth.js';

const CSRF_COOKIE = 'desk_csrf';

type UserRow = typeof users.$inferSelect;

function toUserResponse(user: UserRow): UserResponseT {
  return {
    id: user.id,
    email: user.email,
    defaultCurrency: user.defaultCurrency,
    theme: user.theme,
    timeZone: user.timeZone,
    onboardingCompletedAt: user.onboardingCompletedAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
  };
}

async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Rate-limits `key` and throws 429 "Too many attempts" if `limit` is exceeded (research.md R2). */
async function guard(deps: AppDeps, key: string, limit: number, windowMs: number): Promise<void> {
  const ok = await deps.limiter.hit(key, limit, windowMs);
  if (!ok) {
    throw new ApiError('rate_limited', 'Too many attempts', 429);
  }
}

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

function clientIp(c: { req: { header(name: string): string | undefined } }): string {
  return c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
}

function setSessionCookies(c: Context<{ Variables: AppVariables }>, token: string): void {
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: 90 * 24 * 60 * 60,
  });
  setCookie(c, CSRF_COOKIE, crypto.randomUUID(), {
    httpOnly: false,
    secure: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: 90 * 24 * 60 * 60,
  });
}

/** Mounted at /auth by app.ts. */
export function authRoutes(deps: AppDeps) {
  const app = new Hono<{ Variables: AppVariables }>();
  const authDeps: auth.AuthDeps = {
    db: deps.db,
    hasher: deps.hasher,
    sessions: deps.sessions,
    mailer: deps.mailer,
    breachChecker: deps.breachChecker,
    clock: deps.clock,
  };

  app.post('/register', async (c) => {
    const input = RegisterRequest.parse(await c.req.json());
    await guard(deps, `register:email:${input.email}`, 5, 15 * MINUTE);
    await guard(deps, `register:ip:${clientIp(c)}`, 20, HOUR);
    await auth.register(authDeps, input);
    return c.body(null, 202);
  });

  app.post('/verify', async (c) => {
    const input = VerifyRequest.parse(await c.req.json());
    const { user, sessionToken } = await auth.verify(authDeps, input);
    setSessionCookies(c, sessionToken);
    return c.json({ user: toUserResponse(user) }, 200);
  });

  app.post('/login', async (c) => {
    const input = LoginRequest.parse(await c.req.json());
    await guard(deps, `login:email:${input.email}`, 10, 15 * MINUTE);
    await guard(deps, `login:ip:${clientIp(c)}`, 100, HOUR);
    const { user, sessionToken } = await auth.login(authDeps, input);
    setSessionCookies(c, sessionToken);
    return c.json({ user: toUserResponse(user) }, 200);
  });

  app.post('/logout', async (c) => {
    const token = getCookie(c, SESSION_COOKIE);
    const userId = c.get('user')?.id ?? null;
    if (token) {
      await auth.logout(authDeps, await hashToken(token), userId);
    }
    deleteCookie(c, SESSION_COOKIE, { path: '/', secure: true });
    deleteCookie(c, CSRF_COOKIE, { path: '/', secure: true });
    return c.body(null, 204);
  });

  app.post('/password/forgot', async (c) => {
    const input = ForgotPasswordRequest.parse(await c.req.json());
    await guard(deps, `forgot:email:${input.email}`, 5, 15 * MINUTE);
    await guard(deps, `forgot:ip:${clientIp(c)}`, 20, HOUR);
    await auth.forgotPassword(authDeps, input);
    return c.body(null, 202);
  });

  app.post('/password/reset', async (c) => {
    const input = ResetPasswordRequest.parse(await c.req.json());
    await auth.resetPassword(authDeps, input);
    return c.body(null, 204);
  });

  return app;
}
