// T071: createCalDavSource (the real client, packages/connectors/src/caldav/client.ts) driven
// against infra/mocks/src/caldav.ts's Hono app in-process (fetchImpl = app.request, same pattern
// google.test.ts and graph.test.ts would use for an HTTP-only provider) — proving the mock speaks
// exactly the PROPFIND/REPORT wire format the real client sends and parses.
import { describe, expect, it } from 'vitest';
import { createCalDavSource, type CalDavCredential } from '@desk/connectors/caldav/client';
import { createCalDavMockApp } from './caldav.js';

describe('CalDAV mock (T071)', () => {
  function harness() {
    const app = createCalDavMockApp();
    const fetchImpl = ((input: string | URL, init?: RequestInit) =>
      app.request(input, init)) as unknown as typeof fetch;
    return { app, source: createCalDavSource({ fetchImpl }) };
  }

  function cred(username: string, password = 'app-password'): CalDavCredential {
    return { url: 'http://mocks.test/dav/', username, password };
  }

  // server.ts mounts the mock at /caldav; discovery hrefs must carry that prefix or the client
  // follows them to the origin root and finds nothing (seen in e2e-ci as "no calendar found").
  it('discovers the calendar through the /caldav mount the compose stack uses', async () => {
    const { Hono } = await import('hono');
    const server = new Hono().route('/caldav', createCalDavMockApp('/caldav'));
    const fetchImpl = ((input: string | URL, init?: RequestInit) =>
      server.request(input, init)) as unknown as typeof fetch;
    const source = createCalDavSource({ fetchImpl });
    const calendars = await source.listCalendars({
      url: 'http://mocks.test/caldav/dav/',
      username: 'alice@example.test',
      password: 'app-password',
    });
    expect(calendars.map((c) => [c.id, c.name])).toEqual([
      ['http://mocks.test/caldav/dav/calendars/alice%40example.test/personal/', 'Personal'],
    ]);
  });

  it('discovers one calendar per username, isolated from other usernames', async () => {
    const { source } = harness();
    const alice = await source.listCalendars(cred('alice@example.test'));
    const bob = await source.listCalendars(cred('bob@example.test'));
    expect(alice).toHaveLength(1);
    expect(alice[0]!.name).toBe('Personal');
    expect(bob).toHaveLength(1);
    expect(bob[0]!.id).not.toBe(alice[0]!.id);
  });

  it('verify succeeds with the right password, fails with the wrong one', async () => {
    const { source } = harness();
    await expect(source.verify(cred('alice@example.test'))).resolves.toBeUndefined();
    await expect(source.verify(cred('alice@example.test', 'wrong'))).rejects.toMatchObject({
      name: 'VerificationError',
      step: 'discovery',
    });
  });

  it('control add: an event added via the control route appears in fetchWindow, isolated per username', async () => {
    const { app, source } = harness();
    const calendars = await source.listCalendars(cred('alice@example.test'));
    const calendarId = calendars[0]!.id;

    const addRes = await app.request('/__control/events', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        action: 'add',
        username: 'alice@example.test',
        href: 'standup.ics',
        icsText:
          'BEGIN:VCALENDAR\nVERSION:2.0\nBEGIN:VEVENT\nUID:standup@example.test\nDTSTAMP:20261001T000000Z\nDTSTART:20261010T090000Z\nDTEND:20261010T093000Z\nSUMMARY:Standup\nEND:VEVENT\nEND:VCALENDAR\n',
      }),
    });
    expect(addRes.status).toBe(200);

    const from = new Date('2026-10-01T00:00:00Z');
    const to = new Date('2026-10-20T00:00:00Z');
    const aliceResult = await source.fetchWindow(
      cred('alice@example.test'),
      [calendarId],
      from,
      to,
    );
    expect(aliceResult.events).toHaveLength(1);
    expect(aliceResult.events[0]!.title).toBe('Standup');

    const bobCalendars = await source.listCalendars(cred('bob@example.test'));
    const bobResult = await source.fetchWindow(
      cred('bob@example.test'),
      [bobCalendars[0]!.id],
      from,
      to,
    );
    expect(bobResult.events).toHaveLength(0);
  });

  it('control delete: a deleted event is gone from fetchWindow', async () => {
    const { app, source } = harness();
    const calendarId = (await source.listCalendars(cred('alice@example.test')))[0]!.id;
    await app.request('/__control/events', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        action: 'add',
        username: 'alice@example.test',
        href: 'standup.ics',
        icsText:
          'BEGIN:VCALENDAR\nVERSION:2.0\nBEGIN:VEVENT\nUID:standup@example.test\nDTSTAMP:20261001T000000Z\nDTSTART:20261010T090000Z\nDTEND:20261010T093000Z\nSUMMARY:Standup\nEND:VEVENT\nEND:VCALENDAR\n',
      }),
    });

    const from = new Date('2026-10-01T00:00:00Z');
    const to = new Date('2026-10-20T00:00:00Z');
    const before = await source.fetchWindow(cred('alice@example.test'), [calendarId], from, to);
    expect(before.events).toHaveLength(1);

    const delRes = await app.request('/__control/events', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        action: 'delete',
        username: 'alice@example.test',
        href: 'standup.ics',
      }),
    });
    expect(delRes.status).toBe(200);

    const after = await source.fetchWindow(
      cred('alice@example.test'),
      [calendarId],
      from,
      to,
      before.cursor,
    );
    expect(after.full).toBe(true);
    expect(after.events).toHaveLength(0);
  });

  it('cursor: an unchanged calendar answers full: false on the next fetchWindow', async () => {
    const { source } = harness();
    const calendarId = (await source.listCalendars(cred('alice@example.test')))[0]!.id;
    const from = new Date('2026-10-01T00:00:00Z');
    const to = new Date('2026-10-20T00:00:00Z');

    const first = await source.fetchWindow(cred('alice@example.test'), [calendarId], from, to);
    const second = await source.fetchWindow(
      cred('alice@example.test'),
      [calendarId],
      from,
      to,
      first.cursor,
    );
    expect(second.full).toBe(false);
    expect(second.events).toHaveLength(0);
  });
});
