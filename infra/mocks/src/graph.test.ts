import { describe, expect, it } from 'vitest';
import { GraphFake } from '@desk/connectors/microsoft/fake';
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
    expect(location.searchParams.get('code')).toBe('fake-graph-auth-code');
    expect(location.searchParams.get('state')).toBe('xyz789');
  });
});
