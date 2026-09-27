import type { Context } from 'hono';
import { Hono } from 'hono';
import { openCredential, sealCredential } from '../lib/credential.js';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { and, eq } from 'drizzle-orm';
import type { Db } from '@desk/db';
import { accountCalendars, auditLog, connectedAccounts, resolveAllFlags } from '@desk/db';
import {
  AccountPatch,
  type AccountT,
  type CalendarT,
  type CalendarsResponseT,
  type CapabilityT,
  type ProviderIdT,
  type ProvidersResponseT,
  type ConnectionsResponseT,
  type ReconnectResponseT,
} from '@desk/contracts';
import type { AppVariables } from '../app.js';
import { requireAuth } from '../lib/require-auth.js';
import { ApiError } from '../lib/api-error.js';
import type { SecretBox } from '../adapters/secret-box.js';
import type { RateLimiter } from '../adapters/rate-limiter.js';
import type { Clock } from '../app.js';
import type { ConnectionsService } from '../services/connections.js';
import type { PanelsService } from '../services/panels.js';
import { providerRegistry } from '../services/provider-registry.js';
import { AuthError, type CalendarSource } from '@desk/connectors/panels';
import { kickJobsNow } from '../lib/kick-jobs.js';

const OAUTH_STATE_COOKIE = 'desk_connections_oauth_state';
const OAUTH_STATE_MAX_AGE_S = 600;

function base64url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function sha256Base64url(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return base64url(new Uint8Array(digest));
}

type ConnectionsRouteDeps = {
  db: Db;
  secretBox: SecretBox;
  clock: Clock;
  appOrigin: string;
  google: { clientId: string; clientSecret: string } | undefined;
  microsoft: { clientId: string; clientSecret: string } | undefined;
  googleOAuthEndpoints?: { authorize?: string; token?: string; revoke?: string } | undefined;
  microsoftOAuthEndpoints?: { authorize?: string; token?: string } | undefined;
  connections: ConnectionsService;
  panels: PanelsService;
  calendarSources: Partial<Record<'google' | 'microsoft', CalendarSource>>;
  limiter: RateLimiter;
  jobs:
    | {
        enqueue(
          name: string,
          payload: unknown,
          opts?: { userId?: string; runAfter?: Date },
        ): Promise<string>;
      }
    | undefined;
  /** Kicks the job runner once right after a user-triggered refresh (SC-002); background
   * refreshes still wait for the tick. */
  runJobsNow?: (() => Promise<void>) | undefined;
};

/** Builds an OAuth authorize URL for google/microsoft and sets the PKCE state cookie — shared
 * by GET /:provider/start (fresh connect, 302) and POST /:id/reconnect (200 { url }). */
async function beginOAuthFlow(
  c: Context<{ Variables: AppVariables }>,
  deps: ConnectionsRouteDeps,
  params: {
    userId: string;
    provider: 'google' | 'microsoft';
    capabilities: CapabilityT[];
    accountId?: string | undefined;
    reconnect: boolean;
  },
): Promise<string> {
  const providerConfig = params.provider === 'google' ? deps.google : deps.microsoft;
  if (!providerConfig) {
    throw new ApiError('validation_failed', 'Provider not configured', 400);
  }

  const verifierBytes = crypto.getRandomValues(new Uint8Array(32));
  const verifier = base64url(verifierBytes);
  const challenge = await sha256Base64url(verifier);
  const state = base64url(crypto.getRandomValues(new Uint8Array(16)));

  const stateCookieValue = JSON.stringify({
    userId: params.userId,
    provider: params.provider,
    capabilities: params.capabilities,
    accountId: params.accountId || null,
    reconnect: params.reconnect,
    verifier,
    nonce: state,
  });

  setCookie(c, OAUTH_STATE_COOKIE, stateCookieValue, {
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: OAUTH_STATE_MAX_AGE_S,
  });

  const scopes =
    params.provider === 'google'
      ? params.capabilities.map((cap) =>
          cap === 'calendar'
            ? 'https://www.googleapis.com/auth/calendar.readonly'
            : 'https://www.googleapis.com/auth/gmail.readonly',
        )
      : [
          ...params.capabilities.map((cap) =>
            cap === 'calendar' ? 'Calendars.Read' : 'Mail.Read',
          ),
          'offline_access',
          'User.Read',
        ];
  scopes.push('openid', 'email');

  const registry = providerRegistry[params.provider];
  const endpoints =
    params.provider === 'google' ? deps.googleOAuthEndpoints : deps.microsoftOAuthEndpoints;
  return registry.oauth.buildAuthorizeUrl({
    clientId: providerConfig.clientId,
    redirectUri: `${deps.appOrigin}/connections/${params.provider}/callback`,
    scopes,
    state,
    codeChallenge: challenge,
    ...(endpoints && { endpoints }),
  });
}

export function createConnectionsRoutes(deps: ConnectionsRouteDeps) {
  const app = new Hono<{ Variables: AppVariables }>();

  // GET /connections/providers — list available providers based on flags
  app.get('/providers', async (c) => {
    const user = requireAuth(c);
    const flags = await resolveAllFlags(deps.db, user.id);

    const providers: ProvidersResponseT['providers'] = [];

    // Google: appears if either calendar or mail flag is on
    if (flags['panels.google_calendar'] || flags['panels.google_mail']) {
      const capabilities: CapabilityT[] = [];
      if (flags['panels.google_calendar']) capabilities.push('calendar');
      if (flags['panels.google_mail']) capabilities.push('mail');
      providers.push({ id: 'google', capabilities });
    }

    // Microsoft: appears if flag is on
    if (flags['panels.microsoft']) {
      providers.push({ id: 'microsoft', capabilities: ['calendar', 'mail'] });
    }

    // Standards: appears if flag is on
    if (flags['panels.standards']) {
      providers.push({ id: 'standards', capabilities: ['calendar', 'mail'] });
    }

    return c.json({ providers });
  });

  // GET /connections/:provider/start — begin OAuth flow
  app.get('/:provider/start', async (c) => {
    const user = requireAuth(c);
    const provider = c.req.param('provider');
    const capabilitiesParam = c.req.query('capabilities');
    const capabilities: CapabilityT[] = capabilitiesParam
      ? (capabilitiesParam.split(',').filter(Boolean) as CapabilityT[])
      : [];
    const accountId = c.req.query('account');

    if (capabilities.length === 0) {
      throw new ApiError('validation_failed', 'At least one capability must be requested', 400);
    }

    // Check limit
    const isAtLimit = await deps.connections.checkLimit(user.id, accountId);
    // checkLimit already lets an owned account= through; a foreign or unknown id stays refused.
    if (isAtLimit) {
      return c.json({ error: { code: 'limit_reached', message: 'Maximum 10 accounts' } }, 409);
    }

    if (provider === 'standards') {
      throw new ApiError('not_found', 'Standards provider not implemented in this slice', 404);
    }

    // Get provider config
    const providerConfig =
      provider === 'google' ? deps.google : provider === 'microsoft' ? deps.microsoft : undefined;

    if (!providerConfig) {
      throw new ApiError('validation_failed', 'Provider not configured', 400);
    }

    const authorizeUrl = await beginOAuthFlow(c, deps, {
      userId: user.id,
      provider: provider as 'google' | 'microsoft',
      capabilities,
      accountId,
      reconnect: false,
    });

    return c.redirect(authorizeUrl, 302);
  });

  // GET /connections/:provider/callback — OAuth callback
  app.get('/:provider/callback', async (c) => {
    const user = requireAuth(c);
    const provider = c.req.param('provider') as 'google' | 'microsoft' | 'standards';
    const code = c.req.query('code');
    const returnedState = c.req.query('state');
    const error = c.req.query('error');
    const cookieValue = getCookie(c, OAUTH_STATE_COOKIE);
    deleteCookie(c, OAUTH_STATE_COOKIE, { path: '/' });

    if (error) {
      return c.redirect(`/settings/connections?error=${encodeURIComponent(error)}`, 302);
    }

    // All validation errors return 302 redirect to avoid CSRF issues
    if (!code || !returnedState) {
      return c.redirect('/settings/connections?error=invalid_state', 302);
    }

    if (!cookieValue) {
      return c.redirect('/settings/connections?error=invalid_state', 302);
    }

    // Parse state cookie
    let stateCookie: {
      userId: string;
      provider: string;
      capabilities: CapabilityT[];
      accountId?: string;
      reconnect: boolean;
      verifier: string;
      nonce: string;
    };

    try {
      stateCookie = JSON.parse(cookieValue);
    } catch {
      return c.redirect('/settings/connections?error=invalid_state', 302);
    }

    // Validate state userId matches session user
    if (stateCookie.userId !== user.id) {
      return c.redirect('/settings/connections?error=invalid_state', 302);
    }

    // Validate state nonce matches
    if (stateCookie.nonce !== returnedState) {
      return c.redirect('/settings/connections?error=invalid_state', 302);
    }

    if (provider === 'standards') {
      return c.redirect('/settings/connections?error=invalid_state', 302);
    }

    // Get provider config
    const providerConfig =
      provider === 'google' ? deps.google : provider === 'microsoft' ? deps.microsoft : undefined;

    if (!providerConfig) {
      return c.redirect('/settings/connections?error=provider_unreachable', 302);
    }

    // Exchange code for token
    const registry = providerRegistry[provider as keyof typeof providerRegistry];
    let tokenData: {
      refreshToken?: string;
      accessToken?: string;
      email?: string;
      grantedScopes: string[];
    };
    const endpoints =
      provider === 'google' ? deps.googleOAuthEndpoints : deps.microsoftOAuthEndpoints;
    try {
      const exchangeResult = await registry.oauth.exchangeCode(
        {
          code,
          codeVerifier: stateCookie.verifier,
          clientId: providerConfig.clientId,
          clientSecret: providerConfig.clientSecret,
          redirectUri: `${deps.appOrigin}/connections/${provider}/callback`,
        },
        globalThis.fetch,
        endpoints,
      );
      tokenData = exchangeResult as typeof tokenData;
    } catch {
      return c.redirect('/settings/connections?error=provider_unreachable', 302);
    }

    // Check refresh token is present before proceeding with DB write
    if (!tokenData.refreshToken) {
      return c.redirect('/settings/connections?error=provider_unreachable', 302);
    }

    // Derive capabilities from granted scopes
    const grantedCapabilities: CapabilityT[] = [];
    for (const scope of tokenData.grantedScopes) {
      if (provider === 'google') {
        if (scope.includes('calendar.readonly')) grantedCapabilities.push('calendar');
        if (scope.includes('gmail.readonly')) grantedCapabilities.push('mail');
      } else if (provider === 'microsoft') {
        if (scope.includes('Calendars.Read')) grantedCapabilities.push('calendar');
        if (scope.includes('Mail.Read')) grantedCapabilities.push('mail');
      }
    }

    // Check if any capabilities were granted (email must come from id_token with openid scope)
    if (grantedCapabilities.length === 0 || !tokenData.email) {
      return c.redirect('/settings/connections?error=scope_denied', 302);
    }

    // Get email address from token (required, extracted from id_token by oauth helper)
    const address = tokenData.email.toLowerCase();

    // Check limit for new accounts
    if (!stateCookie.accountId) {
      const isAtLimit = await deps.connections.checkLimit(user.id);
      if (isAtLimit) {
        return c.redirect('/settings/connections?error=limit_reached', 302);
      }
    }

    // Check account mismatch if reconnecting
    if (stateCookie.accountId) {
      const existing = await deps.db
        .select()
        .from(connectedAccounts)
        .where(
          and(
            eq(connectedAccounts.id, stateCookie.accountId),
            eq(connectedAccounts.userId, user.id),
          ),
        );
      if (existing.length > 0 && existing[0] && existing[0].address !== address) {
        return c.redirect('/settings/connections?error=account_mismatch', 302);
      }
    }

    // Seal credential
    const credentialEncBytes = await sealCredential(deps.secretBox, {
      refreshToken: tokenData.refreshToken,
    });

    // Upsert account (merge or create)
    const existingRows = await deps.db
      .select()
      .from(connectedAccounts)
      .where(
        and(
          eq(connectedAccounts.userId, user.id),
          eq(connectedAccounts.provider, provider),
          eq(connectedAccounts.address, address),
        ),
      );

    let accountId: string;
    if (existingRows.length > 0 && existingRows[0]) {
      // Merge: update capabilities and credential
      const existing = existingRows[0];
      const mergedCapabilities = Array.from(
        new Set([...existing.capabilities, ...grantedCapabilities]),
      );
      await deps.db
        .update(connectedAccounts)
        .set({
          capabilities: mergedCapabilities,
          grantedScopes: tokenData.grantedScopes,
          credentialEnc: credentialEncBytes,
          status: 'connected',
          lastError: null,
          consecutiveFailures: 0,
          nextRefreshAt: deps.connections.now(),
          updatedAt: deps.connections.now(),
        })
        .where(eq(connectedAccounts.id, existing.id));
      accountId = existing.id;
    } else {
      // Create new account
      const colour = await deps.connections.getNextColour(user.id);
      const [created] = await deps.db
        .insert(connectedAccounts)
        .values({
          userId: user.id,
          provider,
          address,
          label: address,
          colour,
          capabilities: grantedCapabilities,
          grantedScopes: tokenData.grantedScopes,
          credentialEnc: credentialEncBytes,
          status: 'connected',
          nextRefreshAt: deps.connections.now(),
        })
        .returning();
      if (!created) throw new Error('Failed to create account');
      accountId = created.id;
    }

    // Enqueue refresh job if available
    if (deps.jobs) {
      await deps.jobs.enqueue('panels.refresh', { accountId }, { userId: user.id });
    }

    await deps.db.insert(auditLog).values({
      userId: user.id,
      actor: 'user',
      action: 'connect',
      subject: accountId,
    });

    return c.redirect(`/settings/connections?connected=${accountId}`, 302);
  });

  // GET /connections — list user's connected accounts
  app.get('/', async (c) => {
    const user = requireAuth(c);
    const accounts = await deps.db
      .select()
      .from(connectedAccounts)
      .where(eq(connectedAccounts.userId, user.id));

    const body: ConnectionsResponseT = {
      accounts: accounts.map((acc) => ({
        id: acc.id,
        provider: acc.provider as 'google' | 'microsoft' | 'standards',
        address: acc.address,
        label: acc.label,
        colour: acc.colour || 'teal',
        capabilities: acc.capabilities as CapabilityT[],
        grantedScopes: acc.grantedScopes,
        status:
          acc.pausedAt && new Date(acc.pausedAt) > new Date('2000-01-01')
            ? 'paused'
            : (acc.status as 'connected' | 'reconnect_needed' | 'error'),
        pausedAt: acc.pausedAt ? acc.pausedAt.toISOString() : null,
        lastRefreshAt: acc.lastRefreshAt ? acc.lastRefreshAt.toISOString() : null,
        lastError: acc.lastError,
        calendars: [],
      })),
      limit: 10,
    };

    return c.json(body);
  });

  // GET /connections/:id/calendars — re-list from the provider, upserting account_calendars
  app.get('/:id/calendars', async (c) => {
    const user = requireAuth(c);
    const accountId = c.req.param('id');

    const [account] = await deps.db
      .select()
      .from(connectedAccounts)
      .where(and(eq(connectedAccounts.id, accountId), eq(connectedAccounts.userId, user.id)));
    if (!account) throw new ApiError('not_found', 'Account not found', 404);

    const source = deps.calendarSources[account.provider as 'google' | 'microsoft'];
    if (!source) {
      throw new ApiError('validation_failed', 'Provider not configured', 400);
    }

    let listed: Array<{ id: string; name: string; isPrimary: boolean; colour?: string }>;
    try {
      const credential = await openCredential(deps.secretBox, account.credentialEnc);
      listed = await source.listCalendars(credential);
    } catch (error) {
      if (error instanceof AuthError) {
        await deps.db
          .update(connectedAccounts)
          .set({ status: 'reconnect_needed', lastError: 'access_revoked' })
          .where(eq(connectedAccounts.id, accountId));
        // Not in contracts/api.md; a reconnect is the only way to clear this account (FR-004),
        // so 'conflict' (the closest existing error code) rather than a bespoke one.
        throw new ApiError('conflict', 'Account needs reconnecting', 409);
      }
      throw error;
    }

    const existingRows = await deps.db
      .select()
      .from(accountCalendars)
      .where(eq(accountCalendars.accountId, accountId));
    const existingByProviderId = new Map(existingRows.map((r) => [r.providerCalendarId, r]));

    const calendars: CalendarT[] = [];
    for (const cal of listed) {
      const prior = existingByProviderId.get(cal.id);
      const enabled = prior ? prior.enabled : cal.isPrimary;
      const [row] = await deps.db
        .insert(accountCalendars)
        .values({
          userId: account.userId,
          accountId,
          providerCalendarId: cal.id,
          name: cal.name,
          isPrimary: cal.isPrimary,
          enabled,
          colour: cal.colour ?? null,
        })
        .onConflictDoUpdate({
          target: [accountCalendars.accountId, accountCalendars.providerCalendarId],
          set: {
            name: cal.name,
            isPrimary: cal.isPrimary,
            colour: cal.colour ?? null,
            updatedAt: deps.clock.now(),
          },
        })
        .returning();
      if (row) {
        calendars.push({
          id: row.id,
          name: row.name,
          isPrimary: row.isPrimary,
          enabled: row.enabled,
        });
      }
    }

    const body: CalendarsResponseT = { calendars };
    return c.json(body);
  });

  // POST /connections/:id/refresh — manually refresh an account
  app.post('/:id/refresh', async (c) => {
    const user = requireAuth(c);
    const accountId = c.req.param('id');

    // Ownership first: a foreign or unknown id is a plain 404 and doesn't use up the limit.
    try {
      await deps.panels.assertOwned(user.id, accountId);
    } catch (error) {
      if ((error as Error).message === 'not_found') {
        throw new ApiError('not_found', 'Account not found', 404);
      }
      throw error;
    }

    // Rate limit shared with POST /today/refresh
    const rateLimitKey = `panels.refresh:${user.id}`;
    const allowed = await deps.limiter.hit(rateLimitKey, 1, 60 * 1000);

    if (!allowed) {
      const retryAfterSeconds = 60;
      return c.json(
        {
          error: { code: 'rate_limited', message: 'Rate limited: one refresh per minute' },
          retryAfterSeconds,
        },
        429,
      );
    }

    // Check ownership and enqueue refresh
    try {
      await deps.panels.refreshNow(user.id, accountId);
      kickJobsNow(c, deps.runJobsNow);
      return c.json({}, 202);
    } catch (error) {
      if ((error as Error).message === 'not_found') {
        throw new ApiError('not_found', 'Account not found', 404);
      }
      throw error;
    }
  });

  // PATCH /connections/:id — label/colour/paused/calendars
  app.patch('/:id', async (c) => {
    const user = requireAuth(c);
    const accountId = c.req.param('id');
    const patch = AccountPatch.parse(await c.req.json().catch(() => ({})));

    let account;
    try {
      account = await deps.connections.update(user.id, accountId, patch);
    } catch (error) {
      if ((error as Error).message === 'not_found') {
        throw new ApiError('not_found', 'Account not found', 404);
      }
      throw error;
    }

    const calendarRows = await deps.db
      .select()
      .from(accountCalendars)
      .where(eq(accountCalendars.accountId, accountId));

    const body: { account: AccountT } = {
      account: {
        id: account.id,
        provider: account.provider as ProviderIdT,
        address: account.address,
        label: account.label,
        colour: account.colour ?? 'teal',
        capabilities: account.capabilities as CapabilityT[],
        grantedScopes: account.grantedScopes,
        status: account.pausedAt ? 'paused' : (account.status as AccountT['status']),
        pausedAt: account.pausedAt ? account.pausedAt.toISOString() : null,
        lastRefreshAt: account.lastRefreshAt ? account.lastRefreshAt.toISOString() : null,
        lastError: account.lastError,
        calendars: calendarRows.map((r): CalendarT => ({
          id: r.id,
          name: r.name,
          isPrimary: r.isPrimary,
          enabled: r.enabled,
        })),
      },
    };
    return c.json(body);
  });

  // POST /connections/:id/reconnect — 200 { url } for OAuth providers, { needsPassword: true } for standards
  app.post('/:id/reconnect', async (c) => {
    const user = requireAuth(c);
    const accountId = c.req.param('id');

    let info;
    try {
      info = await deps.connections.startReconnect(user.id, accountId);
    } catch (error) {
      if ((error as Error).message === 'not_found') {
        throw new ApiError('not_found', 'Account not found', 404);
      }
      throw error;
    }

    if (info.provider !== 'google' && info.provider !== 'microsoft') {
      const body: ReconnectResponseT = { needsPassword: true };
      return c.json(body, 200);
    }

    const url = await beginOAuthFlow(c, deps, {
      userId: user.id,
      provider: info.provider,
      capabilities: info.capabilities,
      accountId,
      reconnect: true,
    });
    const body: ReconnectResponseT = { url };
    return c.json(body, 200);
  });

  // DELETE /connections/:id — revoke at the provider (best effort), then delete the row and its cache
  app.delete('/:id', async (c) => {
    const user = requireAuth(c);
    const accountId = c.req.param('id');

    try {
      await deps.connections.disconnect(user.id, accountId);
    } catch (error) {
      if ((error as Error).message === 'not_found') {
        throw new ApiError('not_found', 'Account not found', 404);
      }
      throw error;
    }

    return c.body(null, 204);
  });

  return app;
}
