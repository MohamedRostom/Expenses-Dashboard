import { describe, expect, it, vi } from 'vitest';
import { buildAuthorizeUrl, exchangeCode, refreshAccessToken, revoke } from './oauth.js';
import { AuthError, RateLimited, ProviderError } from '../panels/index.js';

describe('Google OAuth', () => {
  describe('buildAuthorizeUrl', () => {
    it('builds authorize URL with correct parameters and PKCE', () => {
      const url = buildAuthorizeUrl({
        clientId: 'client-123',
        redirectUri: 'https://app.local/oauth/google',
        scopes: [
          'https://www.googleapis.com/auth/calendar.readonly',
          'https://www.googleapis.com/auth/gmail.readonly',
        ],
        state: 'state-xyz',
        codeChallenge: 'challenge-abc',
      });

      expect(url).toContain('https://accounts.google.com/o/oauth2/v2/auth');
      expect(url).toContain('client_id=client-123');
      expect(url).toContain('redirect_uri=https%3A%2F%2Fapp.local%2Foauth%2Fgoogle');
      expect(url).toContain('response_type=code');
      expect(url).toContain('code_challenge=challenge-abc');
      expect(url).toContain('code_challenge_method=S256');
      expect(url).toContain('access_type=offline');
      expect(url).toContain('prompt=consent');
      expect(url).toContain('state=state-xyz');
      // Scopes should be space-joined
      expect(url).toContain(
        'scope=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fcalendar.readonly+https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fgmail.readonly',
      );
      // NO include_granted_scopes
      expect(url).not.toContain('include_granted_scopes');
    });
  });

  describe('exchangeCode', () => {
    it('exchanges authorization code for tokens', async () => {
      const fetchImpl = vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              access_token: 'access-xyz',
              refresh_token: 'refresh-abc',
              scope:
                'https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/gmail.readonly',
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
          redirectUri: 'https://app.local/oauth/google',
        },
        fetchImpl,
      );

      expect(result.refreshToken).toBe('refresh-abc');
      expect(result.accessToken).toBe('access-xyz');
      expect(result.grantedScopes).toEqual([
        'https://www.googleapis.com/auth/calendar.readonly',
        'https://www.googleapis.com/auth/gmail.readonly',
      ]);
      expect(result.email).toBeUndefined();

      // Verify the POST request
      const call = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
      expect(call[0]).toContain('https://oauth2.googleapis.com/token');
      const body = new URLSearchParams(call[1].body as string);
      expect(body.get('grant_type')).toBe('authorization_code');
      expect(body.get('code')).toBe('auth-code-123');
      expect(body.get('code_verifier')).toBe('verifier-long-string');
      expect(body.get('client_id')).toBe('client-123');
      expect(body.get('client_secret')).toBe('secret-xyz');
      expect(body.get('redirect_uri')).toBe('https://app.local/oauth/google');
    });

    it('parses space-separated scopes into grantedScopes array', async () => {
      const fetchImpl = vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              access_token: 'access-xyz',
              refresh_token: 'refresh-abc',
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
            headers: { 'Retry-After': '120' },
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
        expect((e as RateLimited).retryAfterMs).toBe(120000);
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
  });

  describe('refreshAccessToken', () => {
    it('refreshes access token using refresh token', async () => {
      const fetchImpl = vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              access_token: 'new-access-token',
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
      expect(result.rotatedRefreshToken).toBeUndefined();

      // Verify the POST request
      const call = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
      expect(call[0]).toContain('https://oauth2.googleapis.com/token');
      const body = new URLSearchParams(call[1].body as string);
      expect(body.get('grant_type')).toBe('refresh_token');
      expect(body.get('refresh_token')).toBe('refresh-abc');
      expect(body.get('client_id')).toBe('client-123');
      expect(body.get('client_secret')).toBe('secret-xyz');
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
            headers: { 'Retry-After': '30' },
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
        expect((e as RateLimited).retryAfterMs).toBe(30000);
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
  });

  describe('revoke', () => {
    it('revokes a token at Google endpoint', async () => {
      const fetchImpl = vi.fn(async () => new Response('', { status: 200 }));

      await revoke('access-or-refresh-token', fetchImpl);

      const call = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
      expect(call[0]).toContain('https://oauth2.googleapis.com/revoke');
      const body = new URLSearchParams(call[1].body as string);
      expect(body.get('token')).toBe('access-or-refresh-token');
    });

    it('throws ProviderError on non-2xx', async () => {
      const fetchImpl = vi.fn(
        async () => new Response(JSON.stringify({ error: 'invalid_token' }), { status: 400 }),
      );

      await expect(revoke('bad-token', fetchImpl)).rejects.toThrow(ProviderError);
    });
  });
});
