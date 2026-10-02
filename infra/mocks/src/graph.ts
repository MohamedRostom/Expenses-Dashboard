import { Hono } from 'hono';
import type { Context } from 'hono';
import { GraphFake } from '@desk/connectors/microsoft/fake';
import type { MicrosoftRawCalendar, MicrosoftRawEvent } from '@desk/connectors/microsoft/calendar';
import type { MicrosoftRawMessage } from '@desk/connectors/microsoft/mail';

/**
 * T036: Microsoft Graph calendar mock, backed by GraphFake. Mounted at `/graph` in server.ts, so
 * with GRAPH_API_BASE=http://mocks:4000/graph and MICROSOFT_LOGIN_BASE=http://mocks:4000/graph
 * (both point here — see microsoftOAuthEndpoints() in apps/api/src/lib/credential.ts) the compose
 * api service can complete the whole OAuth connect flow and every calendar read against this mock.
 *
 * T087: state is scoped per connected account, keyed by an opaque string ("account key") rather
 * than one shared GraphFake for every connect — see google.ts's matching comment for the full
 * design; the shape here is the same, just Graph's field names (bearer `fake-graph-access-token:
 * <key>`, `$deltatoken` instead of `syncToken`).
 *
 * Control routes for Playwright (tests/e2e/fixtures/index.ts's `mockProvider('microsoft')`):
 *   POST /graph/__control/events       { action: 'add', calendarId, event, key? } | { action: 'delete', calendarId, eventId, key? }
 *   POST /graph/__control/messages     { action: 'add', message, key? } | { action: 'markRead', id, key? } — T052
 *   POST /graph/__control/revoke       { key? } — flips that one account into "access revoked" mode
 *   POST /graph/__control/next-account { key } — the next OAuth connect creates/reuses this account
 *
 * T052: the mail delta route for createMicrosoftMailSource (packages/connectors/src/microsoft/mail.ts)
 * follows the same deltaLink pattern as the calendar route above, at the exact path/params it fetches.
 */
export function createGraphMockApp(fake: GraphFake = defaultFake()): Hono {
  const app = new Hono();

  interface Account {
    fake: GraphFake;
    revoked: boolean;
  }
  const accounts = new Map<string, Account>([['default', { fake, revoked: false }]]);
  let nextKey: string | null = null;

  function accountFor(key: string): Account {
    let account = accounts.get(key);
    if (!account) {
      account = { fake: defaultFake(), revoked: false };
      accounts.set(key, account);
    }
    return account;
  }

  /** `Authorization: Bearer fake-graph-access-token:<key>` -> key ('default' with no match). */
  function keyFromAuth(c: Context): string {
    const token = (c.req.header('authorization') ?? '').replace(/^Bearer\s+/i, '');
    return token.match(/^fake-graph-access-token:(.+)$/)?.[1] ?? 'default';
  }

  // OAuth: GET /common/oauth2/v2.0/authorize — simulates instant user consent.
  app.get('/common/oauth2/v2.0/authorize', (c) => {
    const redirectUri = c.req.query('redirect_uri');
    const state = c.req.query('state');
    if (!redirectUri) return c.text('missing redirect_uri', 400);
    const key = nextKey ?? 'default';
    nextKey = null;
    accountFor(key);
    const url = new URL(redirectUri);
    url.searchParams.set('code', `fake-graph-auth-code:${key}`);
    if (state) url.searchParams.set('state', state);
    return c.redirect(url.toString(), 302);
  });

  app.post('/common/oauth2/v2.0/token', async (c) => {
    const body = await c.req.parseBody();
    const grantType = body['grant_type'];
    let key = 'default';
    if (grantType === 'authorization_code') {
      key = String(body['code'] ?? '').match(/^fake-graph-auth-code:(.+)$/)?.[1] ?? 'default';
    } else if (grantType === 'refresh_token') {
      key =
        String(body['refresh_token'] ?? '').match(/^fake-graph-refresh-token:(.+)$/)?.[1] ??
        'default';
    }
    if (accountFor(key).revoked) return c.json({ error: 'invalid_grant' }, 400);
    const scope =
      grantType === 'authorization_code' ? 'openid email Calendars.Read Mail.Read' : undefined;
    return c.json({
      access_token: `fake-graph-access-token:${key}`,
      refresh_token: `fake-graph-refresh-token:${key}`,
      ...(scope ? { scope } : {}),
      id_token: fakeIdToken('mock-graph-user@example.test'),
      expires_in: 3600,
    });
  });

  app.get('/v1.0/me', (c) => {
    const account = accountFor(keyFromAuth(c));
    if (account.revoked) return c.json({ error: { code: 'InvalidAuthenticationToken' } }, 401);
    return c.json({});
  });

  app.get('/v1.0/me/calendars', (c) => {
    const account = accountFor(keyFromAuth(c));
    if (account.revoked) return c.json({ error: { code: 'InvalidAuthenticationToken' } }, 401);
    return c.json({ value: account.fake.rawCalendars() });
  });

  // A full fetch (no $deltatoken) excludes removed items; a $deltatoken cursor gets only items
  // changed since it, tombstones ('@removed') included — T085.
  app.get('/v1.0/me/calendars/:calendarId/calendarView/delta', (c) => {
    const account = accountFor(keyFromAuth(c));
    if (account.revoked) return c.json({ error: { code: 'InvalidAuthenticationToken' } }, 401);
    const calendarId = decodeURIComponent(c.req.param('calendarId'));
    const deltaToken = c.req.query('$deltatoken') ?? undefined;
    const { items, seq } = account.fake.rawDeltaPage(calendarId, deltaToken);
    const deltaLink = new URL(c.req.url);
    deltaLink.search = `?$deltatoken=${seq}`;
    return c.json({ value: items, '@odata.deltaLink': deltaLink.toString() });
  });

  // T052: the mail delta route createMicrosoftMailSource fetches (full on no $deltatoken,
  // incremental otherwise) — same "changed since" shape as the calendarView/delta route above.
  app.get('/v1.0/me/mailFolders/inbox/messages/delta', (c) => {
    const account = accountFor(keyFromAuth(c));
    if (account.revoked) return c.json({ error: { code: 'InvalidAuthenticationToken' } }, 401);
    const deltaToken = c.req.query('$deltatoken') ?? undefined;
    const { items, seq } = account.fake.rawMailDeltaPage(deltaToken);
    const deltaLink = new URL(c.req.url);
    deltaLink.search = `?$deltatoken=${seq}`;
    return c.json({ value: items, '@odata.deltaLink': deltaLink.toString() });
  });

  app.post('/__control/messages', async (c) => {
    const body = await c.req.json<
      | { action: 'add'; message: MicrosoftRawMessage; key?: string }
      | { action: 'markRead'; id: string; key?: string }
    >();
    const account = accountFor(body.key ?? 'default');
    if (body.action === 'add') {
      account.fake.addMessage(body.message);
    } else if (body.action === 'markRead') {
      account.fake.markRead(body.id);
    } else {
      return c.json({ error: 'unknown action' }, 400);
    }
    return c.json({ ok: true });
  });

  app.post('/__control/events', async (c) => {
    const body = await c.req.json<
      | { action: 'add'; calendarId: string; event: Record<string, unknown>; key?: string }
      | { action: 'delete'; calendarId: string; eventId: string; key?: string }
    >();
    const account = accountFor(body.key ?? 'default');
    if (body.action === 'add') {
      account.fake.addEvent(body.calendarId, body.event as MicrosoftRawEvent);
    } else if (body.action === 'delete') {
      account.fake.deleteEvent(body.calendarId, body.eventId);
    } else {
      return c.json({ error: 'unknown action' }, 400);
    }
    return c.json({ ok: true });
  });

  app.post('/__control/revoke', async (c) => {
    const body = await c.req.json<{ key?: string }>().catch(() => ({}) as { key?: string });
    accountFor(body.key ?? 'default').revoked = true;
    return c.json({ ok: true });
  });

  app.post('/__control/next-account', async (c) => {
    const body = await c.req.json<{ key: string }>();
    nextKey = body.key;
    accountFor(body.key);
    return c.json({ ok: true });
  });

  return app;
}

function defaultFake(): GraphFake {
  const calendars: Record<string, MicrosoftRawCalendar> = {
    'primary-cal@example.test': {
      id: 'primary-cal@example.test',
      name: 'Calendar',
      isDefaultCalendar: true,
      hexColor: '#1f6e5a',
    },
  };
  return new GraphFake({ calendars, items: { 'primary-cal@example.test': [] }, messages: [] });
}

function fakeIdToken(email: string): string {
  const b64url = (s: string) => Buffer.from(s).toString('base64url');
  const header = b64url(JSON.stringify({ alg: 'none', typ: 'JWT' }));
  const payload = b64url(JSON.stringify({ email }));
  return `${header}.${payload}.`;
}
