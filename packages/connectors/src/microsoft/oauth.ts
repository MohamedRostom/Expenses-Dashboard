import { AuthError, RateLimited, ProviderError } from '../panels/index.js';

/**
 * Build the Microsoft OAuth authorization URL with PKCE.
 */
export function buildAuthorizeUrl({
  clientId,
  redirectUri,
  scopes,
  state,
  codeChallenge,
  endpoints,
}: {
  clientId: string;
  redirectUri: string;
  scopes: string[];
  state: string;
  codeChallenge: string;
  endpoints?: { authorize?: string };
}): string {
  const authorizeBase =
    endpoints?.authorize ?? 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize';
  const url = new URL(authorizeBase);
  // Ensure offline_access is included
  const allScopes = scopes.includes('offline_access') ? scopes : [...scopes, 'offline_access'];
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', allScopes.join(' '));
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  return url.toString();
}

/**
 * Exchange authorization code for tokens.
 * Microsoft returns a new refresh token on each exchange.
 */
export async function exchangeCode(
  {
    code,
    codeVerifier,
    clientId,
    clientSecret,
    redirectUri,
  }: {
    code: string;
    codeVerifier: string;
    clientId: string;
    clientSecret: string;
    redirectUri: string;
  },
  fetchImpl: typeof fetch,
  endpoints?: { token?: string },
): Promise<{
  refreshToken: string;
  accessToken: string;
  grantedScopes: string[];
  rotatedRefreshToken: string;
  email?: string;
}> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    code_verifier: codeVerifier,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
  });

  const tokenUrl = endpoints?.token ?? 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
  const response = await fetchImpl(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  const data = (await response.json()) as Record<string, unknown>;

  if (!response.ok) {
    if (response.status === 400 && data.error === 'invalid_grant') {
      throw new AuthError('Invalid authorization code');
    }
    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After');
      const retryAfterMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : 60000;
      throw new RateLimited('Rate limited', retryAfterMs);
    }
    throw new ProviderError(`Token exchange failed: ${response.status}`);
  }

  const scopes = typeof data.scope === 'string' ? data.scope.split(' ') : [];

  // Extract email from id_token (OIDC Core 3.1.3.7: no signature check needed, came over TLS)
  let email: string | undefined;
  if (typeof data.id_token === 'string') {
    try {
      const [, payload] = data.id_token.split('.');
      if (payload) {
        const decoded = JSON.parse(
          new TextDecoder().decode(
            Uint8Array.from(atob(payload.replace(/-/g, '+').replace(/_/g, '/')), (c) =>
              c.charCodeAt(0),
            ),
          ),
        ) as { email?: string };
        email = decoded.email;
      }
    } catch {
      // Ignore id_token parse errors; email stays undefined
    }
  }

  return {
    refreshToken: data.refresh_token as string,
    accessToken: data.access_token as string,
    grantedScopes: scopes,
    rotatedRefreshToken: data.refresh_token as string,
    ...(email ? { email } : {}),
  };
}

/**
 * Refresh access token using refresh token.
 * Microsoft returns a new refresh token on each exchange.
 */
export async function refreshAccessToken(
  {
    refreshToken,
    clientId,
    clientSecret,
  }: {
    refreshToken: string;
    clientId: string;
    clientSecret: string;
  },
  fetchImpl: typeof fetch,
  endpoints?: { token?: string },
): Promise<{
  accessToken: string;
  rotatedRefreshToken: string;
}> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
    scope: 'offline_access',
  });

  const tokenUrl = endpoints?.token ?? 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
  const response = await fetchImpl(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  const data = (await response.json()) as Record<string, unknown>;

  if (!response.ok) {
    if (response.status === 400 && data.error === 'invalid_grant') {
      throw new AuthError('Refresh token expired or revoked');
    }
    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After');
      const retryAfterMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : 60000;
      throw new RateLimited('Rate limited', retryAfterMs);
    }
    throw new ProviderError(`Token refresh failed: ${response.status}`);
  }

  return {
    accessToken: data.access_token as string,
    rotatedRefreshToken: data.refresh_token as string,
  };
}
