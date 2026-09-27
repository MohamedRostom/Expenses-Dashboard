import { Hono } from 'hono';
import type { Context } from 'hono';
import { CalDavFake } from '@desk/connectors/caldav/fake';

/**
 * T071: CalDAV mock, backed by CalDavFake — PROPFIND discovery (current-user-principal ->
 * calendar-home-set -> one "Personal" calendar per username) and REPORT calendar-query, both
 * served straight from CalDavFake's in-memory ICS store so this mock and
 * packages/connectors/src/caldav/client.test.ts's fixtures agree on the wire format by
 * construction (createCalDavSource is the thing driving both).
 *
 * Unlike Google/Graph (OAuth, keyed by an opaque "account key" issued during the fake auth
 * flow — T087), CalDAV has no OAuth: isolation is by `username` straight off HTTP Basic auth,
 * the same as the IMAP mock (infra/mocks/src/imap.ts) keys by username directly.
 *
 * Control routes for Playwright (tests/e2e/fixtures/index.ts's `mockProvider('caldav')`):
 *   POST /__control/events { action: 'add', username, href, icsText } | { action: 'delete', username, href }
 *   POST /__control/password { username, password } — changes what Basic auth must present for
 *     that username (defaults to 'app-password', matching the IMAP mock's fixed password); lets a
 *     test drive a wrong-password reconnect without a second mock username.
 */
export function createCalDavMockApp(): Hono {
  const app = new Hono();

  const fakes = new Map<string, CalDavFake>();
  const passwords = new Map<string, string>();

  function calendarUrl(username: string): string {
    return `/dav/calendars/${encodeURIComponent(username)}/personal/`;
  }

  function fakeFor(username: string): CalDavFake {
    let fake = fakes.get(username);
    if (!fake) {
      fake = new CalDavFake({
        calendars: [{ id: calendarUrl(username), name: 'Personal', isPrimary: true }],
      });
      fakes.set(username, fake);
    }
    return fake;
  }

  /** Basic auth -> { username, ok }; `ok` is false for a missing/malformed header, an unknown
   * username's wrong password, or a known username whose password (via /__control/password or the
   * 'app-password' default) doesn't match. */
  function checkAuth(c: Context): { username: string; ok: boolean } {
    const header = c.req.header('authorization') ?? '';
    const match = /^Basic\s+(.+)$/i.exec(header);
    if (!match) return { username: '', ok: false };
    let decoded: string;
    try {
      decoded = atob(match[1]!);
    } catch {
      return { username: '', ok: false };
    }
    const sep = decoded.indexOf(':');
    if (sep === -1) return { username: '', ok: false };
    const username = decoded.slice(0, sep);
    const password = decoded.slice(sep + 1);
    const expected = passwords.get(username) ?? 'app-password';
    return { username, ok: password === expected };
  }

  function multistatus(body: string): Response {
    return new Response(
      `<?xml version="1.0" encoding="utf-8"?><D:multistatus xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav" xmlns:CS="http://calendarserver.org/ns/">${body}</D:multistatus>`,
      { status: 207, headers: { 'content-type': 'application/xml; charset=utf-8' } },
    );
  }

  function unauthorized(): Response {
    return new Response(
      '<?xml version="1.0" encoding="utf-8"?><D:error xmlns:D="DAV:"><D:valid-password/></D:error>',
      { status: 401, headers: { 'content-type': 'application/xml; charset=utf-8' } },
    );
  }

  app.on('PROPFIND', '/dav/', (c) => {
    const { username, ok } = checkAuth(c);
    if (!ok) return unauthorized();
    return multistatus(
      `<D:response><D:href>/dav/</D:href><D:propstat><D:prop>` +
        `<D:current-user-principal><D:href>/dav/principals/${encodeURIComponent(username)}/</D:href></D:current-user-principal>` +
        `</D:prop><D:status>HTTP/1.1 200 OK</D:status></D:propstat></D:response>`,
    );
  });

  app.on('PROPFIND', '/dav/principals/:username/', (c) => {
    const { ok } = checkAuth(c);
    if (!ok) return unauthorized();
    const username = decodeURIComponent(c.req.param('username'));
    return multistatus(
      `<D:response><D:href>/dav/principals/${encodeURIComponent(username)}/</D:href><D:propstat><D:prop>` +
        `<C:calendar-home-set><D:href>/dav/calendars/${encodeURIComponent(username)}/</D:href></C:calendar-home-set>` +
        `</D:prop><D:status>HTTP/1.1 200 OK</D:status></D:propstat></D:response>`,
    );
  });

  app.on('PROPFIND', '/dav/calendars/:username/', (c) => {
    const { ok } = checkAuth(c);
    if (!ok) return unauthorized();
    const username = decodeURIComponent(c.req.param('username'));
    const fake = fakeFor(username);
    return multistatus(
      `<D:response><D:href>/dav/calendars/${encodeURIComponent(username)}/</D:href><D:propstat><D:prop>` +
        `<D:resourcetype><D:collection/></D:resourcetype><D:displayname>${username}</D:displayname>` +
        `</D:prop><D:status>HTTP/1.1 200 OK</D:status></D:propstat></D:response>` +
        `<D:response><D:href>${calendarUrl(username)}</D:href><D:propstat><D:prop>` +
        `<D:resourcetype><D:collection/><C:calendar/></D:resourcetype><D:displayname>Personal</D:displayname>` +
        `<C:supported-calendar-component-set><C:comp name="VEVENT"/></C:supported-calendar-component-set>` +
        `<CS:getctag>"${fake.currentCtag(calendarUrl(username))}"</CS:getctag>` +
        `</D:prop><D:status>HTTP/1.1 200 OK</D:status></D:propstat></D:response>`,
    );
  });

  app.on('PROPFIND', '/dav/calendars/:username/personal/', (c) => {
    const { ok } = checkAuth(c);
    if (!ok) return unauthorized();
    const username = decodeURIComponent(c.req.param('username'));
    const fake = fakeFor(username);
    return multistatus(
      `<D:response><D:href>${calendarUrl(username)}</D:href><D:propstat><D:prop>` +
        `<CS:getctag>"${fake.currentCtag(calendarUrl(username))}"</CS:getctag>` +
        `</D:prop><D:status>HTTP/1.1 200 OK</D:status></D:propstat></D:response>`,
    );
  });

  app.on('REPORT', '/dav/calendars/:username/personal/', (c) => {
    const { ok } = checkAuth(c);
    if (!ok) return unauthorized();
    const username = decodeURIComponent(c.req.param('username'));
    const fake = fakeFor(username);
    const url = calendarUrl(username);
    const responses = fake
      .rawResources(url)
      .map(
        ([href, icsText]) =>
          `<D:response><D:href>${escapeXml(href)}</D:href><D:propstat><D:prop>` +
          `<D:getetag>"${href}"</D:getetag><C:calendar-data>${escapeXml(icsText)}</C:calendar-data>` +
          `</D:prop><D:status>HTTP/1.1 200 OK</D:status></D:propstat></D:response>`,
      )
      .join('');
    return multistatus(responses);
  });

  app.post('/__control/events', async (c) => {
    const body = await c.req.json<
      | { action: 'add'; username: string; href: string; icsText: string }
      | { action: 'delete'; username: string; href: string }
    >();
    const fake = fakeFor(body.username);
    const url = calendarUrl(body.username);
    if (body.action === 'add') {
      fake.addEvent(url, body.href, body.icsText);
    } else if (body.action === 'delete') {
      fake.deleteEvent(url, body.href);
    } else {
      return c.json({ error: 'unknown action' }, 400);
    }
    return c.json({ ok: true });
  });

  app.post('/__control/password', async (c) => {
    const body = await c.req.json<{ username: string; password: string }>();
    passwords.set(body.username, body.password);
    return c.json({ ok: true });
  });

  return app;
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
