import { describe, expect, it } from 'vitest';
import { GoogleFake } from '@desk/connectors/google/fake';
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
