import { Hono } from 'hono';
import type { Context } from 'hono';
import { GoogleFake } from '@desk/connectors/google/fake';
import type { GmailMessageMetadata } from '@desk/connectors/google/gmail';

/**
 * T036: Google Calendar mock, backed by GoogleFake. Mounted at `/google` in server.ts, so with
 * GOOGLE_API_BASE=http://mocks:4000/google and GOOGLE_OAUTH_BASE=http://mocks:4000/google (both
 * point here — the real app calls the two bases with different paths, see googleOAuthEndpoints()
 * in apps/api/src/lib/credential.ts) the compose api service can complete the whole OAuth connect
 * flow and every calendar read against this one mock.
 *
 * T087: state is scoped per connected account, keyed by an opaque string ("account key") rather
 * than one shared GoogleFake for every connect. `fake` (the constructor argument) seeds the
 * 'default' account — the one every route falls back to when no key is otherwise given, which is
 * what every pre-T087 test and a real e2e run (server.ts calls createGoogleMockApp() with no
 * argument) still gets. A test that wants an isolated second account calls
 * `POST /__control/next-account { key }` before driving the OAuth flow (see
 * `tests/e2e/fixtures/index.ts`'s `nextMockAccount`); the authorize code, and then the access and
 * refresh tokens, carry that key so every later request naturally lands on the right account's
 * fake, without any other shared state.
 *
 * Control routes for Playwright (tests/e2e/fixtures/index.ts's `mockProvider('google')`):
 *   POST /google/__control/events       { action: 'add', calendarId, event, key? } | { action: 'delete', calendarId, eventId, key? }
 *   POST /google/__control/messages     { action: 'add', message, key? } | { action: 'markRead', id, key? } — T052
 *   POST /google/__control/revoke       { key? } — flips that one account into "access revoked" mode
 *   POST /google/__control/next-account { key } — the next OAuth connect creates/reuses this account
 *
 * T052: Gmail routes for createGmailSource (packages/connectors/src/google/gmail.ts) — messages.list,
 * messages.get?format=metadata, history.list, labels/INBOX and profile — served from the same
 * per-account GoogleFake as the calendar routes above.
 */
export function createGoogleMockApp(fake: GoogleFake = defaultFake()): Hono {
  const app = new Hono();

  interface Account {
    fake: GoogleFake;
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

  /** `Authorization: Bearer fake-google-access-token:<key>` -> key ('default' with no match). */
  function keyFromAuth(c: Context): string {
    const token = (c.req.header('authorization') ?? '').replace(/^Bearer\s+/i, '');
    return token.match(/^fake-google-access-token:(.+)$/)?.[1] ?? 'default';
  }

  // OAuth: GET /o/oauth2/v2/auth — simulates instant user consent (no login UI to drive),
  // so an e2e test can complete `GET /connections/google/start` -> here -> the real callback.
  app.get('/o/oauth2/v2/auth', (c) => {
    const redirectUri = c.req.query('redirect_uri');
    const state = c.req.query('state');
    if (!redirectUri) return c.text('missing redirect_uri', 400);
    const key = nextKey ?? 'default';
    nextKey = null;
    accountFor(key);
    const url = new URL(redirectUri);
    url.searchParams.set('code', `fake-google-auth-code:${key}`);
    if (state) url.searchParams.set('state', state);
    return c.redirect(url.toString(), 302);
  });

  app.post('/token', async (c) => {
    const body = await c.req.parseBody();
    const grantType = body['grant_type'];
    let key = 'default';
    if (grantType === 'authorization_code') {
      key = String(body['code'] ?? '').match(/^fake-google-auth-code:(.+)$/)?.[1] ?? 'default';
    } else if (grantType === 'refresh_token') {
      key =
        String(body['refresh_token'] ?? '').match(/^fake-google-refresh-token:(.+)$/)?.[1] ??
        'default';
    }
    if (accountFor(key).revoked) return c.json({ error: 'invalid_grant' }, 400);
    const scope =
      grantType === 'authorization_code'
        ? 'openid email https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/gmail.readonly'
        : undefined;
    return c.json({
      access_token: `fake-google-access-token:${key}`,
      refresh_token: `fake-google-refresh-token:${key}`,
      ...(scope ? { scope } : {}),
      id_token: fakeIdToken('mock-google-user@example.test'),
      expires_in: 3600,
    });
  });

  app.post('/revoke', (c) => c.json({}));

  app.get('/calendar/v3/users/me/calendarList', (c) => {
    const account = accountFor(keyFromAuth(c));
    if (account.revoked) return c.json({ error: { message: 'invalid credentials' } }, 401);
    return c.json({ items: account.fake.rawCalendars() });
  });

  // ponytail: no timeMin/timeMax filtering on a full fetch — e2e seeds only events near "today",
  // and cached_events trims out-of-window rows downstream anyway. A syncToken query does get
  // honoured (T085): only items changed since it (tombstones included) come back.
  app.get('/calendar/v3/calendars/:calendarId/events', (c) => {
    const account = accountFor(keyFromAuth(c));
    if (account.revoked) return c.json({ error: { message: 'invalid credentials' } }, 401);
    const calendarId = decodeURIComponent(c.req.param('calendarId'));
    const syncToken = c.req.query('syncToken') ?? undefined;
    const { items, nextSyncToken } = account.fake.rawEventsPage(calendarId, syncToken);
    return c.json({ items, nextSyncToken });
  });

  // T052: Gmail mail routes (createGmailSource's apiBase + these exact paths/params).
  app.get('/gmail/v1/users/me/messages', (c) => {
    const account = accountFor(keyFromAuth(c));
    if (account.revoked) return c.json({ error: { message: 'invalid credentials' } }, 401);
    const maxResults = Number(c.req.query('maxResults') ?? '50');
    const messages = account.fake.rawMessagesList(maxResults);
    return c.json({ messages, resultSizeEstimate: messages.length });
  });

  app.get('/gmail/v1/users/me/messages/:id', (c) => {
    const account = accountFor(keyFromAuth(c));
    if (account.revoked) return c.json({ error: { message: 'invalid credentials' } }, 401);
    const raw = account.fake.rawMessage(decodeURIComponent(c.req.param('id')));
    if (!raw) return c.json({ error: { message: 'not found' } }, 404);
    return c.json(raw);
  });

  app.get('/gmail/v1/users/me/history', (c) => {
    const account = accountFor(keyFromAuth(c));
    if (account.revoked) return c.json({ error: { message: 'invalid credentials' } }, 401);
    const startHistoryId = c.req.query('startHistoryId') ?? '0';
    const { addedIds, historyId } = account.fake.rawHistorySince(startHistoryId);
    const body: {
      history?: Array<{ id: string; messagesAdded: Array<{ message: { id: string } }> }>;
      historyId: string;
    } = { historyId };
    if (addedIds.length > 0) {
      body.history = [
        { id: historyId, messagesAdded: addedIds.map((id) => ({ message: { id } })) },
      ];
    }
    return c.json(body);
  });

  app.get('/gmail/v1/users/me/labels/INBOX', (c) => {
    const account = accountFor(keyFromAuth(c));
    if (account.revoked) return c.json({ error: { message: 'invalid credentials' } }, 401);
    return c.json(account.fake.rawLabelInbox());
  });

  app.get('/gmail/v1/users/me/profile', (c) => {
    const account = accountFor(keyFromAuth(c));
    if (account.revoked) return c.json({ error: { message: 'invalid credentials' } }, 401);
    return c.json(account.fake.rawProfile());
  });

  app.post('/__control/messages', async (c) => {
    const body = await c.req.json<
      | { action: 'add'; message: Omit<GmailMessageMetadata, 'historyId'>; key?: string }
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
      account.fake.addEvent(
        body.calendarId,
        body.event as unknown as Parameters<GoogleFake['addEvent']>[1],
      );
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

function defaultFake(): GoogleFake {
  return new GoogleFake({
    calendars: [{ id: 'primary', summary: 'Primary', primary: true }],
    items: { primary: [] },
  });
}

function fakeIdToken(email: string): string {
  const b64url = (s: string) => Buffer.from(s).toString('base64url');
  const header = b64url(JSON.stringify({ alg: 'none', typ: 'JWT' }));
  const payload = b64url(JSON.stringify({ email }));
  return `${header}.${payload}.`;
}
