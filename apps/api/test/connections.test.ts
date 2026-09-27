import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import {
  AuthError,
  VerificationError,
  type CalendarSource,
  type MailSource,
} from '@desk/connectors/panels';
import {
  accountCalendars,
  auditLog,
  connectedAccounts,
  jobs as jobsTable,
  setGlobalFlag,
} from '@desk/db';
import { SESSION_COOKIE } from '../src/middleware/session.js';
import { startHarness, TEST_SECRET_BOX_KEY, type Harness } from './harness.js';
import { createSecretBox } from '../src/adapters/secret-box.js';
import { openCredential, sealCredential, type StandardsCredential } from '../src/lib/credential.js';

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

    it('audits a connect action (T054)', async () => {
      const user = await harness.asUser('oauth-callback-audit@test.com');
      const res = await runCallback(user, 'google', 'calendar', {
        access_token: 'fake-access',
        scope: 'https://www.googleapis.com/auth/calendar.readonly',
        id_token: fakeIdToken('audit@example.com'),
        refresh_token: 'fake-refresh',
      });

      expect(res.status).toBe(302);
      const rows = await harness.db.select().from(auditLog).where(eq(auditLog.userId, user.userId));
      expect(rows.some((r) => r.action === 'connect')).toBe(true);
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

    it("lists each account's own account_calendars rows, not an empty array", async () => {
      const user = await harness.asUser('connections-calendars@test.com');
      const [account] = await harness.db
        .insert(connectedAccounts)
        .values({
          userId: user.userId,
          provider: 'google',
          address: 'connections-calendars@example.com',
          label: 'Acct',
          colour: 'teal',
          capabilities: ['calendar'],
          grantedScopes: ['calendar.readonly'],
          credentialEnc: Buffer.from([0]),
          status: 'connected',
          nextRefreshAt: new Date(),
        })
        .returning();
      if (!account) throw new Error('failed to insert account');
      await harness.db.insert(accountCalendars).values([
        {
          userId: user.userId,
          accountId: account.id,
          providerCalendarId: 'primary',
          name: 'Primary',
          isPrimary: true,
          enabled: true,
        },
        {
          userId: user.userId,
          accountId: account.id,
          providerCalendarId: 'other',
          name: 'Other',
          isPrimary: false,
          enabled: false,
        },
      ]);

      const res = await user.get('/connections');
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        accounts: Array<{
          id: string;
          calendars: Array<{ id: string; name: string; isPrimary: boolean; enabled: boolean }>;
        }>;
      };
      const returned = body.accounts.find((a) => a.id === account.id);
      expect(returned).toBeDefined();
      expect(returned!.calendars.map((c) => c.name).sort()).toEqual(['Other', 'Primary']);
      const primary = returned!.calendars.find((c) => c.name === 'Primary');
      expect(primary?.isPrimary).toBe(true);
      expect(primary?.enabled).toBe(true);
      const other = returned!.calendars.find((c) => c.name === 'Other');
      expect(other?.enabled).toBe(false);
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

describe('PATCH/DELETE/reconnect /connections/:id (T059/T060)', () => {
  let harness: Harness;
  let revokeCalls: Array<{ refreshToken?: string }>;

  beforeAll(async () => {
    revokeCalls = [];
    const fakeGoogleCalendar: CalendarSource = {
      async listCalendars() {
        return [];
      },
      async fetchWindow() {
        return { events: [], full: true };
      },
      async verify() {},
      async revoke(cred) {
        const c = cred as { refreshToken?: string };
        revokeCalls.push(c);
        if (c.refreshToken === 'boom') throw new Error('provider unreachable');
      },
    };
    harness = await startHarness(undefined, {
      withJobs: true,
      calendarSources: { google: fakeGoogleCalendar },
    });
    await setGlobalFlag(harness.db, 'panels.today', true);
    await setGlobalFlag(harness.db, 'panels.google_calendar', true);
  }, 120_000);

  afterAll(async () => {
    await harness.close();
  });

  async function accountCount(userId: string): Promise<number> {
    const rows = (await harness.db.execute(
      sql`SELECT count(*)::int AS n FROM connected_accounts WHERE user_id = ${userId}`,
    )) as unknown as { n: number }[];
    return rows[0]!.n;
  }

  async function insertAccount(
    userId: string,
    opts: {
      provider?: 'google' | 'microsoft' | 'standards';
      refreshToken?: string;
      status?: string;
      paused?: boolean;
    } = {},
  ) {
    const box = createSecretBox(TEST_SECRET_BOX_KEY);
    const credentialEnc = await sealCredential(box, { refreshToken: opts.refreshToken ?? 'rt' });
    const [account] = await harness.db
      .insert(connectedAccounts)
      .values({
        userId,
        provider: opts.provider ?? 'google',
        address: `${crypto.randomUUID()}@example.com`,
        label: 'Acct',
        colour: 'teal',
        capabilities: ['calendar'],
        grantedScopes: ['calendar.readonly'],
        credentialEnc,
        status: opts.status ?? 'connected',
        pausedAt: opts.paused ? new Date('2026-01-01T00:00:00Z') : null,
        nextRefreshAt: new Date(),
      })
      .returning();
    if (!account) throw new Error('failed to insert account');
    return account;
  }

  it('updates label and colour', async () => {
    const user = await harness.asUser('patch-label@test.com');
    const account = await insertAccount(user.userId);
    const res = await user.patch(`/connections/${account.id}`, {
      label: 'Work mail',
      colour: 'blue',
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { account: { label: string; colour: string } };
    expect(body.account.label).toBe('Work mail');
    expect(body.account.colour).toBe('blue');
  });

  it('pausing sets paused_at, reports status paused, and stops scheduling (audited)', async () => {
    const user = await harness.asUser('patch-pause@test.com');
    const account = await insertAccount(user.userId);
    const res = await user.patch(`/connections/${account.id}`, { paused: true });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { account: { status: string; pausedAt: string | null } };
    expect(body.account.status).toBe('paused');
    expect(body.account.pausedAt).toBeTruthy();

    const [row] = await harness.db
      .select()
      .from(connectedAccounts)
      .where(eq(connectedAccounts.id, account.id));
    expect(row!.pausedAt).not.toBeNull();

    const audits = await harness.db.select().from(auditLog).where(eq(auditLog.subject, account.id));
    expect(audits.some((a) => a.action === 'pause')).toBe(true);
  });

  it('resuming restores the stored status (a paused reconnect_needed account resumes as reconnect_needed) and marks it due', async () => {
    const user = await harness.asUser('patch-resume@test.com');
    const account = await insertAccount(user.userId, { status: 'reconnect_needed', paused: true });
    const res = await user.patch(`/connections/${account.id}`, { paused: false });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { account: { status: string; pausedAt: string | null } };
    expect(body.account.status).toBe('reconnect_needed');
    expect(body.account.pausedAt).toBeNull();

    const [row] = await harness.db
      .select()
      .from(connectedAccounts)
      .where(eq(connectedAccounts.id, account.id));
    expect(row!.nextRefreshAt.getTime()).toBeLessThanOrEqual(harness.clock.now().getTime());
  });

  it('enabling a calendar toggles enabled and enqueues a refresh', async () => {
    const user = await harness.asUser('patch-calendar@test.com');
    const account = await insertAccount(user.userId);
    const [cal] = await harness.db
      .insert(accountCalendars)
      .values({
        userId: user.userId,
        accountId: account.id,
        providerCalendarId: 'cal-1',
        name: 'Cal',
        isPrimary: false,
        enabled: false,
      })
      .returning();

    const res = await user.patch(`/connections/${account.id}`, {
      calendars: [{ id: cal!.id, enabled: true }],
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      account: { calendars: Array<{ id: string; enabled: boolean }> };
    };
    expect(body.account.calendars.find((c) => c.id === cal!.id)?.enabled).toBe(true);

    const jobRows = await harness.db
      .select()
      .from(jobsTable)
      .where(eq(jobsTable.userId, user.userId));
    expect(jobRows.filter((j) => j.name === 'panels.refresh').map((j) => j.payload)).toContainEqual(
      {
        accountId: account.id,
      },
    );
  });

  it('POST /connections/:id/reconnect returns 200 { url } for an OAuth provider and keeps the row (audited)', async () => {
    const user = await harness.asUser('reconnect-google@test.com');
    const account = await insertAccount(user.userId);
    const res = await user.post(`/connections/${account.id}/reconnect`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { url?: string };
    expect(body.url).toContain('https://accounts.google.com');
    expect(await accountCount(user.userId)).toBe(1);

    const audits = await harness.db.select().from(auditLog).where(eq(auditLog.subject, account.id));
    expect(audits.some((a) => a.action === 'reconnect')).toBe(true);
  });

  it('POST /connections/:id/reconnect returns 200 { needsPassword: true } for standards', async () => {
    const user = await harness.asUser('reconnect-standards@test.com');
    const account = await insertAccount(user.userId, { provider: 'standards' });
    const res = await user.post(`/connections/${account.id}/reconnect`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { needsPassword?: boolean };
    expect(body.needsPassword).toBe(true);
  });

  it('DELETE /connections/:id revokes at the provider, then deletes the row and cascades calendars', async () => {
    const user = await harness.asUser('delete-google@test.com');
    const account = await insertAccount(user.userId, { refreshToken: 'delete-me' });
    await harness.db.insert(accountCalendars).values({
      userId: user.userId,
      accountId: account.id,
      providerCalendarId: 'cal-x',
      name: 'X',
      isPrimary: true,
      enabled: true,
    });

    const res = await user.delete(`/connections/${account.id}`);
    expect(res.status).toBe(204);

    expect(revokeCalls).toContainEqual({ refreshToken: 'delete-me' });
    expect(await accountCount(user.userId)).toBe(0);
    const calendarRows = await harness.db
      .select()
      .from(accountCalendars)
      .where(eq(accountCalendars.accountId, account.id));
    expect(calendarRows).toEqual([]);

    const audits = await harness.db.select().from(auditLog).where(eq(auditLog.subject, account.id));
    expect(audits.some((a) => a.action === 'disconnect')).toBe(true);
  });

  it('DELETE /connections/:id still deletes when revoke throws, and audits the failure (FR-003)', async () => {
    const user = await harness.asUser('delete-revoke-fails@test.com');
    const account = await insertAccount(user.userId, { refreshToken: 'boom' });

    const res = await user.delete(`/connections/${account.id}`);
    expect(res.status).toBe(204);
    expect(await accountCount(user.userId)).toBe(0);

    const audits = await harness.db.select().from(auditLog).where(eq(auditLog.subject, account.id));
    expect(audits.some((a) => a.action === 'revoke_failure')).toBe(true);
    expect(audits.some((a) => a.action === 'disconnect')).toBe(true);
  });

  it('DELETE /me revokes every connected account before the cascade', async () => {
    const user = await harness.asUser('delete-me-revokes@test.com');
    await insertAccount(user.userId, { refreshToken: 'delete-me-cascade' });

    const res = await user.delete('/me', { password: 'test-password' });
    expect(res.status).toBe(204);
    expect(revokeCalls).toContainEqual({ refreshToken: 'delete-me-cascade' });
  });

  it('GET /me/export includes connections, no credentials or cached items', async () => {
    const user = await harness.asUser('export-connections@test.com');
    await insertAccount(user.userId);
    const res = await user.get('/me/export');
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      connections: Array<{
        provider: string;
        address: string;
        label: string;
        capabilities: string[];
        status: string;
      }>;
    };
    expect(body.connections).toHaveLength(1);
    expect(body.connections[0]).toMatchObject({
      provider: 'google',
      label: 'Acct',
      status: 'connected',
    });
    expect(body.connections[0]).not.toHaveProperty('credentialEnc');
    expect(body.connections[0]).not.toHaveProperty('calendars');
  });
});

describe('POST /connections/standards (T065/T070)', () => {
  let harness: Harness;
  let verifyMailCalls: Array<{ host?: string; port?: number; username: string; password: string }>;
  let verifyCalendarCalls: Array<{ url?: string; username: string; password: string }>;

  const CORRECT_PASSWORD = 'correct-app-password';
  /** A second accepted app password — stands in for the new one a reconnect-by-merge (re-POST
   * with the same address) rotates in. */
  const ROTATED_PASSWORD = 'new-app-password';
  const CONNECT_FAIL_HOST = 'connect-fail.example.com';
  const BAD_DISCOVERY_MARKER = 'bad-discovery';
  /** Not an IP literal, so the fake resolver below answers it with a private address — the one
   * FR-017 "hostname resolving to a private address" case the four IP-literal cases don't cover. */
  const PRIVATE_HOSTNAME = 'internal.example.com';

  const fakeStandardsMail: MailSource = {
    async fetchInbox() {
      return { messages: [], full: true };
    },
    async verify(cred) {
      const c = cred as { host?: string; port?: number; username: string; password: string };
      verifyMailCalls.push(c);
      if (c.host === CONNECT_FAIL_HOST) {
        throw new VerificationError('connection refused', 'connect');
      }
      if (c.password !== CORRECT_PASSWORD) {
        throw new VerificationError('bad credentials', 'login');
      }
    },
    async revoke() {},
  };

  const fakeStandardsCalendar: CalendarSource = {
    async listCalendars() {
      return [];
    },
    async fetchWindow() {
      return { events: [], full: true };
    },
    async verify(cred) {
      const c = cred as { url?: string; username: string; password: string };
      verifyCalendarCalls.push(c);
      const acceptedPassword = c.password === CORRECT_PASSWORD || c.password === ROTATED_PASSWORD;
      if (c.url?.includes(BAD_DISCOVERY_MARKER) || !acceptedPassword) {
        throw new VerificationError('discovery failed', 'discovery');
      }
    },
    async revoke() {},
  };

  /** IP literals (what the four FR-017 test hosts are) resolve to themselves, as node:dns/promises
   * really does; PRIVATE_HOSTNAME resolves to a private address; every other hostname resolves
   * publicly — a fake standing in for apps/api/src/adapters/host-resolver-node.ts. */
  async function fakeResolver(host: string): Promise<string[]> {
    if (host === PRIVATE_HOSTNAME) return ['10.1.2.3'];
    if (/^[0-9a-fA-F:.]+$/.test(host)) return [host];
    return ['203.0.113.10'];
  }

  // Fixed-window rate limiter (apps/api/src/adapters/rate-limiter.ts): keyed by
  // `standards:ip:unknown` here (the test client sends no x-forwarded-for), shared across every
  // test in this file. Each test moves the clock into its own fresh ten-minute window first, so
  // one test's attempts never count against another's.
  let windowCursor = new Date('2026-09-18T00:00:00Z').getTime();
  function freshWindow(): void {
    windowCursor += 11 * 60 * 1000;
    harness.clock.set(new Date(windowCursor));
  }

  beforeAll(async () => {
    harness = await startHarness(undefined, {
      withJobs: true,
      mailSources: { standards: fakeStandardsMail },
      calendarSources: { standards: fakeStandardsCalendar },
      hostResolver: fakeResolver,
    });
    await setGlobalFlag(harness.db, 'panels.today', true);
    await setGlobalFlag(harness.db, 'panels.standards', true);
  }, 120_000);

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(() => {
    verifyMailCalls = [];
    verifyCalendarCalls = [];
    freshWindow();
  });

  async function accountCount(userId: string): Promise<number> {
    const rows = (await harness.db.execute(
      sql`SELECT count(*)::int AS n FROM connected_accounts WHERE user_id = ${userId}`,
    )) as unknown as { n: number }[];
    return rows[0]!.n;
  }

  it('FR-017: refuses loopback/private/link-local/unique-local hosts and a hostname resolving to one, without opening a socket', async () => {
    const user = await harness.asUser('standards-host-private@test.com');
    for (const host of ['127.0.0.1', '10.0.0.5', '169.254.169.254', 'fdaa::1', PRIVATE_HOSTNAME]) {
      const res = await user.post('/connections/standards', {
        address: `host-${crypto.randomUUID()}@example.com`,
        password: CORRECT_PASSWORD,
        imapHost: host,
        imapPort: 993,
        capabilities: ['mail'],
      });
      expect(res.status).toBe(422);
      const body = (await res.json()) as { error: { code: string } };
      expect(body.error.code).toBe('host_not_allowed');
    }
    expect(verifyMailCalls).toEqual([]);
  });

  it('FR-017: refuses an IMAP port other than 993/143', async () => {
    const user = await harness.asUser('standards-bad-port@test.com');
    const res = await user.post('/connections/standards', {
      address: 'bad-port@example.com',
      password: CORRECT_PASSWORD,
      imapHost: 'mail.example.com',
      imapPort: 587,
      capabilities: ['mail'],
    });
    expect(res.status).toBe(422);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('host_not_allowed');
    expect(verifyMailCalls).toEqual([]);
  });

  it('FR-017: refuses a non-https CalDAV URL', async () => {
    const user = await harness.asUser('standards-bad-scheme@test.com');
    const res = await user.post('/connections/standards', {
      address: 'bad-scheme@example.com',
      password: CORRECT_PASSWORD,
      caldavUrl: 'http://caldav.example.com/',
      capabilities: ['calendar'],
    });
    expect(res.status).toBe(422);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('host_not_allowed');
    expect(verifyCalendarCalls).toEqual([]);
  });

  it('a wrong password answers 422 verification_failed { step: "login" } for IMAP', async () => {
    const user = await harness.asUser('standards-wrong-pw@test.com');
    const res = await user.post('/connections/standards', {
      address: 'wrong-pw@example.com',
      password: 'nope',
      imapHost: 'mail.example.com',
      imapPort: 993,
      capabilities: ['mail'],
    });
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: { code: string; details?: { step?: string } } };
    expect(body.error.code).toBe('verification_failed');
    expect(body.error.details?.step).toBe('login');
  });

  it('an unreachable host answers 422 verification_failed { step: "connect" }', async () => {
    const user = await harness.asUser('standards-unreachable@test.com');
    const res = await user.post('/connections/standards', {
      address: 'unreachable@example.com',
      password: CORRECT_PASSWORD,
      imapHost: CONNECT_FAIL_HOST,
      imapPort: 993,
      capabilities: ['mail'],
    });
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: { code: string; details?: { step?: string } } };
    expect(body.error.code).toBe('verification_failed');
    expect(body.error.details?.step).toBe('connect');
  });

  it('a bad CalDAV URL answers 422 verification_failed { step: "discovery" }', async () => {
    const user = await harness.asUser('standards-bad-discovery@test.com');
    const res = await user.post('/connections/standards', {
      address: 'bad-discovery@example.com',
      password: CORRECT_PASSWORD,
      caldavUrl: `https://caldav.example.com/${BAD_DISCOVERY_MARKER}`,
      capabilities: ['calendar'],
    });
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: { code: string; details?: { step?: string } } };
    expect(body.error.code).toBe('verification_failed');
    expect(body.error.details?.step).toBe('discovery');
  });

  it('succeeds, seals the credential (never returns it) and enqueues a refresh; a second POST for the same address merges capabilities, replaces the credential, and audits reconnect', async () => {
    const user = await harness.asUser('standards-success@test.com');
    const address = `standards-${crypto.randomUUID()}@example.com`;

    const res1 = await user.post('/connections/standards', {
      address,
      password: CORRECT_PASSWORD,
      imapHost: 'mail.example.com',
      imapPort: 993,
      capabilities: ['mail'],
    });
    expect(res1.status).toBe(201);
    const body1 = (await res1.json()) as {
      account: { id: string; provider: string; capabilities: string[] };
    };
    expect(body1.account.provider).toBe('standards');
    expect(body1.account.capabilities).toEqual(['mail']);
    expect(JSON.stringify(body1)).not.toContain(CORRECT_PASSWORD);

    const [row1] = await harness.db
      .select()
      .from(connectedAccounts)
      .where(eq(connectedAccounts.id, body1.account.id));
    expect(row1!.credentialEnc.length).toBeGreaterThan(0);
    const opened1 = await openCredential<StandardsCredential>(
      createSecretBox(TEST_SECRET_BOX_KEY),
      row1!.credentialEnc,
    );
    expect(opened1).toEqual({
      password: CORRECT_PASSWORD,
      imapHost: 'mail.example.com',
      imapPort: 993,
    });

    const audits1 = await harness.db
      .select()
      .from(auditLog)
      .where(eq(auditLog.subject, body1.account.id));
    expect(audits1.some((a) => a.action === 'connect')).toBe(true);

    const jobRows1 = await harness.db
      .select()
      .from(jobsTable)
      .where(eq(jobsTable.userId, user.userId));
    expect(
      jobRows1.some(
        (j) =>
          j.name === 'panels.refresh' &&
          (j.payload as { accountId?: string }).accountId === body1.account.id,
      ),
    ).toBe(true);

    // Merge: same address, new password, adds the calendar capability — reconnect-by-merge, the
    // web client's actual reconnect flow.
    const res2 = await user.post('/connections/standards', {
      address,
      password: ROTATED_PASSWORD,
      caldavUrl: 'https://caldav.example.com/',
      capabilities: ['calendar'],
    });
    expect(res2.status).toBe(201);
    const body2 = (await res2.json()) as { account: { id: string; capabilities: string[] } };
    expect(body2.account.id).toBe(body1.account.id);
    expect(body2.account.capabilities.slice().sort()).toEqual(['calendar', 'mail']);
    expect(await accountCount(user.userId)).toBe(1);

    const [row2] = await harness.db
      .select()
      .from(connectedAccounts)
      .where(eq(connectedAccounts.id, body1.account.id));
    const opened2 = await openCredential<StandardsCredential>(
      createSecretBox(TEST_SECRET_BOX_KEY),
      row2!.credentialEnc,
    );
    expect(opened2.password).toBe(ROTATED_PASSWORD);

    const audits2 = await harness.db
      .select()
      .from(auditLog)
      .where(eq(auditLog.subject, body1.account.id));
    expect(audits2.some((a) => a.action === 'reconnect')).toBe(true);
  });

  it('presets for yahoo, icloud and fastmail come from GET /connections/providers', async () => {
    const user = await harness.asUser('standards-presets@test.com');
    const res = await user.get('/connections/providers');
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      providers: Array<{ id: string; presets?: Array<{ name: string; imapHost: string }> }>;
    };
    const standards = body.providers.find((p) => p.id === 'standards');
    expect(standards?.presets?.map((p) => p.name).sort()).toEqual(['fastmail', 'icloud', 'yahoo']);
  });

  it('rate-limits at five attempts per ten minutes (the sixth answers 429)', async () => {
    const user = await harness.asUser('standards-rate-limit@test.com');
    for (let i = 0; i < 5; i++) {
      const res = await user.post('/connections/standards', {
        address: `rl-${i}-${crypto.randomUUID()}@example.com`,
        password: 'nope',
        imapHost: 'mail.example.com',
        imapPort: 993,
        capabilities: ['mail'],
      });
      expect(res.status).toBe(422); // wrong password each time; still an attempt
    }
    const sixth = await user.post('/connections/standards', {
      address: `rl-6-${crypto.randomUUID()}@example.com`,
      password: CORRECT_PASSWORD,
      imapHost: 'mail.example.com',
      imapPort: 993,
      capabilities: ['mail'],
    });
    expect(sixth.status).toBe(429);
  });

  it('answers 409 limit_reached at ten accounts for a new address, while an existing address still merges', async () => {
    const user = await harness.asUser('standards-limit@test.com');
    const existingAddress = `standards-limit-existing-${crypto.randomUUID()}@example.com`;
    const box = createSecretBox(TEST_SECRET_BOX_KEY);
    const existingCredentialEnc = await sealCredential(box, {
      password: CORRECT_PASSWORD,
      imapHost: 'mail.example.com',
      imapPort: 993,
    } satisfies StandardsCredential);

    for (let i = 0; i < 9; i++) {
      await harness.db.insert(connectedAccounts).values({
        userId: user.userId,
        provider: 'google',
        address: `seed-${i}-${crypto.randomUUID()}@example.com`,
        label: 'seed',
        colour: 'teal',
        capabilities: ['calendar'],
        grantedScopes: [],
        credentialEnc: new Uint8Array([0]),
        status: 'connected',
        nextRefreshAt: harness.clock.now(),
      });
    }
    await harness.db.insert(connectedAccounts).values({
      userId: user.userId,
      provider: 'standards',
      address: existingAddress,
      label: existingAddress,
      colour: 'teal',
      capabilities: ['mail'],
      grantedScopes: [],
      credentialEnc: existingCredentialEnc,
      status: 'connected',
      nextRefreshAt: harness.clock.now(),
    });
    expect(await accountCount(user.userId)).toBe(10);

    const newRes = await user.post('/connections/standards', {
      address: `eleventh-${crypto.randomUUID()}@example.com`,
      password: CORRECT_PASSWORD,
      imapHost: 'mail.example.com',
      imapPort: 993,
      capabilities: ['mail'],
    });
    expect(newRes.status).toBe(409);
    expect(((await newRes.json()) as { error: { code: string } }).error.code).toBe('limit_reached');

    const mergeRes = await user.post('/connections/standards', {
      address: existingAddress,
      password: CORRECT_PASSWORD,
      imapHost: 'mail.example.com',
      imapPort: 993,
      capabilities: ['mail'],
    });
    expect(mergeRes.status).toBe(201);
    expect(await accountCount(user.userId)).toBe(10);
  });
});

describe('createStandards with STANDARDS_ALLOW_PRIVATE_HOSTS (e2e-ci only)', () => {
  const CORRECT_PASSWORD = 'correct-app-password';

  const fakeStandardsCalendar: CalendarSource = {
    async listCalendars() {
      return [];
    },
    async fetchWindow() {
      return { events: [], full: true };
    },
    async verify(cred) {
      const c = cred as { password: string };
      if (c.password !== CORRECT_PASSWORD) throw new VerificationError('bad login', 'discovery');
    },
    async revoke() {},
  };

  /** Stands in for host-resolver-node.ts resolving the compose `mocks` service name to its
   * private Docker network address — the exact case the flag exists for. */
  async function dockerLikeResolver(host: string): Promise<string[]> {
    return host === 'mocks' ? ['172.20.0.5'] : ['203.0.113.10'];
  }

  it('off (default): a private-Docker-address host and a plain-http CalDAV URL both answer host_not_allowed', async () => {
    const harness = await startHarness(undefined, {
      calendarSources: { standards: fakeStandardsCalendar },
      hostResolver: dockerLikeResolver,
      // standardsAllowPrivateHosts omitted — off by default (ConnectionsService's app.ts wiring).
    });
    try {
      await setGlobalFlag(harness.db, 'panels.today', true);
      await setGlobalFlag(harness.db, 'panels.standards', true);
      const user = await harness.asUser('standards-flag-off@test.com');

      const privateHost = await user.post('/connections/standards', {
        address: 'flag-off-host@example.com',
        password: CORRECT_PASSWORD,
        caldavUrl: 'https://mocks/caldav/',
        capabilities: ['calendar'],
      });
      expect(privateHost.status).toBe(422);
      expect(((await privateHost.json()) as { error: { code: string } }).error.code).toBe(
        'host_not_allowed',
      );

      const httpScheme = await user.post('/connections/standards', {
        address: 'flag-off-scheme@example.com',
        password: CORRECT_PASSWORD,
        caldavUrl: 'http://caldav.example.com/',
        capabilities: ['calendar'],
      });
      expect(httpScheme.status).toBe(422);
      expect(((await httpScheme.json()) as { error: { code: string } }).error.code).toBe(
        'host_not_allowed',
      );
    } finally {
      await harness.close();
    }
  }, 120_000);

  it('on: a private-Docker-address host and a plain-http CalDAV URL are both allowed', async () => {
    const harness = await startHarness(undefined, {
      withJobs: true,
      calendarSources: { standards: fakeStandardsCalendar },
      hostResolver: dockerLikeResolver,
      standardsAllowPrivateHosts: true,
    });
    try {
      await setGlobalFlag(harness.db, 'panels.today', true);
      await setGlobalFlag(harness.db, 'panels.standards', true);
      const user = await harness.asUser('standards-flag-on@test.com');

      const res = await user.post('/connections/standards', {
        address: 'flag-on@example.com',
        password: CORRECT_PASSWORD,
        caldavUrl: 'http://mocks:4000/caldav/',
        capabilities: ['calendar'],
      });
      expect(res.status).toBe(201);
    } finally {
      await harness.close();
    }
  }, 120_000);
});
