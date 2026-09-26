import { describe, expect, it, vi } from 'vitest';
import { buildAuthorizeUrl, exchangeCode, refreshAccessToken } from './oauth.js';
import { AuthError, RateLimited, ProviderError } from '../panels/index.js';

describe('Microsoft OAuth', () => {
  describe('buildAuthorizeUrl', () => {
    it('builds authorize URL with correct parameters and PKCE', () => {
      const url = buildAuthorizeUrl({
        clientId: 'client-123',
        redirectUri: 'https://app.local/oauth/microsoft',
        scopes: ['Calendars.Read', 'Mail.Read', 'offline_access'],
        state: 'state-xyz',
        codeChallenge: 'challenge-abc',
      });

      expect(url).toContain('https://login.microsoftonline.com/common/oauth2/v2.0/authorize');
      expect(url).toContain('client_id=client-123');
      expect(url).toContain('redirect_uri=https%3A%2F%2Fapp.local%2Foauth%2Fmicrosoft');
      expect(url).toContain('response_type=code');
      expect(url).toContain('code_challenge=challenge-abc');
      expect(url).toContain('code_challenge_method=S256');
      expect(url).toContain('state=state-xyz');
      // Scopes should be space-joined and include offline_access
      expect(url).toContain('scope=Calendars.Read+Mail.Read+offline_access');
    });

    it('includes offline_access in scopes if not present', () => {
      const url = buildAuthorizeUrl({
        clientId: 'client',
        redirectUri: 'http://localhost',
        scopes: ['Calendars.Read', 'Mail.Read'],
        state: 'state',
        codeChallenge: 'challenge',
      });

      expect(url).toContain('scope=Calendars.Read+Mail.Read+offline_access');
    });

    it('uses custom authorize endpoint when provided', () => {
      const url = buildAuthorizeUrl({
        clientId: 'client-123',
        redirectUri: 'http://localhost',
        scopes: ['scope1'],
        state: 'state',
        codeChallenge: 'challenge',
        endpoints: { authorize: 'http://x/auth' },
      });

      expect(new URL(url).origin + new URL(url).pathname).toBe('http://x/auth');
    });

    it('uses default Microsoft authorize endpoint when no override', () => {
      const url = buildAuthorizeUrl({
        clientId: 'client-123',
        redirectUri: 'http://localhost',
        scopes: ['scope1'],
        state: 'state',
        codeChallenge: 'challenge',
      });

      expect(new URL(url).origin + new URL(url).pathname).toBe(
        'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
      );
    });
  });

  describe('exchangeCode', () => {
    it('exchanges authorization code for tokens with grantedScopes', async () => {
      const fetchImpl = vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              access_token: 'access-xyz',
              refresh_token: 'refresh-abc',
              scope: 'Calendars.Read Mail.Read offline_access',
              expires_in: 3600,
            }),
            { status: 200 },
          ),
      );

      const result = await exchangeCode(
        {
          code: 'auth-code-123',
          codeVerifier: 'verifier-long-string',
          clientId: 'client-123',
          clientSecret: 'secret-xyz',
          redirectUri: 'https://app.local/oauth/microsoft',
        },
        fetchImpl,
      );

      expect(result.refreshToken).toBe('refresh-abc');
      expect(result.accessToken).toBe('access-xyz');
      expect(result.grantedScopes).toEqual(['Calendars.Read', 'Mail.Read', 'offline_access']);

      // Verify the POST request
      const call = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
      expect(call[0]).toContain('https://login.microsoftonline.com/common/oauth2/v2.0/token');
      const body = new URLSearchParams(call[1].body as string);
      expect(body.get('grant_type')).toBe('authorization_code');
      expect(body.get('code')).toBe('auth-code-123');
      expect(body.get('code_verifier')).toBe('verifier-long-string');
      expect(body.get('client_id')).toBe('client-123');
      expect(body.get('client_secret')).toBe('secret-xyz');
      expect(body.get('redirect_uri')).toBe('https://app.local/oauth/microsoft');
    });

    it('parses space-separated scopes into grantedScopes array', async () => {
      const fetchImpl = vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              access_token: 'access',
              refresh_token: 'refresh',
              scope: 'scope1 scope2 scope3',
              expires_in: 3600,
            }),
            { status: 200 },
          ),
      );

      const result = await exchangeCode(
        {
          code: 'code-123',
          codeVerifier: 'verifier',
          clientId: 'client',
          clientSecret: 'secret',
          redirectUri: 'http://localhost',
        },
        fetchImpl,
      );

      expect(result.grantedScopes).toEqual(['scope1', 'scope2', 'scope3']);
    });

    it('returns rotatedRefreshToken (Microsoft rotates on every exchange)', async () => {
      const fetchImpl = vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              access_token: 'access-xyz',
              refresh_token: 'refresh-new-token',
              scope: 'Calendars.Read Mail.Read offline_access',
              expires_in: 3600,
            }),
            { status: 200 },
          ),
      );

      const result = await exchangeCode(
        {
          code: 'code',
          codeVerifier: 'verifier',
          clientId: 'client',
          clientSecret: 'secret',
          redirectUri: 'http://localhost',
        },
        fetchImpl,
      );

      expect(result.rotatedRefreshToken).toBe('refresh-new-token');
    });

    it('throws AuthError on 400 with invalid_grant', async () => {
      const fetchImpl = vi.fn(
        async () => new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 }),
      );

      await expect(
        exchangeCode(
          {
            code: 'bad-code',
            codeVerifier: 'verifier',
            clientId: 'client',
            clientSecret: 'secret',
            redirectUri: 'http://localhost',
          },
          fetchImpl,
        ),
      ).rejects.toThrow(AuthError);
    });

    it('throws RateLimited on 429 with Retry-After header', async () => {
      const fetchImpl = vi.fn(
        async () =>
          new Response(JSON.stringify({ error: 'rate_limit_exceeded' }), {
            status: 429,
            headers: { 'Retry-After': '90' },
          }),
      );

      try {
        await exchangeCode(
          {
            code: 'code',
            codeVerifier: 'verifier',
            clientId: 'client',
            clientSecret: 'secret',
            redirectUri: 'http://localhost',
          },
          fetchImpl,
        );
        throw new Error('Should have thrown RateLimited');
      } catch (e) {
        expect(e).toBeInstanceOf(RateLimited);
        expect((e as RateLimited).retryAfterMs).toBe(90000);
      }
    });

    it('defaults Retry-After to 60s if missing', async () => {
      const fetchImpl = vi.fn(
        async () => new Response(JSON.stringify({ error: 'rate_limit_exceeded' }), { status: 429 }),
      );

      try {
        await exchangeCode(
          {
            code: 'code',
            codeVerifier: 'verifier',
            clientId: 'client',
            clientSecret: 'secret',
            redirectUri: 'http://localhost',
          },
          fetchImpl,
        );
        throw new Error('Should have thrown');
      } catch (e) {
        expect((e as RateLimited).retryAfterMs).toBe(60000);
      }
    });

    it('throws ProviderError on other non-2xx', async () => {
      const fetchImpl = vi.fn(
        async () => new Response(JSON.stringify({ error: 'server_error' }), { status: 500 }),
      );

      await expect(
        exchangeCode(
          {
            code: 'code',
            codeVerifier: 'verifier',
            clientId: 'client',
            clientSecret: 'secret',
            redirectUri: 'http://localhost',
          },
          fetchImpl,
        ),
      ).rejects.toThrow(ProviderError);
    });

    it('uses custom token endpoint when provided', async () => {
      const fetchImpl = vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              access_token: 'at',
              refresh_token: 'rt',
              scope: 'scope1',
            }),
            { status: 200 },
          ),
      );

      await exchangeCode(
        {
          code: 'code',
          codeVerifier: 'verifier',
          clientId: 'client',
          clientSecret: 'secret',
          redirectUri: 'http://localhost',
        },
        fetchImpl,
        { token: 'http://custom-token' },
      );

      const call = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
      expect(call[0]).toBe('http://custom-token');
    });

    it('uses default Microsoft token endpoint when no override', async () => {
      const fetchImpl = vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              access_token: 'at',
              refresh_token: 'rt',
              scope: 'scope1',
            }),
            { status: 200 },
          ),
      );

      await exchangeCode(
        {
          code: 'code',
          codeVerifier: 'verifier',
          clientId: 'client',
          clientSecret: 'secret',
          redirectUri: 'http://localhost',
        },
        fetchImpl,
      );

      const call = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
      expect(call[0]).toContain('https://login.microsoftonline.com/common/oauth2/v2.0/token');
    });
  });

  describe('refreshAccessToken', () => {
    it('refreshes access token and returns rotated refresh token', async () => {
      const fetchImpl = vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              access_token: 'new-access-token',
              refresh_token: 'new-refresh-token',
              expires_in: 3600,
            }),
            { status: 200 },
          ),
      );

      const result = await refreshAccessToken(
        {
          refreshToken: 'refresh-abc',
          clientId: 'client-123',
          clientSecret: 'secret-xyz',
        },
        fetchImpl,
      );

      expect(result.accessToken).toBe('new-access-token');
      expect(result.rotatedRefreshToken).toBe('new-refresh-token');

      // Verify the POST request
      const call = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
      expect(call[0]).toContain('https://login.microsoftonline.com/common/oauth2/v2.0/token');
      const body = new URLSearchParams(call[1].body as string);
      expect(body.get('grant_type')).toBe('refresh_token');
      expect(body.get('refresh_token')).toBe('refresh-abc');
      expect(body.get('client_id')).toBe('client-123');
      expect(body.get('client_secret')).toBe('secret-xyz');
    });

    it('includes offline_access in scope param to get new refresh token', async () => {
      const fetchImpl = vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              access_token: 'access',
              refresh_token: 'refresh',
              expires_in: 3600,
            }),
            { status: 200 },
          ),
      );

      await refreshAccessToken(
        {
          refreshToken: 'refresh',
          clientId: 'client',
          clientSecret: 'secret',
        },
        fetchImpl,
      );

      const call = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
      const body = new URLSearchParams(call[1].body as string);
      expect(body.get('scope')).toBe('offline_access');
    });

    it('throws AuthError on 400 with invalid_grant', async () => {
      const fetchImpl = vi.fn(
        async () => new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 }),
      );

      await expect(
        refreshAccessToken(
          {
            refreshToken: 'expired-refresh',
            clientId: 'client',
            clientSecret: 'secret',
          },
          fetchImpl,
        ),
      ).rejects.toThrow(AuthError);
    });

    it('throws RateLimited on 429', async () => {
      const fetchImpl = vi.fn(
        async () =>
          new Response(JSON.stringify({ error: 'rate_limit_exceeded' }), {
            status: 429,
            headers: { 'Retry-After': '45' },
          }),
      );

      try {
        await refreshAccessToken(
          {
            refreshToken: 'refresh',
            clientId: 'client',
            clientSecret: 'secret',
          },
          fetchImpl,
        );
        throw new Error('Should have thrown');
      } catch (e) {
        expect((e as RateLimited).retryAfterMs).toBe(45000);
      }
    });

    it('throws ProviderError on other non-2xx', async () => {
      const fetchImpl = vi.fn(
        async () => new Response(JSON.stringify({ error: 'server_error' }), { status: 500 }),
      );

      await expect(
        refreshAccessToken(
          {
            refreshToken: 'refresh',
            clientId: 'client',
            clientSecret: 'secret',
          },
          fetchImpl,
        ),
      ).rejects.toThrow(ProviderError);
    });

    it('uses custom token endpoint when provided', async () => {
      const fetchImpl = vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              access_token: 'new-at',
              refresh_token: 'new-rt',
            }),
            { status: 200 },
          ),
      );

      await refreshAccessToken(
        {
          refreshToken: 'refresh',
          clientId: 'client',
          clientSecret: 'secret',
        },
        fetchImpl,
        { token: 'http://custom-token' },
      );

      const call = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
      expect(call[0]).toBe('http://custom-token');
    });

    it('uses default Microsoft token endpoint when no override', async () => {
      const fetchImpl = vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              access_token: 'new-at',
              refresh_token: 'new-rt',
            }),
            { status: 200 },
          ),
      );

      await refreshAccessToken(
        {
          refreshToken: 'refresh',
          clientId: 'client',
          clientSecret: 'secret',
        },
        fetchImpl,
      );

      const call = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
      expect(call[0]).toContain('https://login.microsoftonline.com/common/oauth2/v2.0/token');
    });
  });
});
