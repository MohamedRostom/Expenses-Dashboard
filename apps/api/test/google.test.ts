import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import { eq, and } from 'drizzle-orm';
import { users, oauthAccounts } from '@desk/db';
import { startHarness, type Harness } from './harness.js';

const CLIENT_ID = 'test-client-id';
const ISSUER = 'https://accounts.google.com';
const DISCOVERY_URL = `${ISSUER}/.well-known/openid-configuration`;
const AUTH_ENDPOINT = `${ISSUER}/o/oauth2/v2/auth`;
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';

/** Picks the OAuth state cookie's `name=value` pair out of a `Set-Cookie` header (the csrf
 * middleware also issues `desk_csrf` on GET, so the header can carry more than one cookie). */
function cookiePair(setCookie: string): string {
  const pair = setCookie
    .split(/,\s*(?=[^;,]+=)/)
    .map((c) => c.split(';')[0]!)
    .find((c) => c.startsWith('desk_oauth'));
  if (!pair) throw new Error(`no oauth cookie in: ${setCookie}`);
  return pair;
}

describe('GET /auth/google/start + /auth/google/callback', () => {
  let harness: Harness;
  let publicJwk: Record<string, unknown>;
  let privateKey: Awaited<ReturnType<typeof generateKeyPair>>['privateKey'];

  beforeAll(async () => {
    harness = await startHarness();
    const { publicKey, privateKey: priv } = await generateKeyPair('RS256');
    privateKey = priv;
    publicJwk = { ...(await exportJWK(publicKey)), kid: 'test-kid', alg: 'RS256', use: 'sig' };
  });

  afterAll(async () => {
    await harness.close();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** Stubs global fetch for discovery, JWKS and token-exchange, and for the ID token returns
   * one signed with the test keypair carrying the given claims. */
  function stubGoogle(idTokenClaims: {
    sub: string;
    email: string;
    email_verified: boolean;
  }): void {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
        const url = String(input instanceof Request ? input.url : input);

        if (url === DISCOVERY_URL) {
          return new Response(
            JSON.stringify({
              issuer: ISSUER,
              authorization_endpoint: AUTH_ENDPOINT,
              token_endpoint: TOKEN_ENDPOINT,
              jwks_uri: JWKS_URL,
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          );
        }

        if (url === JWKS_URL) {
          return new Response(JSON.stringify({ keys: [publicJwk] }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }

        if (url === TOKEN_ENDPOINT) {
          const idToken = await new SignJWT({
            email: idTokenClaims.email,
            email_verified: idTokenClaims.email_verified,
          })
            .setProtectedHeader({ alg: 'RS256', kid: 'test-kid' })
            .setSubject(idTokenClaims.sub)
            .setIssuer(ISSUER)
            .setAudience(CLIENT_ID)
            .setIssuedAt()
            .setExpirationTime('10m')
            .sign(privateKey);
          return new Response(JSON.stringify({ id_token: idToken, access_token: 'fake' }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }

        throw new Error(`unexpected fetch in test: ${url} ${JSON.stringify(init)}`);
      }) as unknown as typeof fetch,
    );
  }

  /** Runs /auth/google/start to get a valid state+verifier cookie, then hits /callback with it. */
  async function runCallback(query: string): Promise<Response> {
    const startRes = await harness.app.request('/auth/google/start');
    expect(startRes.status).toBe(302);
    const setCookie = startRes.headers.get('set-cookie');
    if (!setCookie) throw new Error('expected /auth/google/start to set a cookie');
    const location = new URL(startRes.headers.get('location')!);
    const state = location.searchParams.get('state')!;

    return harness.app.request(`/auth/google/callback?code=fake-code&state=${state}${query}`, {
      headers: { cookie: cookiePair(setCookie) },
    });
  }

  it('creates a new user on first sign-in with a verified email', async () => {
    stubGoogle({ sub: 'google-sub-new', email: 'brandnew@example.com', email_verified: true });

    const res = await runCallback('');

    expect(res.status).toBe(302);
    expect(res.headers.get('set-cookie')).toMatch(/desk_session/);

    const [user] = await harness.db
      .select()
      .from(users)
      .where(eq(users.email, 'brandnew@example.com'));
    expect(user).toBeDefined();
    expect(user!.emailVerifiedAt).not.toBeNull();

    const [link] = await harness.db
      .select()
      .from(oauthAccounts)
      .where(
        and(
          eq(oauthAccounts.provider, 'google'),
          eq(oauthAccounts.providerSubject, 'google-sub-new'),
        ),
      );
    expect(link).toBeDefined();
    expect(link!.userId).toBe(user!.id);
  });

  it('links a verified Google email to an existing password account', async () => {
    const existing = await harness.asUser('has-a-password@example.com');
    stubGoogle({
      sub: 'google-sub-link',
      email: 'has-a-password@example.com',
      email_verified: true,
    });

    const res = await runCallback('');

    expect(res.status).toBe(302);
    const [link] = await harness.db
      .select()
      .from(oauthAccounts)
      .where(
        and(
          eq(oauthAccounts.provider, 'google'),
          eq(oauthAccounts.providerSubject, 'google-sub-link'),
        ),
      );
    expect(link).toBeDefined();
    expect(link!.userId).toBe(existing.userId);

    // Linking is additive only — the password the user already had must still be there.
    const [user] = await harness.db.select().from(users).where(eq(users.id, existing.userId));
    expect(user!.passwordHash).not.toBeNull();
  });

  it('refuses an unverified Google email without creating or linking anything', async () => {
    stubGoogle({
      sub: 'google-sub-unverified',
      email: 'unverified@example.com',
      email_verified: false,
    });

    const res = await runCallback('');

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('validation_failed');

    const [user] = await harness.db
      .select()
      .from(users)
      .where(eq(users.email, 'unverified@example.com'));
    expect(user).toBeUndefined();
    const [link] = await harness.db
      .select()
      .from(oauthAccounts)
      .where(eq(oauthAccounts.providerSubject, 'google-sub-unverified'));
    expect(link).toBeUndefined();
  });

  // "remove-last-method refused" (per the task list) is enforced by DELETE /me/oauth/:provider
  // and DELETE /me/password (T042) — routes that don't exist yet. Google sign-in itself is
  // additive-only (it only ever creates a user or adds an oauth_accounts link, see the second
  // test above), so there is nothing to refuse at this layer; the guard belongs with T042.
});
