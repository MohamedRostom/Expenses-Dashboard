import { Hono, type Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { createLocalJWKSet, jwtVerify, type JSONWebKeySet } from 'jose';
import { and, eq } from 'drizzle-orm';
import type { Db } from '@desk/db';
import { oauthAccounts, users } from '@desk/db';
import type { SessionStore } from '../adapters/session-store.js';
import type { AppVariables, Clock } from '../app.js';
import { ApiError } from '../lib/api-error.js';
import { SESSION_COOKIE } from '../middleware/session.js';
import { seedDefaultCategories } from '../services/categories.js';

const CSRF_COOKIE = 'desk_csrf';
const OAUTH_STATE_COOKIE = 'desk_oauth_state';
const OAUTH_STATE_MAX_AGE_S = 600;

export type GoogleConfig = { clientId: string; clientSecret: string; appOrigin: string };

type GoogleDeps = {
  db: Db;
  sessions: SessionStore;
  clock: Clock;
  google: GoogleConfig;
};

type Discovery = {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
};

async function discoverGoogle(): Promise<Discovery> {
  const res = await fetch('https://accounts.google.com/.well-known/openid-configuration');
  if (!res.ok) throw new Error(`Google discovery document fetch failed: ${res.status}`);
  return (await res.json()) as Discovery;
}

function base64url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function sha256Base64url(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return base64url(new Uint8Array(digest));
}

async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Starts a session for `userId` on the response: sets the session + CSRF cookies. */
async function loginAs(
  c: Context<{ Variables: AppVariables }>,
  sessions: SessionStore,
  userId: string,
): Promise<void> {
  const token = crypto.randomUUID();
  await sessions.create({ userId, tokenHash: await hashToken(token) });
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

/**
 * Hand-written PKCE authorization-code flow against Google's OpenID discovery document
 * (research.md R3). Mounted at /auth/google by app.ts.
 *
 * ponytail: the discovery document is fetched fresh on every request rather than cached
 * in-process — one extra fetch per sign-in is cheap and keeps tests deterministic; add an
 * in-memory TTL cache here if Google's rate limits ever become a problem.
 */
export function createGoogleRoutes(deps: GoogleDeps) {
  const app = new Hono<{ Variables: AppVariables }>();
  const { clientId, clientSecret, appOrigin } = deps.google;

  app.get('/start', async (c) => {
    const discovery = await discoverGoogle();

    const verifierBytes = crypto.getRandomValues(new Uint8Array(32));
    const verifier = base64url(verifierBytes);
    const challenge = await sha256Base64url(verifier);
    const state = base64url(crypto.getRandomValues(new Uint8Array(16)));

    setCookie(c, OAUTH_STATE_COOKIE, `${state}.${verifier}`, {
      httpOnly: true,
      secure: true,
      sameSite: 'Lax',
      path: '/',
      maxAge: OAUTH_STATE_MAX_AGE_S,
    });

    const redirectUri = `${appOrigin}/auth/google/callback`;
    const authUrl = new URL(discovery.authorization_endpoint);
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', 'openid email profile');
    authUrl.searchParams.set('code_challenge', challenge);
    authUrl.searchParams.set('code_challenge_method', 'S256');
    authUrl.searchParams.set('state', state);

    return c.redirect(authUrl.toString(), 302);
  });

  app.get('/callback', async (c) => {
    const code = c.req.query('code');
    const returnedState = c.req.query('state');
    const cookieValue = getCookie(c, OAUTH_STATE_COOKIE);
    deleteCookie(c, OAUTH_STATE_COOKIE, { path: '/' });

    if (!code || !returnedState || !cookieValue) {
      throw new ApiError('validation_failed', 'Missing Google OAuth code or state', 400);
    }
    const [state, verifier] = cookieValue.split('.');
    if (!state || !verifier || state !== returnedState) {
      throw new ApiError('validation_failed', 'Google OAuth state mismatch', 400);
    }

    const discovery = await discoverGoogle();
    const redirectUri = `${appOrigin}/auth/google/callback`;

    const tokenRes = await fetch(discovery.token_endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        client_id: clientId,
        client_secret: clientSecret,
        code_verifier: verifier,
      }),
    });
    if (!tokenRes.ok) {
      throw new ApiError('validation_failed', 'Google token exchange failed', 400);
    }
    const tokenBody = (await tokenRes.json()) as { id_token?: string };
    if (!tokenBody.id_token) {
      throw new ApiError('validation_failed', 'Google token response had no id_token', 400);
    }

    // Fetched via the injectable global `fetch` (not jose's createRemoteJWKSet, which uses
    // Node's raw http module under the hood) so this stays testable and Workers-compatible.
    const jwksRes = await fetch(discovery.jwks_uri);
    if (!jwksRes.ok) throw new ApiError('validation_failed', 'Failed to fetch Google JWKS', 502);
    const jwks = createLocalJWKSet((await jwksRes.json()) as JSONWebKeySet);
    const { payload } = await jwtVerify(tokenBody.id_token, jwks, {
      issuer: discovery.issuer,
      audience: clientId,
    });

    const sub = payload.sub;
    const email = typeof payload['email'] === 'string' ? payload['email'] : undefined;
    const emailVerified = payload['email_verified'] === true;
    if (!sub || !email) {
      throw new ApiError('validation_failed', 'Google ID token missing sub or email', 400);
    }

    const [existingLink] = await deps.db
      .select()
      .from(oauthAccounts)
      .where(and(eq(oauthAccounts.provider, 'google'), eq(oauthAccounts.providerSubject, sub)));

    if (existingLink) {
      await loginAs(c, deps.sessions, existingLink.userId);
      return c.redirect(`${appOrigin}/`, 302);
    }

    if (!emailVerified) {
      throw new ApiError('validation_failed', 'Google account email is not verified', 400);
    }

    const [existingUser] = await deps.db.select().from(users).where(eq(users.email, email));

    let userId: string;
    if (existingUser) {
      userId = existingUser.id;
    } else {
      const [created] = await deps.db
        .insert(users)
        .values({
          email,
          emailVerifiedAt: deps.clock.now(),
          defaultCurrency: 'GBP',
          timeZone: 'UTC',
        })
        .returning();
      if (!created) throw new Error('google callback: user insert returned no row');
      userId = created.id;
      await seedDefaultCategories(deps.db, userId);
    }

    await deps.db.insert(oauthAccounts).values({
      userId,
      provider: 'google',
      providerSubject: sub,
      emailAtLink: email,
    });

    await loginAs(c, deps.sessions, userId);
    return c.redirect(`${appOrigin}/`, 302);
  });

  return app;
}
