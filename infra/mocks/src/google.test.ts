import { describe, expect, it } from 'vitest';
import { GoogleFake } from '@desk/connectors/google/fake';
import { createGmailSource } from '@desk/connectors/google/gmail';
import { createGoogleMockApp } from './google.js';

const json = async (res: Response) => (await res.json()) as Record<string, unknown>;

describe('createGoogleMockApp', () => {
  it('lists the seeded calendar', async () => {
    const app = createGoogleMockApp();
    const res = await app.request('/calendar/v3/users/me/calendarList');
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body['items']).toEqual([{ id: 'primary', summary: 'Primary', primary: true }]);
  });

  it('control add: an event added via the control route appears in events.list', async () => {
    const app = createGoogleMockApp();
    const addRes = await app.request('/__control/events', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        action: 'add',
        calendarId: 'primary',
        event: { id: 'evt-1', summary: 'Standup', start: { dateTime: '2026-09-28T09:00:00Z' } },
      }),
    });
    expect(addRes.status).toBe(200);

    const listRes = await app.request('/calendar/v3/calendars/primary/events');
    const body = await json(listRes);
    expect(body['items']).toEqual([
      { id: 'evt-1', summary: 'Standup', start: { dateTime: '2026-09-28T09:00:00Z' } },
    ]);
  });

  it('control delete: a deleted event is gone from events.list', async () => {
    const fake = new GoogleFake({
      calendars: [{ id: 'primary', summary: 'Primary', primary: true }],
      items: { primary: [{ id: 'evt-1', summary: 'Standup' }] },
    });
    const app = createGoogleMockApp(fake);

    const delRes = await app.request('/__control/events', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'delete', calendarId: 'primary', eventId: 'evt-1' }),
    });
    expect(delRes.status).toBe(200);

    const listRes = await app.request('/calendar/v3/calendars/primary/events');
    const body = await json(listRes);
    expect(body['items']).toEqual([]);
  });

  it('revoke: the token endpoint answers invalid_grant afterwards', async () => {
    const app = createGoogleMockApp();

    const beforeRes = await app.request('/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=refresh_token&refresh_token=rt',
    });
    expect(beforeRes.status).toBe(200);

    const revokeRes = await app.request('/__control/revoke', { method: 'POST' });
    expect(revokeRes.status).toBe(200);

    const afterRes = await app.request('/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=refresh_token&refresh_token=rt',
    });
    expect(afterRes.status).toBe(400);
    const body = await json(afterRes);
    expect(body).toEqual({ error: 'invalid_grant' });
  });

  it('revoke: calendarList also answers 401 afterwards', async () => {
    const app = createGoogleMockApp();
    await app.request('/__control/revoke', { method: 'POST' });
    const res = await app.request('/calendar/v3/users/me/calendarList');
    expect(res.status).toBe(401);
  });

  it('the authorize route redirects to redirect_uri with a code and the same state', async () => {
    const app = createGoogleMockApp();
    const res = await app.request(
      '/o/oauth2/v2/auth?redirect_uri=' +
        encodeURIComponent('http://app.example.test/connections/google/callback') +
        '&state=abc123',
      { redirect: 'manual' },
    );
    expect(res.status).toBe(302);
    const location = new URL(res.headers.get('location')!);
    expect(location.origin + location.pathname).toBe(
      'http://app.example.test/connections/google/callback',
    );
    expect(location.searchParams.get('code')).toBe('fake-google-auth-code:default');
    expect(location.searchParams.get('state')).toBe('abc123');
  });

  it('an incremental fetch (syncToken) omits a deleted event from items but reports it via a full refetch omission', async () => {
    const fake = new GoogleFake({
      calendars: [{ id: 'primary', summary: 'Primary', primary: true }],
      items: { primary: [{ id: 'evt-1', summary: 'Standup' }] },
    });
    const app = createGoogleMockApp(fake);

    const first = await json(await app.request('/calendar/v3/calendars/primary/events'));
    const syncToken = first['nextSyncToken'] as string;

    await app.request('/__control/events', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'delete', calendarId: 'primary', eventId: 'evt-1' }),
    });

    const incremental = await json(
      await app.request(`/calendar/v3/calendars/primary/events?syncToken=${syncToken}`),
    );
    expect(incremental['items']).toEqual([
      { id: 'evt-1', summary: 'Standup', status: 'cancelled' },
    ]);

    const full = await json(await app.request('/calendar/v3/calendars/primary/events'));
    expect(full['items']).toEqual([]);
  });

  it("isolation: two connected accounts never see each other's events, and revoking one leaves the other usable", async () => {
    const app = createGoogleMockApp();

    await app.request('/__control/next-account', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ key: 'account-a' }),
    });
    const authA = await app.request(
      '/o/oauth2/v2/auth?redirect_uri=' +
        encodeURIComponent('http://app.example.test/callback') +
        '&state=s',
      { redirect: 'manual' },
    );
    const codeA = new URL(authA.headers.get('location')!).searchParams.get('code')!;
    const tokenA = await json(
      await app.request('/token', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: `grant_type=authorization_code&code=${codeA}`,
      }),
    );

    await app.request('/__control/next-account', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ key: 'account-b' }),
    });
    const authB = await app.request(
      '/o/oauth2/v2/auth?redirect_uri=' +
        encodeURIComponent('http://app.example.test/callback') +
        '&state=s',
      { redirect: 'manual' },
    );
    const codeB = new URL(authB.headers.get('location')!).searchParams.get('code')!;
    const tokenB = await json(
      await app.request('/token', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: `grant_type=authorization_code&code=${codeB}`,
      }),
    );

    await app.request('/__control/events', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        action: 'add',
        calendarId: 'primary',
        event: { id: 'evt-a', summary: 'Only in A' },
        key: 'account-a',
      }),
    });

    const listA = await json(
      await app.request('/calendar/v3/calendars/primary/events', {
        headers: { Authorization: `Bearer ${tokenA['access_token']}` },
      }),
    );
    const listB = await json(
      await app.request('/calendar/v3/calendars/primary/events', {
        headers: { Authorization: `Bearer ${tokenB['access_token']}` },
      }),
    );
    expect(listA['items']).toEqual([{ id: 'evt-a', summary: 'Only in A' }]);
    expect(listB['items']).toEqual([]);

    await app.request('/__control/revoke', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ key: 'account-a' }),
    });

    const revokedA = await app.request('/calendar/v3/users/me/calendarList', {
      headers: { Authorization: `Bearer ${tokenA['access_token']}` },
    });
    expect(revokedA.status).toBe(401);

    const stillOkB = await app.request('/calendar/v3/users/me/calendarList', {
      headers: { Authorization: `Bearer ${tokenB['access_token']}` },
    });
    expect(stillOkB.status).toBe(200);
  });

  it('the token endpoint returns a decodable id_token carrying an email', async () => {
    const app = createGoogleMockApp();
    const res = await app.request('/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=authorization_code&code=fake-google-auth-code',
    });
    expect(res.status).toBe(200);
    const body = await json(res);
    const idToken = body['id_token'] as string;
    const payload = JSON.parse(Buffer.from(idToken.split('.')[1]!, 'base64url').toString()) as {
      email: string;
    };
    expect(payload.email).toBe('mock-google-user@example.test');
    expect(body['scope']).toContain('calendar.readonly');
  });
});

// T052: createGmailSource (the real client) driven against this mock over Hono's app.request(),
// proving google.ts's Gmail routes match messages.list/messages.get/history.list/labels/profile.
describe('createGoogleMockApp: Gmail (T052)', () => {
  function sourceFor(app: ReturnType<typeof createGoogleMockApp>) {
    return createGmailSource({
      clientId: 'test-id',
      clientSecret: 'test-secret',
      apiBase: 'http://mock',
      oauthEndpoints: { token: '/token' },
      fetchImpl: ((url: string | URL, init?: RequestInit) =>
        app.request(String(url), init)) as unknown as typeof fetch,
    });
  }

  it('control add: a message added via the control route appears in a full fetchInbox', async () => {
    const app = createGoogleMockApp();
    const source = sourceFor(app);

    await app.request('/__control/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        action: 'add',
        message: {
          id: 'msg-1',
          labelIds: ['INBOX', 'UNREAD'],
          snippet: 'Hello there',
          internalDate: '1700000000000',
          payload: {
            headers: [
              { name: 'From', value: 'A <a@example.test>' },
              { name: 'Subject', value: 'Hi' },
            ],
          },
        },
      }),
    });

    const result = await source.fetchInbox({ refreshToken: 'rt' }, 10);
    expect(result.full).toBe(true);
    expect(result.messages.map((m) => m.providerMessageId)).toEqual(['msg-1']);
    expect(result.messages[0]!.unread).toBe(true);
    expect(result.unreadTotal).toBe(1);
  });

  it('markRead drops unread from unreadTotal and from the message itself', async () => {
    const app = createGoogleMockApp();
    const source = sourceFor(app);

    await app.request('/__control/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        action: 'add',
        message: {
          id: 'msg-1',
          labelIds: ['INBOX', 'UNREAD'],
          snippet: 'Hello',
          internalDate: '1700000000000',
          payload: {
            headers: [
              { name: 'From', value: 'a@example.test' },
              { name: 'Subject', value: 'Hi' },
            ],
          },
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
    expect(result.unreadTotal).toBe(0);
  });

  it('an incremental fetch (cursor) only returns the newly added message', async () => {
    const app = createGoogleMockApp();
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
          labelIds: ['INBOX'],
          snippet: 'Second',
          internalDate: '1700000001000',
          payload: {
            headers: [
              { name: 'From', value: 'b@example.test' },
              { name: 'Subject', value: 'Second' },
            ],
          },
        },
      }),
    });

    const second = await source.fetchInbox({ refreshToken: 'rt' }, 10, cursor);
    expect(second.full).toBe(false);
    expect(second.messages.map((m) => m.providerMessageId)).toEqual(['msg-2']);
  });

  it('isolation: an account key sees only its own messages', async () => {
    const app = createGoogleMockApp();

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
          labelIds: ['INBOX'],
          snippet: 'Only in A',
          internalDate: '1700000000000',
          payload: {
            headers: [
              { name: 'From', value: 'a@example.test' },
              { name: 'Subject', value: 'A' },
            ],
          },
        },
      }),
    });

    const authA = await app.request(
      '/o/oauth2/v2/auth?redirect_uri=' +
        encodeURIComponent('http://app.example.test/callback') +
        '&state=s',
      { redirect: 'manual' },
    );
    const codeA = new URL(authA.headers.get('location')!).searchParams.get('code')!;
    const tokenA = await json(
      await app.request('/token', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: `grant_type=authorization_code&code=${codeA}`,
      }),
    );
    const refreshTokenA = tokenA['refresh_token'] as string;

    const sourceA = createGmailSource({
      clientId: 'test-id',
      clientSecret: 'test-secret',
      apiBase: 'http://mock',
      oauthEndpoints: { token: '/token' },
      fetchImpl: ((url: string | URL, init?: RequestInit) =>
        app.request(String(url), init)) as unknown as typeof fetch,
    });
    const resultA = await sourceA.fetchInbox({ refreshToken: refreshTokenA }, 10);
    expect(resultA.messages.map((m) => m.providerMessageId)).toEqual(['msg-a']);

    const sourceDefault = sourceFor(app);
    const resultDefault = await sourceDefault.fetchInbox({ refreshToken: 'rt' }, 10);
    expect(resultDefault.messages).toEqual([]);
  });
});
