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
    expect(location.searchParams.get('code')).toBe('fake-google-auth-code');
    expect(location.searchParams.get('state')).toBe('abc123');
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
