import { Hono } from 'hono';
import { GraphFake } from '@desk/connectors/microsoft/fake';
import type { MicrosoftRawCalendar, MicrosoftRawEvent } from '@desk/connectors/microsoft/calendar';

/**
 * T036: Microsoft Graph calendar mock, backed by GraphFake. Mounted at `/graph` in server.ts, so
 * with GRAPH_API_BASE=http://mocks:4000/graph and MICROSOFT_LOGIN_BASE=http://mocks:4000/graph
 * (both point here — see microsoftOAuthEndpoints() in apps/api/src/lib/credential.ts) the compose
 * api service can complete the whole OAuth connect flow and every calendar read against this mock.
 *
 * Control routes for Playwright (tests/e2e/fixtures/index.ts's `mockProvider('microsoft')`):
 *   POST /graph/__control/events  { action: 'add', calendarId, event } | { action: 'delete', calendarId, eventId }
 *   POST /graph/__control/revoke  — flips the mock into "access revoked" mode
 */
export function createGraphMockApp(fake: GraphFake = defaultFake()): Hono {
  const app = new Hono();
  let revoked = false;

  // OAuth: GET /common/oauth2/v2.0/authorize — simulates instant user consent.
  app.get('/common/oauth2/v2.0/authorize', (c) => {
    const redirectUri = c.req.query('redirect_uri');
    const state = c.req.query('state');
    if (!redirectUri) return c.text('missing redirect_uri', 400);
    const url = new URL(redirectUri);
    url.searchParams.set('code', 'fake-graph-auth-code');
    if (state) url.searchParams.set('state', state);
    return c.redirect(url.toString(), 302);
  });

  app.post('/common/oauth2/v2.0/token', async (c) => {
    if (revoked) return c.json({ error: 'invalid_grant' }, 400);
    const body = await c.req.parseBody();
    const scope =
      body['grant_type'] === 'authorization_code'
        ? 'openid email Calendars.Read Mail.Read'
        : undefined;
    return c.json({
      access_token: 'fake-graph-access-token',
      refresh_token: 'fake-graph-refresh-token',
      ...(scope ? { scope } : {}),
      id_token: fakeIdToken('mock-graph-user@example.test'),
      expires_in: 3600,
    });
  });

  app.get('/v1.0/me', (c) => {
    if (revoked) return c.json({ error: { code: 'InvalidAuthenticationToken' } }, 401);
    return c.json({});
  });

  app.get('/v1.0/me/calendars', (c) => {
    if (revoked) return c.json({ error: { code: 'InvalidAuthenticationToken' } }, 401);
    return c.json({ value: fake.rawCalendars() });
  });

  // ponytail: always answers with the full window and a self-referencing deltaLink, same as
  // GraphFake ("the fake ignores cursors") — no incremental-delta simulation needed for e2e.
  app.get('/v1.0/me/calendars/:calendarId/calendarView/delta', (c) => {
    if (revoked) return c.json({ error: { code: 'InvalidAuthenticationToken' } }, 401);
    const calendarId = decodeURIComponent(c.req.param('calendarId'));
    const deltaLink = new URL(c.req.url);
    deltaLink.search = '?$deltatoken=fake-graph-delta-token';
    return c.json({ value: fake.rawEvents(calendarId), '@odata.deltaLink': deltaLink.toString() });
  });

  app.post('/__control/events', async (c) => {
    const body = await c.req.json<
      | { action: 'add'; calendarId: string; event: Record<string, unknown> }
      | { action: 'delete'; calendarId: string; eventId: string }
    >();
    if (body.action === 'add') {
      fake.addEvent(body.calendarId, body.event as MicrosoftRawEvent);
    } else if (body.action === 'delete') {
      fake.deleteEvent(body.calendarId, body.eventId);
    } else {
      return c.json({ error: 'unknown action' }, 400);
    }
    return c.json({ ok: true });
  });

  app.post('/__control/revoke', (c) => {
    revoked = true;
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
  return new GraphFake({ calendars, items: { 'primary-cal@example.test': [] } });
}

function fakeIdToken(email: string): string {
  const b64url = (s: string) => Buffer.from(s).toString('base64url');
  const header = b64url(JSON.stringify({ alg: 'none', typ: 'JWT' }));
  const payload = b64url(JSON.stringify({ email }));
  return `${header}.${payload}.`;
}
