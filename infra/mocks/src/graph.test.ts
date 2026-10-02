import { describe, expect, it } from 'vitest';
import { GraphFake } from '@desk/connectors/microsoft/fake';
import { createMicrosoftMailSource } from '@desk/connectors/microsoft/mail';
import { createGraphMockApp } from './graph.js';

const json = async (res: Response) => (await res.json()) as Record<string, unknown>;

describe('createGraphMockApp', () => {
  it('lists the seeded calendar', async () => {
    const app = createGraphMockApp();
    const res = await app.request('/v1.0/me/calendars');
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body['value']).toEqual([
      {
        id: 'primary-cal@example.test',
        name: 'Calendar',
        isDefaultCalendar: true,
        hexColor: '#1f6e5a',
      },
    ]);
  });

  it('control add: an event added via the control route appears in the calendar view', async () => {
    const app = createGraphMockApp();
    const addRes = await app.request('/__control/events', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        action: 'add',
        calendarId: 'primary-cal@example.test',
        event: { id: 'evt-1', subject: 'Standup', start: { dateTime: '2026-09-28T09:00:00' } },
      }),
    });
    expect(addRes.status).toBe(200);

    const listRes = await app.request(
      '/v1.0/me/calendars/primary-cal%40example.test/calendarView/delta?startDateTime=2026-09-28T00:00:00Z&endDateTime=2026-10-05T00:00:00Z',
    );
    const body = await json(listRes);
    expect(body['value']).toEqual([
      { id: 'evt-1', subject: 'Standup', start: { dateTime: '2026-09-28T09:00:00' } },
    ]);
    expect(typeof body['@odata.deltaLink']).toBe('string');
  });

  it('control delete: a deleted event is gone from the calendar view', async () => {
    const fake = new GraphFake({
      calendars: {
        'primary-cal@example.test': {
          id: 'primary-cal@example.test',
          name: 'Calendar',
          isDefaultCalendar: true,
          hexColor: '#1f6e5a',
        },
      },
      items: { 'primary-cal@example.test': [{ id: 'evt-1', subject: 'Standup' }] },
    });
    const app = createGraphMockApp(fake);

    const delRes = await app.request('/__control/events', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        action: 'delete',
        calendarId: 'primary-cal@example.test',
        eventId: 'evt-1',
      }),
    });
    expect(delRes.status).toBe(200);

    const listRes = await app.request(
      '/v1.0/me/calendars/primary-cal%40example.test/calendarView/delta',
    );
    const body = await json(listRes);
    expect(body['value']).toEqual([]);
  });

  it('revoke: the token endpoint answers invalid_grant afterwards', async () => {
    const app = createGraphMockApp();

    const beforeRes = await app.request('/common/oauth2/v2.0/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=refresh_token&refresh_token=rt',
    });
    expect(beforeRes.status).toBe(200);

    const revokeRes = await app.request('/__control/revoke', { method: 'POST' });
    expect(revokeRes.status).toBe(200);

    const afterRes = await app.request('/common/oauth2/v2.0/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=refresh_token&refresh_token=rt',
    });
    expect(afterRes.status).toBe(400);
    const body = await json(afterRes);
    expect(body).toEqual({ error: 'invalid_grant' });
  });

  it('revoke: /v1.0/me also answers 401 afterwards', async () => {
    const app = createGraphMockApp();
    await app.request('/__control/revoke', { method: 'POST' });
    const res = await app.request('/v1.0/me');
    expect(res.status).toBe(401);
  });

  it('the authorize route redirects to redirect_uri with a code and the same state', async () => {
    const app = createGraphMockApp();
    const res = await app.request(
      '/common/oauth2/v2.0/authorize?redirect_uri=' +
        encodeURIComponent('http://app.example.test/connections/microsoft/callback') +
        '&state=xyz789',
      { redirect: 'manual' },
    );
    expect(res.status).toBe(302);
    const location = new URL(res.headers.get('location')!);
    expect(location.origin + location.pathname).toBe(
      'http://app.example.test/connections/microsoft/callback',
    );
    expect(location.searchParams.get('code')).toBe('fake-graph-auth-code:default');
    expect(location.searchParams.get('state')).toBe('xyz789');
  });

  it('an incremental fetch (deltatoken) reports a deleted event as removed, a later full refetch omits it', async () => {
    const fake = new GraphFake({
      calendars: {
        'primary-cal@example.test': {
          id: 'primary-cal@example.test',
          name: 'Calendar',
          isDefaultCalendar: true,
          hexColor: '#1f6e5a',
        },
      },
      items: { 'primary-cal@example.test': [{ id: 'evt-1', subject: 'Standup' }] },
    });
    const app = createGraphMockApp(fake);

    const first = await json(
      await app.request('/v1.0/me/calendars/primary-cal%40example.test/calendarView/delta'),
    );
    const deltaLink = first['@odata.deltaLink'] as string;
    const deltaToken = new URL(deltaLink).searchParams.get('$deltatoken')!;

    await app.request('/__control/events', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        action: 'delete',
        calendarId: 'primary-cal@example.test',
        eventId: 'evt-1',
      }),
    });

    const incremental = await json(
      await app.request(
        `/v1.0/me/calendars/primary-cal%40example.test/calendarView/delta?$deltatoken=${deltaToken}`,
      ),
    );
    expect(incremental['value']).toEqual([
      { id: 'evt-1', subject: 'Standup', '@removed': { reason: 'deleted' } },
    ]);

    const full = await json(
      await app.request('/v1.0/me/calendars/primary-cal%40example.test/calendarView/delta'),
    );
    expect(full['value']).toEqual([]);
  });

  it("isolation: two connected accounts never see each other's events, and revoking one leaves the other usable", async () => {
    const app = createGraphMockApp();

    async function connectAccount(key: string): Promise<Record<string, unknown>> {
      await app.request('/__control/next-account', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ key }),
      });
      const authRes = await app.request(
        '/common/oauth2/v2.0/authorize?redirect_uri=' +
          encodeURIComponent('http://app.example.test/callback') +
          '&state=s',
        { redirect: 'manual' },
      );
      const code = new URL(authRes.headers.get('location')!).searchParams.get('code')!;
      return json(
        await app.request('/common/oauth2/v2.0/token', {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: `grant_type=authorization_code&code=${code}`,
        }),
      );
    }

    const tokenA = await connectAccount('account-a');
    const tokenB = await connectAccount('account-b');

    await app.request('/__control/events', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        action: 'add',
        calendarId: 'primary-cal@example.test',
        event: { id: 'evt-a', subject: 'Only in A' },
        key: 'account-a',
      }),
    });

    const listA = await json(
      await app.request('/v1.0/me/calendars/primary-cal%40example.test/calendarView/delta', {
        headers: { Authorization: `Bearer ${tokenA['access_token']}` },
      }),
    );
    const listB = await json(
      await app.request('/v1.0/me/calendars/primary-cal%40example.test/calendarView/delta', {
        headers: { Authorization: `Bearer ${tokenB['access_token']}` },
      }),
    );
    expect(listA['value']).toEqual([{ id: 'evt-a', subject: 'Only in A' }]);
    expect(listB['value']).toEqual([]);

    await app.request('/__control/revoke', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ key: 'account-a' }),
    });

    const revokedA = await app.request('/v1.0/me', {
      headers: { Authorization: `Bearer ${tokenA['access_token']}` },
    });
    expect(revokedA.status).toBe(401);

    const stillOkB = await app.request('/v1.0/me', {
      headers: { Authorization: `Bearer ${tokenB['access_token']}` },
    });
    expect(stillOkB.status).toBe(200);
  });
});

// T052: createMicrosoftMailSource (the real client) driven against this mock over Hono's
// app.request(), proving graph.ts's mail delta route matches the exact path/params it fetches.
describe('createGraphMockApp: mail delta (T052)', () => {
  function sourceFor(app: ReturnType<typeof createGraphMockApp>) {
    return createMicrosoftMailSource({
      clientId: 'test-id',
      clientSecret: 'test-secret',
      apiBase: '',
      oauthEndpoints: { token: '/common/oauth2/v2.0/token' },
      fetchImpl: ((url: string, init?: RequestInit) =>
        app.request(url, init)) as unknown as typeof fetch,
    });
  }

  it('control add: a message added via the control route appears in a full fetchInbox', async () => {
    const app = createGraphMockApp(new GraphFake({ messages: [] }));
    const source = sourceFor(app);

    await app.request('/__control/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        action: 'add',
        message: {
          id: 'msg-1',
          subject: 'Hi',
          bodyPreview: 'Hello there',
          receivedDateTime: '2026-09-28T09:00:00Z',
          isRead: false,
          from: { emailAddress: { name: 'A', address: 'a@example.test' } },
        },
      }),
    });

    const result = await source.fetchInbox({ refreshToken: 'rt' }, 10);
    expect(result.full).toBe(true);
    expect(result.messages.map((m) => m.providerMessageId)).toEqual(['msg-1']);
    expect(result.messages[0]!.unread).toBe(true);
  });

  it('markRead flips unread to false', async () => {
    const app = createGraphMockApp(new GraphFake({ messages: [] }));
    const source = sourceFor(app);

    await app.request('/__control/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        action: 'add',
        message: {
          id: 'msg-1',
          subject: 'Hi',
          bodyPreview: 'Hello',
          receivedDateTime: '2026-09-28T09:00:00Z',
          isRead: false,
          from: { emailAddress: { address: 'a@example.test' } },
        },
      }),
    });
    await app.request('/__control/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'markRead', id: 'msg-1' }),
    });

    const result = await source.fetchInbox({ refreshToken: 'rt' }, 10);
    expect(result.messages[0]!.unread).toBe(false);
  });

  it('an incremental fetch (deltaLink cursor) only returns the newly added message', async () => {
    const app = createGraphMockApp(new GraphFake({ messages: [] }));
    const source = sourceFor(app);

    const first = await source.fetchInbox({ refreshToken: 'rt' }, 10);
    const cursor = first.cursor!;

    await app.request('/__control/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        action: 'add',
        message: {
          id: 'msg-2',
          subject: 'Second',
          bodyPreview: 'Second',
          receivedDateTime: '2026-09-28T10:00:00Z',
          isRead: false,
          from: { emailAddress: { address: 'b@example.test' } },
        },
      }),
    });

    const second = await source.fetchInbox({ refreshToken: 'rt' }, 10, cursor);
    expect(second.full).toBe(false);
    expect(second.messages.map((m) => m.providerMessageId)).toEqual(['msg-2']);
  });

  it("isolation: two connected accounts never see each other's messages", async () => {
    const app = createGraphMockApp(new GraphFake({ messages: [] }));

    await app.request('/__control/next-account', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ key: 'account-a' }),
    });
    await app.request('/__control/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        action: 'add',
        key: 'account-a',
        message: {
          id: 'msg-a',
          subject: 'Only in A',
          bodyPreview: 'Only in A',
          receivedDateTime: '2026-09-28T09:00:00Z',
          isRead: false,
          from: { emailAddress: { address: 'a@example.test' } },
        },
      }),
    });

    const authA = await app.request(
      '/common/oauth2/v2.0/authorize?redirect_uri=' +
        encodeURIComponent('http://app.example.test/callback') +
        '&state=s',
      { redirect: 'manual' },
    );
    const codeA = new URL(authA.headers.get('location')!).searchParams.get('code')!;
    const tokenA = await json(
      await app.request('/common/oauth2/v2.0/token', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: `grant_type=authorization_code&code=${codeA}`,
      }),
    );

    const sourceA = sourceFor(app);
    const resultA = await sourceA.fetchInbox(
      { refreshToken: tokenA['refresh_token'] as string },
      10,
    );
    expect(resultA.messages.map((m) => m.providerMessageId)).toEqual(['msg-a']);

    const sourceDefault = sourceFor(app);
    const resultDefault = await sourceDefault.fetchInbox({ refreshToken: 'rt' }, 10);
    expect(resultDefault.messages).toEqual([]);
  });
});
