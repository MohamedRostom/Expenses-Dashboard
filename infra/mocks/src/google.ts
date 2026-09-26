import { Hono } from 'hono';
import { GoogleFake } from '@desk/connectors/google/fake';

/**
 * T036: Google Calendar mock, backed by GoogleFake. Mounted at `/google` in server.ts, so with
 * GOOGLE_API_BASE=http://mocks:4000/google and GOOGLE_OAUTH_BASE=http://mocks:4000/google (both
 * point here — the real app calls the two bases with different paths, see googleOAuthEndpoints()
 * in apps/api/src/lib/credential.ts) the compose api service can complete the whole OAuth connect
 * flow and every calendar read against this one mock.
 *
 * Control routes for Playwright (tests/e2e/fixtures/index.ts's `mockProvider('google')`):
 *   POST /google/__control/events  { action: 'add', calendarId, event } | { action: 'delete', calendarId, eventId }
 *   POST /google/__control/revoke  — flips the mock into "access revoked" mode
 */
export function createGoogleMockApp(fake: GoogleFake = defaultFake()): Hono {
  const app = new Hono();
  let revoked = false;

  // OAuth: GET /o/oauth2/v2/auth — simulates instant user consent (no login UI to drive),
  // so an e2e test can complete `GET /connections/google/start` -> here -> the real callback.
  app.get('/o/oauth2/v2/auth', (c) => {
    const redirectUri = c.req.query('redirect_uri');
    const state = c.req.query('state');
    if (!redirectUri) return c.text('missing redirect_uri', 400);
    const url = new URL(redirectUri);
    url.searchParams.set('code', 'fake-google-auth-code');
    if (state) url.searchParams.set('state', state);
    return c.redirect(url.toString(), 302);
  });

  app.post('/token', async (c) => {
    if (revoked) return c.json({ error: 'invalid_grant' }, 400);
    const body = await c.req.parseBody();
    const scope =
      body['grant_type'] === 'authorization_code'
        ? 'openid email https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/gmail.readonly'
        : undefined;
    return c.json({
      access_token: 'fake-google-access-token',
      refresh_token: 'fake-google-refresh-token',
      ...(scope ? { scope } : {}),
      id_token: fakeIdToken('mock-google-user@example.test'),
      expires_in: 3600,
    });
  });

  app.post('/revoke', (c) => c.json({}));

  app.get('/calendar/v3/users/me/calendarList', (c) => {
    if (revoked) return c.json({ error: { message: 'invalid credentials' } }, 401);
    return c.json({ items: fake.rawCalendars() });
  });

  // ponytail: no timeMin/timeMax filtering — e2e seeds only events near "today", and cached_events
  // trims out-of-window rows downstream anyway. Add filtering if a spec starts relying on it.
  app.get('/calendar/v3/calendars/:calendarId/events', (c) => {
    if (revoked) return c.json({ error: { message: 'invalid credentials' } }, 401);
    const calendarId = decodeURIComponent(c.req.param('calendarId'));
    return c.json({ items: fake.rawEvents(calendarId), nextSyncToken: 'fake-google-sync-token' });
  });

  app.post('/__control/events', async (c) => {
    const body = await c.req.json<
      | { action: 'add'; calendarId: string; event: Record<string, unknown> }
      | { action: 'delete'; calendarId: string; eventId: string }
    >();
    if (body.action === 'add') {
      fake.addEvent(
        body.calendarId,
        body.event as unknown as Parameters<GoogleFake['addEvent']>[1],
      );
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
