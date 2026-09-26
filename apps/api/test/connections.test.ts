import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { AuthError } from '@desk/connectors/panels';
import { connectedAccounts, setGlobalFlag } from '@desk/db';
import { SESSION_COOKIE } from '../src/middleware/session.js';
import { startHarness, TEST_SECRET_BOX_KEY, type Harness } from './harness.js';
import { createSecretBox } from '../src/adapters/secret-box.js';
import { openCredential, sealCredential } from '../src/lib/credential.js';

const b64url = (s: string) => Buffer.from(s).toString('base64url');
/** Unsigned id_token carrying only the email claim — the route decodes it without verifying. */
const fakeIdToken = (email: string) =>
  `${b64url('{"alg":"none"}')}.${b64url(JSON.stringify({ email }))}.x`;

/** Picks the panels OAuth state cookie out of a Set-Cookie header (csrf may be there too). */
function statePair(setCookie: string): string {
  const pair = setCookie
    .split(/,\s*(?=[^;,]+=)/)
    .map((c) => c.split(';')[0]!.trim())
    .find((c) => c.startsWith('desk_connections_oauth_state='));
  if (!pair) throw new Error(`no panels state cookie in: ${setCookie}`);
  return pair;
}

const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const MICROSOFT_TOKEN_ENDPOINT = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';

describe('Connections API — Slice A', () => {
  let harness: Harness;

  beforeAll(async () => {
    harness = await startHarness();
  }, 120_000);

  /** Inserts `n` google accounts for the user directly; returns their ids. */
  async function seedAccounts(userId: string, n: number, prefix = 'seeded'): Promise<string[]> {
    const ids: string[] = [];
    for (let i = 0; i < n; i++) {
      const rows = (await harness.db.execute(sql`
        INSERT INTO connected_accounts
          (user_id, provider, address, label, colour, capabilities, granted_scopes,
           credential_enc, status, next_refresh_at)
        VALUES (${userId}, 'google', ${`${prefix}-${i}@example.com`}, ${`${prefix}-${i}`}, 'teal',
          ARRAY['calendar'], ARRAY['https://www.googleapis.com/auth/calendar.readonly'],
          decode('00', 'hex'), 'connected', now())
        RETURNING id`)) as unknown as { id: string }[];
      ids.push(rows[0]!.id);
    }
    return ids;
  }

  async function accountCount(userId: string): Promise<number> {
    const rows = (await harness.db.execute(
      sql`SELECT count(*)::int AS n FROM connected_accounts WHERE user_id = ${userId}`,
    )) as unknown as { n: number }[];
    return rows[0]!.n;
  }

  afterAll(async () => {
    await harness.close();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('GET /flags', () => {
    it('returns the five panels.* flags', async () => {
      const user = await harness.asUser('flags-panels@test.com');
      const res = await user.get('/flags');
      expect(res.status).toBe(200);

      const body = (await res.json()) as { flags: Record<string, boolean> };
      expect(body.flags).toHaveProperty('panels.today');
      expect(body.flags).toHaveProperty('panels.google_calendar');
      expect(body.flags).toHaveProperty('panels.google_mail');
      expect(body.flags).toHaveProperty('panels.microsoft');
      expect(body.flags).toHaveProperty('panels.standards');
    });
  });

  describe('GET /panels/today, GET /connections, GET /connections/providers, GET /connections/:provider/start — page flag', () => {
    it('all answer 404 when panels.today is off', async () => {
      const user = await harness.asUser('page-flag-off@test.com');
      await setGlobalFlag(harness.db, 'panels.today', false);

      const todayRes = await user.get('/panels/today');
      expect(todayRes.status).toBe(404);

      const connectionsRes = await user.get('/connections');
      expect(connectionsRes.status).toBe(404);

      const providersRes = await user.get('/connections/providers');
      expect(providersRes.status).toBe(404);

      const startRes = await user.get('/connections/google/start');
      expect(startRes.status).toBe(404);
    });
  });

  describe('GET /connections/providers', () => {
    beforeAll(async () => {
      await setGlobalFlag(harness.db, 'panels.today', true);
      await setGlobalFlag(harness.db, 'panels.google_calendar', true);
      await setGlobalFlag(harness.db, 'panels.google_mail', false);
      await setGlobalFlag(harness.db, 'panels.microsoft', false);
      await setGlobalFlag(harness.db, 'panels.standards', false);
    });

    it('reflects flags and lists google mail only when panels.google_mail is on', async () => {
      const user = await harness.asUser('providers-flags@test.com');
      const res = await user.get('/connections/providers');
      expect(res.status).toBe(200);

      const body = (await res.json()) as {
        providers: Array<{ id: string; capabilities: string[] }>;
      };
      const providers = body.providers;

      // With panels.google_calendar on and panels.google_mail off, google should have only calendar
      const googleProvider = providers.find((p) => p.id === 'google');
      expect(googleProvider).toBeDefined();
      expect(googleProvider!.capabilities).toContain('calendar');
      expect(googleProvider!.capabilities).not.toContain('mail');

      // Microsoft and standards are off, so absent
      expect(providers.find((p) => p.id === 'microsoft')).toBeUndefined();
      expect(providers.find((p) => p.id === 'standards')).toBeUndefined();
    });

    it('includes google mail when panels.google_mail is on', async () => {
      await setGlobalFlag(harness.db, 'panels.google_mail', true);
      const user = await harness.asUser('providers-google-mail@test.com');
      const res = await user.get('/connections/providers');
      expect(res.status).toBe(200);

      const body = (await res.json()) as {
        providers: Array<{ id: string; capabilities: string[] }>;
      };
      const googleProvider = body.providers.find((p) => p.id === 'google');
      expect(googleProvider!.capabilities).toContain('calendar');
      expect(googleProvider!.capabilities).toContain('mail');
    });

    it('response has no enabled field', async () => {
      const user = await harness.asUser('providers-no-enabled@test.com');
      const res = await user.get('/connections/providers');
      expect(res.status).toBe(200);

      const body = (await res.json()) as { providers: Array<Record<string, unknown>> };
      body.providers.forEach((provider) => {
        expect(provider).not.toHaveProperty('enabled');
      });
    });
  });

  describe('GET /connections/:provider/start', () => {
    beforeAll(async () => {
      await setGlobalFlag(harness.db, 'panels.today', true);
      await setGlobalFlag(harness.db, 'panels.google_calendar', true);
      await setGlobalFlag(harness.db, 'panels.microsoft', true);
    });

    it('sets state cookie and 302s to provider consent URL with PKCE and R6 scopes for calendar', async () => {
      const user = await harness.asUser('oauth-start-calendar@test.com');
      const res = await user.get('/connections/google/start?capabilities=calendar');

      expect(res.status).toBe(302);
      expect(res.headers.get('set-cookie')).toMatch(/desk_.*_oauth_state/);

      const location = res.headers.get('location');
      expect(location).toBeTruthy();
      expect(location).toContain('https://accounts.google.com');
      expect(location).toContain('code_challenge');
      expect(location).toContain('scope=');
      // R6 scope for calendar: https://www.googleapis.com/auth/calendar.readonly
      expect(location).toContain('calendar.readonly');
    });

    it('sets state cookie and 302s to provider consent URL with PKCE and R6 scopes for mail', async () => {
      await setGlobalFlag(harness.db, 'panels.google_mail', true);
      const user = await harness.asUser('oauth-start-mail@test.com');
      const res = await user.get('/connections/google/start?capabilities=mail');

      expect(res.status).toBe(302);
      expect(res.headers.get('set-cookie')).toMatch(/desk_.*_oauth_state/);

      const location = res.headers.get('location');
      expect(location).toBeTruthy();
      expect(location).toContain('code_challenge');
      // R6 scope for mail: https://www.googleapis.com/auth/gmail.readonly
      expect(location).toContain('gmail.readonly');
    });

    it('refuses with 409 limit_reached at ten accounts', async () => {
      const user = await harness.asUser('oauth-limit@test.com');
      await seedAccounts(user.userId, 10);
      const res = await user.get('/connections/google/start?capabilities=calendar');
      expect(res.status).toBe(409);
      const body = (await res.json()) as { error: { code: string } };
      expect(body.error.code).toBe('limit_reached');
    });

    it('at ten accounts, account=<own id> is allowed and account=<not own> is refused', async () => {
      const user = await harness.asUser('oauth-add-capability@test.com');
      const [own] = await seedAccounts(user.userId, 10);
      const ok = await user.get(`/connections/google/start?capabilities=mail&account=${own}`);
      expect(ok.status).toBe(302);
      const other = await harness.asUser('oauth-add-capability-other@test.com');
      const [foreign] = await seedAccounts(other.userId, 1, 'foreign');
      const refused = await user.get(
        `/connections/google/start?capabilities=mail&account=${foreign}`,
      );
      expect(refused.status).toBe(409);
    });
  });

  describe('GET /connections/:provider/callback', () => {
    beforeAll(async () => {
      await setGlobalFlag(harness.db, 'panels.today', true);
      await setGlobalFlag(harness.db, 'panels.google_calendar', true);
      await setGlobalFlag(harness.db, 'panels.microsoft', true);
    });

    /** Runs /connections/:provider/start to get a valid state+code_challenge cookie,
     * then hits /callback with it, optionally stubbing the token endpoint. */
    async function runCallback(
      user: Awaited<ReturnType<typeof harness.asUser>>,
      provider: 'google' | 'microsoft',
      capabilities: string,
      tokenResponse: Record<string, unknown>,
      extraQuery = '',
    ): Promise<Response> {
      const startRes = await user.get(
        `/connections/${provider}/start?capabilities=${capabilities}${extraQuery}`,
      );
      expect(startRes.status).toBe(302);
      const setCookie = startRes.headers.get('set-cookie');
      if (!setCookie) throw new Error(`expected /connections/${provider}/start to set a cookie`);

      const location = new URL(startRes.headers.get('location')!);
      const state = location.searchParams.get('state')!;

      const tokenEndpoint =
        provider === 'google' ? GOOGLE_TOKEN_ENDPOINT : MICROSOFT_TOKEN_ENDPOINT;

      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: Parameters<typeof fetch>[0]) => {
          const url = String(input instanceof Request ? input.url : input);
          if (url === tokenEndpoint) {
            return new Response(JSON.stringify(tokenResponse), {
              status: 200,
              headers: { 'content-type': 'application/json' },
            });
          }
          throw new Error(`unexpected fetch in test: ${url}`);
        }) as unknown as typeof fetch,
      );

      return harness.app.request(
        `/connections/${provider}/callback?code=fake-code&state=${state}`,
        { headers: { cookie: `${SESSION_COOKIE}=${user.sessionToken}; ${statePair(setCookie)}` } },
      );
    }

    it('derives capabilities from the scopes actually granted', async () => {
      const user = await harness.asUser('oauth-callback-scopes@test.com');
      const res = await runCallback(user, 'google', 'calendar,mail', {
        access_token: 'fake-access',
        refresh_token: 'fake-refresh',
        id_token: fakeIdToken('scopes@example.com'),
        scope: 'https://www.googleapis.com/auth/calendar.readonly',
        // Only calendar granted, not mail
      });

      // Should redirect to settings with connected account
      expect(res.status).toBe(302);
      const location = res.headers.get('location');
      expect(location).toContain('/settings/connections');
      expect(location).toContain('connected=');
    });

    it('no granted scope redirects with error=scope_denied and creates no row', async () => {
      const user = await harness.asUser('oauth-callback-no-scope@test.com');
      const res = await runCallback(user, 'google', 'calendar', {
        access_token: 'fake-access',
        refresh_token: 'fake-refresh',
        id_token: fakeIdToken('noscope@example.com'),
        scope: '', // No scopes granted
      });

      expect(res.status).toBe(302);
      const location = res.headers.get('location');
      expect(location).toContain('error=scope_denied');
    });

    it('new address at ten accounts redirects with error=limit_reached', async () => {
      const user = await harness.asUser('oauth-callback-limit@test.com');
      await seedAccounts(user.userId, 9);
      // Nine rows, so start is allowed; a tenth lands before the callback, which must then refuse
      // the new address rather than create an eleventh row.
      const startRes = await user.get('/connections/google/start?capabilities=calendar');
      expect(startRes.status).toBe(302);
      await seedAccounts(user.userId, 1, 'late');
      const setCookie = startRes.headers.get('set-cookie')!;
      const state = new URL(startRes.headers.get('location')!).searchParams.get('state')!;
      vi.stubGlobal(
        'fetch',
        vi.fn(
          async () =>
            new Response(
              JSON.stringify({
                access_token: 'fake-access',
                refresh_token: 'fake-refresh',
                id_token: fakeIdToken('eleventh@example.com'),
                scope: 'https://www.googleapis.com/auth/calendar.readonly',
              }),
              { status: 200, headers: { 'content-type': 'application/json' } },
            ),
        ) as unknown as typeof fetch,
      );
      const res = await harness.app.request(
        `/connections/google/callback?code=fake-code&state=${state}`,
        { headers: { cookie: `${SESSION_COOKIE}=${user.sessionToken}; ${statePair(setCookie)}` } },
      );
      expect(res.status).toBe(302);
      expect(res.headers.get('location')).toContain('error=limit_reached');
      expect(await accountCount(user.userId)).toBe(10);
    });

    it('account state whose address differs redirects with error=account_mismatch', async () => {
      const user = await harness.asUser('oauth-callback-mismatch@test.com');
      const [own] = await seedAccounts(user.userId, 1, 'owned');
      const res = await runCallback(
        user,
        'google',
        'mail',
        {
          access_token: 'fake-access',
          refresh_token: 'fake-refresh',
          id_token: fakeIdToken('someone-else@example.com'),
          scope: 'https://www.googleapis.com/auth/gmail.readonly',
        },
        `&account=${own}`,
      );
      expect(res.status).toBe(302);
      expect(res.headers.get('location')).toContain('error=account_mismatch');
      expect(await accountCount(user.userId)).toBe(1);
    });

    it('a token response without an id_token redirects with error=scope_denied', async () => {
      const user = await harness.asUser('oauth-callback-noid@test.com');
      const res = await runCallback(user, 'google', 'calendar', {
        access_token: 'fake-access',
        refresh_token: 'fake-refresh',
        scope: 'https://www.googleapis.com/auth/calendar.readonly',
      });
      expect(res.status).toBe(302);
      expect(res.headers.get('location')).toContain('error=scope_denied');
      expect(await accountCount(user.userId)).toBe(0);
    });

    it('a token response without refresh_token redirects with error=provider_unreachable and creates no row', async () => {
      const user = await harness.asUser('oauth-callback-no-refresh@test.com');
      const res = await runCallback(user, 'google', 'calendar', {
        access_token: 'fake-access',
        id_token: fakeIdToken('norefresh@example.com'),
        scope: 'https://www.googleapis.com/auth/calendar.readonly',
      });

      expect(res.status).toBe(302);
      const location = res.headers.get('location');
      expect(location).toBe('/settings/connections?error=provider_unreachable');
      expect(await accountCount(user.userId)).toBe(0);
    });

    it('success redirects to /settings/connections?connected=<id>', async () => {
      const user = await harness.asUser('oauth-callback-success@test.com');
      const res = await runCallback(user, 'google', 'calendar', {
        access_token: 'fake-access',
        scope: 'https://www.googleapis.com/auth/calendar.readonly',
        id_token: fakeIdToken('test@example.com'),
        refresh_token: 'fake-refresh',
      });

      expect(res.status).toBe(302);
      const location = res.headers.get('location');
      expect(location).toContain('/settings/connections');
      expect(location).toContain('connected=');
    });

    it('creates a row with sealed credential', async () => {
      const user = await harness.asUser('oauth-callback-sealed@test.com');
      const res = await runCallback(user, 'google', 'calendar', {
        access_token: 'fake-access-token-12345',
        scope: 'https://www.googleapis.com/auth/calendar.readonly',
        id_token: fakeIdToken('sealed@example.com'),
        refresh_token: 'rt-google-1',
      });

      expect(res.status).toBe(302);
      const location = res.headers.get('location');
      const accountId = location?.match(/connected=([^&]+)/)?.[1];
      expect(accountId).toBeTruthy();

      const account = await harness.db.query.connectedAccounts.findFirst({
        where: (table, { eq }) => eq(table.id, accountId!),
      });
      const box = createSecretBox(TEST_SECRET_BOX_KEY);
      expect(await openCredential(box, account!.credentialEnc)).toEqual({
        refreshToken: 'rt-google-1',
      });
    });

    it('existing (provider, address) merges capabilities instead of creating a second row', async () => {
      const user = await harness.asUser('oauth-callback-merge@test.com');
      // First callback with calendar
      const res1 = await runCallback(user, 'google', 'calendar', {
        access_token: 'access-1',
        scope: 'https://www.googleapis.com/auth/calendar.readonly',
        id_token: fakeIdToken('merge@example.com'),
        refresh_token: 'fake-refresh',
      });
      expect(res1.status).toBe(302);

      // Second callback with mail for the same address
      const res2 = await runCallback(user, 'google', 'mail', {
        access_token: 'access-2',
        scope: 'https://www.googleapis.com/auth/gmail.readonly',
        id_token: fakeIdToken('merge@example.com'),
        refresh_token: 'fake-refresh',
      });
      expect(res2.status).toBe(302);

      // Should be one row with both capabilities, not two rows
    });

    it('enqueues panels.refresh job on success', async () => {
      const user = await harness.asUser('oauth-callback-job@test.com');
      const res = await runCallback(user, 'google', 'calendar', {
        access_token: 'fake-access',
        scope: 'https://www.googleapis.com/auth/calendar.readonly',
        id_token: fakeIdToken('job@example.com'),
        refresh_token: 'fake-refresh',
      });

      expect(res.status).toBe(302);
      // Implementation will verify the job is enqueued
    });
  });

  describe('GET /connections', () => {
    beforeAll(async () => {
      await setGlobalFlag(harness.db, 'panels.today', true);
    });

    it('returns shape from contracts/api.md', async () => {
      const user = await harness.asUser('connections-shape@test.com');
      const res = await user.get('/connections');

      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        accounts: Array<{
          id: string;
          provider: string;
          address: string;
          label: string;
          colour: string;
          capabilities: string[];
          grantedScopes: string[];
          status: string;
          pausedAt: string | null;
          lastRefreshAt: string | null;
          lastError: string | null;
          calendars: Array<{ id: string; name: string; isPrimary: boolean; enabled: boolean }>;
        }>;
        limit: number;
      };

      expect(body.accounts).toBeDefined();
      expect(body.limit).toBe(10);
    });

    it('returns empty accounts when no connections exist', async () => {
      const user = await harness.asUser('connections-empty@test.com');
      const res = await user.get('/connections');

      expect(res.status).toBe(200);
      const body = (await res.json()) as { accounts: Array<unknown>; limit: number };
      expect(body.accounts).toEqual([]);
      expect(body.limit).toBe(10);
    });
  });

  describe('GET /panels/today', () => {
    beforeAll(async () => {
      await setGlobalFlag(harness.db, 'panels.today', true);
    });

    it('returns empty arrays with no accounts', async () => {
      const user = await harness.asUser('today-empty@test.com');
      const res = await user.get('/panels/today');

      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        days: Array<unknown>;
        messages: Array<unknown>;
        accounts: Array<unknown>;
        generatedAt: string;
      };
      expect(body.days).toEqual([]);
      expect(body.messages).toEqual([]);
      expect(body.accounts).toEqual([]);
      expect(body.generatedAt).toBeTruthy();
    });

    // /today is the web page; node.ts serves the SPA for any path the API doesn't claim, so the
    // API answering /today turned a deep link or reload into raw JSON.
    it('leaves /today to the web page', async () => {
      const user = await harness.asUser('today-page-path@test.com');
      expect((await user.get('/today')).status).toBe(404);
    });
  });
});

describe('GET /connections/:id/calendars (T035)', () => {
  let harness: Harness;

  beforeAll(async () => {
    harness = await startHarness(undefined, {
      calendarSources: {
        google: {
          // T084: a credential sealed with refreshToken 'revoked' simulates the provider
          // revoking access, without spinning up a second Postgres harness for one test.
          async listCalendars(cred) {
            if ((cred as { refreshToken?: string }).refreshToken === 'revoked') {
              throw new AuthError('access revoked');
            }
            return [
              { id: 'cal-primary', name: 'Primary', isPrimary: true },
              { id: 'cal-other', name: 'Other', isPrimary: false },
            ];
          },
          async fetchWindow() {
            return { events: [], full: true };
          },
          async verify() {},
          async revoke() {},
        },
      },
    });
    await setGlobalFlag(harness.db, 'panels.today', true);
    await setGlobalFlag(harness.db, 'panels.google_calendar', true);
  }, 120_000);

  afterAll(async () => {
    await harness.close();
  });

  async function insertAccount(userId: string, refreshToken = 'rt') {
    const box = createSecretBox(TEST_SECRET_BOX_KEY);
    const credentialEnc = await sealCredential(box, { refreshToken });
    const [account] = await harness.db
      .insert(connectedAccounts)
      .values({
        userId,
        provider: 'google',
        address: 'calendars-route@example.com',
        label: 'Acct',
        colour: 'teal',
        capabilities: ['calendar'],
        grantedScopes: ['calendar.readonly'],
        credentialEnc,
        status: 'connected',
        nextRefreshAt: new Date(),
      })
      .returning();
    if (!account) throw new Error('failed to insert account');
    return account.id;
  }

  it('upserts calendars, preserving an existing enabled flag and adding a new calendar', async () => {
    const user = await harness.asUser('calendars-route@test.com');
    const accountId = await insertAccount(user.userId);

    // Pre-seed cal-primary as disabled — the route must preserve that, not reset it to enabled.
    await harness.db.execute(sql`
      INSERT INTO account_calendars
        (user_id, account_id, provider_calendar_id, name, is_primary, enabled)
      VALUES (${user.userId}, ${accountId}, 'cal-primary', 'Primary (old name)', true, false)`);

    const res = await user.get(`/connections/${accountId}/calendars`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      calendars: Array<{ id: string; name: string; isPrimary: boolean; enabled: boolean }>;
    };

    const primary = body.calendars.find((c) => c.name === 'Primary');
    const other = body.calendars.find((c) => c.name === 'Other');
    expect(body.calendars).toHaveLength(2);
    expect(primary).toMatchObject({ isPrimary: true, enabled: false });
    expect(other).toMatchObject({ isPrimary: false, enabled: false });

    const rows = (await harness.db.execute(
      sql`SELECT provider_calendar_id, enabled FROM account_calendars WHERE account_id = ${accountId} ORDER BY provider_calendar_id`,
    )) as unknown as { provider_calendar_id: string; enabled: boolean }[];
    expect(rows).toEqual([
      { provider_calendar_id: 'cal-other', enabled: false },
      { provider_calendar_id: 'cal-primary', enabled: false },
    ]);
  });

  // T084: pins the AuthError → reconnect_needed/access_revoked path this route already has
  // (apps/api/src/routes/connections.ts), so a future change can't silently drop it.
  it('answers 409 conflict and marks the account reconnect_needed/access_revoked when the provider throws AuthError', async () => {
    const user = await harness.asUser('calendars-revoked@test.com');
    const accountId = await insertAccount(user.userId, 'revoked');

    const res = await user.get(`/connections/${accountId}/calendars`);
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('conflict');

    const [row] = await harness.db
      .select({ status: connectedAccounts.status, lastError: connectedAccounts.lastError })
      .from(connectedAccounts)
      .where(eq(connectedAccounts.id, accountId));
    expect(row).toEqual({ status: 'reconnect_needed', lastError: 'access_revoked' });
  });
});
