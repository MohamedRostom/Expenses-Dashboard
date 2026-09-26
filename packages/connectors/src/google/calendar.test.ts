import { describe, expect, it, vi } from 'vitest';
import { createGoogleCalendarSource } from './calendar.js';
import { GoogleFake } from './fake.js';
import { AuthError, RateLimited } from '../panels/index.js';
import calendarListFixture from './fixtures/calendar/calendarList.json';
import eventsFullFixture from './fixtures/calendar/events-full.json';
import eventsIncrementalFixture from './fixtures/calendar/events-incremental.json';
import error410Fixture from './fixtures/calendar/error-410.json';
import error401Fixture from './fixtures/calendar/error-401.json';
import error429Fixture from './fixtures/calendar/error-429.json';

describe('Google Calendar Source', () => {
  describe('contract test: real client vs fake', () => {
    it('follows nextPageToken and takes the cursor from the last page', async () => {
      const [first, ...rest] = eventsFullFixture.items;
      const pages: Record<string, unknown> = {
        page1: { items: [first], nextPageToken: 'p2' },
        page2: { items: rest, nextSyncToken: 'sync-last' },
      };
      const urls: string[] = [];
      const fetchImpl = vi.fn(async (url: string) => {
        if (url.includes('/token')) {
          return new Response(JSON.stringify({ access_token: 'at' }), { status: 200 });
        }
        urls.push(url);
        const body = url.includes('pageToken=p2') ? pages.page2 : pages.page1;
        return new Response(JSON.stringify(body), { status: 200 });
      }) as unknown as typeof fetch;
      const source = createGoogleCalendarSource({
        clientId: 'test-id',
        clientSecret: 'test-secret',
        apiBase: 'https://www.googleapis.com',
        fetchImpl,
      });

      const result = await source.fetchWindow(
        { refreshToken: 'rt-test' },
        ['primary-cal@example.test'],
        new Date('2026-10-01T00:00:00Z'),
        new Date('2026-10-16T00:00:00Z'),
      );

      expect(urls).toHaveLength(2);
      expect(result.cursor).toBe('sync-last');
      expect(result.full).toBe(true);
      expect(result.events.map((e) => e.providerEventId).sort()).toEqual(
        eventsFullFixture.items.map((i) => i.id).sort(),
      );
    });

    it('lists calendars', async () => {
      const fetchImpl = vi.fn(async (url: string) => {
        if (url.includes('oauth2.googleapis.com') || url.includes('/token')) {
          return new Response(JSON.stringify({ access_token: 'at' }), { status: 200 });
        }
        if (url.includes('/calendarList')) {
          return new Response(JSON.stringify(calendarListFixture), { status: 200 });
        }
        return new Response('', { status: 404 });
      }) as unknown as typeof fetch;

      const source = createGoogleCalendarSource({
        clientId: 'test-id',
        clientSecret: 'test-secret',
        apiBase: 'https://www.googleapis.com',
        fetchImpl,
      });

      const cred = { refreshToken: 'rt-test' };
      const calendars = await source.listCalendars(cred);

      expect(calendars).toHaveLength(2);
      expect(calendars[0]).toEqual({
        id: 'primary-cal@example.test',
        name: 'Primary Calendar',
        isPrimary: true,
        colour: '#1f6e5a',
      });
      expect(calendars[1]).toEqual({
        id: 'cal-work',
        name: 'Work Calendar',
        isPrimary: false,
        colour: '#5fbf9f',
      });
    });

    it('fetches events from full window, maps correctly', async () => {
      const tokenFetch = vi.fn(
        async () => new Response(JSON.stringify({ access_token: 'at' }), { status: 200 }),
      );

      const eventsFetch = vi.fn(async (url: string) => {
        if (url.includes('/calendarList')) {
          return new Response(JSON.stringify(calendarListFixture), { status: 200 });
        }
        if (url.includes('/events')) {
          return new Response(JSON.stringify(eventsFullFixture), { status: 200 });
        }
        return new Response('', { status: 404 });
      });

      const fetchImpl = vi.fn(async (url: string) => {
        if (url.includes('oauth2.googleapis.com') || url.includes('/token')) {
          return tokenFetch();
        }
        return eventsFetch(url);
      }) as unknown as typeof fetch;

      const source = createGoogleCalendarSource({
        clientId: 'test-id',
        clientSecret: 'test-secret',
        apiBase: 'https://www.googleapis.com',
        fetchImpl,
      });

      const fake = new GoogleFake({
        calendars: calendarListFixture.items,
        items: { 'primary-cal@example.test': eventsFullFixture.items },
      });

      const cred = { refreshToken: 'rt-test' };
      const from = new Date('2026-10-01T00:00:00Z');
      const to = new Date('2026-10-16T00:00:00Z');

      const realResult = await source.fetchWindow(cred, ['primary-cal@example.test'], from, to);
      const fakeResult = await fake.fetchWindow(cred, ['primary-cal@example.test'], from, to);

      // Sort by providerEventId for consistent comparison
      const realSorted = [...realResult.events].sort((a, b) =>
        a.providerEventId.localeCompare(b.providerEventId),
      );
      const fakeSorted = [...fakeResult.events].sort((a, b) =>
        a.providerEventId.localeCompare(b.providerEventId),
      );

      expect(realSorted).toEqual(fakeSorted);
    });

    it('maps recurring events to distinct occurrences', async () => {
      const fake = new GoogleFake({
        calendars: calendarListFixture.items,
        items: { 'primary-cal@example.test': eventsFullFixture.items },
      });

      const cred = { refreshToken: 'rt-test' };
      const from = new Date('2026-10-01T00:00:00Z');
      const to = new Date('2026-10-20T00:00:00Z');

      const result = await fake.fetchWindow(cred, ['primary-cal@example.test'], from, to);

      const recurringIds = result.events
        .filter((e) => e.title === 'Recurring Meeting')
        .map((e) => e.providerEventId);

      expect(recurringIds).toHaveLength(3);
      expect(new Set(recurringIds).size).toBe(3); // All unique
    });

    it('maps all-day events with UTC midnight times', async () => {
      const fake = new GoogleFake({
        calendars: calendarListFixture.items,
        items: { 'primary-cal@example.test': eventsFullFixture.items },
      });

      const cred = { refreshToken: 'rt-test' };
      const from = new Date('2026-10-01T00:00:00Z');
      const to = new Date('2026-10-20T00:00:00Z');

      const result = await fake.fetchWindow(cred, ['primary-cal@example.test'], from, to);

      const allDayEvent = result.events.find((e) => e.title === 'Two Day Event');

      expect(allDayEvent).toBeDefined();
      expect(allDayEvent!.allDay).toBe(true);
      expect(allDayEvent!.startsAt).toEqual(new Date('2026-10-05T00:00:00Z'));
      expect(allDayEvent!.endsAt).toEqual(new Date('2026-10-07T00:00:00Z'));
    });

    it('maps attendee responses to tentative/declined', async () => {
      const fake = new GoogleFake({
        calendars: calendarListFixture.items,
        items: { 'primary-cal@example.test': eventsFullFixture.items },
      });

      const cred = { refreshToken: 'rt-test' };
      const from = new Date('2026-10-01T00:00:00Z');
      const to = new Date('2026-10-20T00:00:00Z');

      const result = await fake.fetchWindow(cred, ['primary-cal@example.test'], from, to);

      const needsAction = result.events.find(
        (e) => e.providerEventId === 'evt-rec_20261001T090000Z',
      );
      expect(needsAction).toBeDefined();
      expect(needsAction!.tentative).toBe(true);
      expect(needsAction!.declined).toBe(false);

      const tentative = result.events.find((e) => e.providerEventId === 'evt-rec_20261008T090000Z');
      expect(tentative).toBeDefined();
      expect(tentative!.tentative).toBe(true);
      expect(tentative!.declined).toBe(false);

      const declined = result.events.find((e) => e.providerEventId === 'evt-rec_20261015T090000Z');
      expect(declined).toBeDefined();
      expect(declined!.tentative).toBe(false);
      expect(declined!.declined).toBe(true);

      const accepted = result.events.find((e) => e.providerEventId === 'evt-accepted');
      expect(accepted).toBeDefined();
      expect(accepted!.tentative).toBe(false);
      expect(accepted!.declined).toBe(false);

      const noAttendees = result.events.find((e) => e.providerEventId === 'evt-no-attendees');
      expect(noAttendees).toBeDefined();
      expect(noAttendees!.tentative).toBe(false);
      expect(noAttendees!.declined).toBe(false);
    });

    it('fetches with cursor uses syncToken and does not include timeMin/timeMax', async () => {
      const tokenFetch = vi.fn(
        async () => new Response(JSON.stringify({ access_token: 'at' }), { status: 200 }),
      );

      const eventsFetch = vi.fn(async (url: string) => {
        // Verify syncToken is in URL and timeMin/timeMax are not
        if (url.includes('syncToken=sync-1')) {
          expect(url).not.toContain('timeMin');
          expect(url).not.toContain('timeMax');
          return new Response(JSON.stringify(eventsIncrementalFixture), { status: 200 });
        }
        return new Response('', { status: 404 });
      });

      const fetchImpl = vi.fn(async (url: string) => {
        if (url.includes('oauth2.googleapis.com') || url.includes('/token')) {
          return tokenFetch();
        }
        return eventsFetch(url);
      }) as unknown as typeof fetch;

      const source = createGoogleCalendarSource({
        clientId: 'test-id',
        clientSecret: 'test-secret',
        apiBase: 'https://www.googleapis.com',
        fetchImpl,
      });

      const cred = { refreshToken: 'rt-test' };
      const from = new Date('2026-10-01T00:00:00Z');
      const to = new Date('2026-10-16T00:00:00Z');

      const result = await source.fetchWindow(
        cred,
        ['primary-cal@example.test'],
        from,
        to,
        'sync-1',
      );

      expect(result.full).toBe(false);
      expect(result.cursor).toBe('sync-2');
      expect(result.events).toHaveLength(1);
      expect(result.deletedIds).toEqual(['evt-rec_20261001T090000Z']);
    });

    it('410 on cursor retries full, sets full: true', async () => {
      const tokenFetch = vi.fn(
        async () => new Response(JSON.stringify({ access_token: 'at' }), { status: 200 }),
      );

      let callCount = 0;
      const eventsFetch = vi.fn(async (url: string) => {
        callCount++;
        if (callCount === 1 && url.includes('syncToken=sync-1')) {
          return new Response(JSON.stringify(error410Fixture), { status: 410 });
        }
        if (callCount === 2 && !url.includes('syncToken')) {
          return new Response(JSON.stringify(eventsFullFixture), { status: 200 });
        }
        return new Response('', { status: 404 });
      });

      const fetchImpl = vi.fn(async (url: string) => {
        if (url.includes('oauth2.googleapis.com') || url.includes('/token')) {
          return tokenFetch();
        }
        return eventsFetch(url);
      }) as unknown as typeof fetch;

      const source = createGoogleCalendarSource({
        clientId: 'test-id',
        clientSecret: 'test-secret',
        apiBase: 'https://www.googleapis.com',
        fetchImpl,
      });

      const cred = { refreshToken: 'rt-test' };
      const from = new Date('2026-10-01T00:00:00Z');
      const to = new Date('2026-10-16T00:00:00Z');

      const result = await source.fetchWindow(
        cred,
        ['primary-cal@example.test'],
        from,
        to,
        'sync-1',
      );

      expect(result.full).toBe(true);
      expect(result.cursor).toBe('sync-1');
    });

    it('401 throws AuthError', async () => {
      const tokenFetch = vi.fn(
        async () => new Response(JSON.stringify({ access_token: 'at' }), { status: 200 }),
      );

      const eventsFetch = vi.fn(
        async () => new Response(JSON.stringify(error401Fixture), { status: 401 }),
      );

      const fetchImpl = vi.fn(async (url: string) => {
        if (url.includes('oauth2.googleapis.com') || url.includes('/token')) {
          return tokenFetch();
        }
        return eventsFetch();
      }) as unknown as typeof fetch;

      const source = createGoogleCalendarSource({
        clientId: 'test-id',
        clientSecret: 'test-secret',
        apiBase: 'https://www.googleapis.com',
        fetchImpl,
      });

      const cred = { refreshToken: 'rt-test' };
      const from = new Date('2026-10-01T00:00:00Z');
      const to = new Date('2026-10-16T00:00:00Z');

      await expect(
        source.fetchWindow(cred, ['primary-cal@example.test'], from, to),
      ).rejects.toBeInstanceOf(AuthError);
    });

    it('429 throws RateLimited with retryAfterMs', async () => {
      const tokenFetch = vi.fn(
        async () => new Response(JSON.stringify({ access_token: 'at' }), { status: 200 }),
      );

      const eventsFetch = vi.fn(
        async () =>
          new Response(JSON.stringify(error429Fixture), {
            status: 429,
            headers: { 'Retry-After': '30' },
          }),
      );

      const fetchImpl = vi.fn(async (url: string) => {
        if (url.includes('oauth2.googleapis.com') || url.includes('/token')) {
          return tokenFetch();
        }
        return eventsFetch();
      }) as unknown as typeof fetch;

      const source = createGoogleCalendarSource({
        clientId: 'test-id',
        clientSecret: 'test-secret',
        apiBase: 'https://www.googleapis.com',
        fetchImpl,
      });

      const cred = { refreshToken: 'rt-test' };
      const from = new Date('2026-10-01T00:00:00Z');
      const to = new Date('2026-10-16T00:00:00Z');

      try {
        await source.fetchWindow(cred, ['primary-cal@example.test'], from, to);
        throw new Error('Should have thrown RateLimited');
      } catch (e) {
        expect(e).toBeInstanceOf(RateLimited);
        expect((e as RateLimited).retryAfterMs).toBe(30000);
      }
    });

    it('Authorization header is Bearer token', async () => {
      const tokenFetch = vi.fn(
        async () => new Response(JSON.stringify({ access_token: 'at' }), { status: 200 }),
      );

      let capturedAuthHeader: string | null = null;
      const eventsFetch = vi.fn(async (_: string, init?: RequestInit) => {
        capturedAuthHeader = (init?.headers as Record<string, string>)?.['Authorization'] || null;
        return new Response(JSON.stringify(eventsFullFixture), { status: 200 });
      });

      const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
        if (url.includes('oauth2.googleapis.com') || url.includes('/token')) {
          return tokenFetch();
        }
        return eventsFetch(url, init);
      }) as unknown as typeof fetch;

      const source = createGoogleCalendarSource({
        clientId: 'test-id',
        clientSecret: 'test-secret',
        apiBase: 'https://www.googleapis.com',
        fetchImpl,
      });

      const cred = { refreshToken: 'rt-test' };
      const from = new Date('2026-10-01T00:00:00Z');
      const to = new Date('2026-10-16T00:00:00Z');

      await source.fetchWindow(cred, ['primary-cal@example.test'], from, to);

      expect(capturedAuthHeader).toBe('Bearer at');
    });

    it('fake: addEvent includes it in results', async () => {
      const fake = new GoogleFake({
        calendars: calendarListFixture.items,
        items: { 'primary-cal@example.test': [] },
      });

      fake.addEvent('primary-cal@example.test', {
        id: 'new-evt',
        summary: 'New Event',
        start: { dateTime: '2026-10-10T10:00:00Z', timeZone: 'UTC' },
        end: { dateTime: '2026-10-10T11:00:00Z', timeZone: 'UTC' },
      });

      const cred = { refreshToken: 'rt-test' };
      const from = new Date('2026-10-01T00:00:00Z');
      const to = new Date('2026-10-20T00:00:00Z');

      const result = await fake.fetchWindow(cred, ['primary-cal@example.test'], from, to);

      expect(result.events).toHaveLength(1);
      expect(result.events[0]!.providerEventId).toBe('new-evt');
    });

    it('fake: deleteEvent removes it from results', async () => {
      const fake = new GoogleFake({
        calendars: calendarListFixture.items,
        items: { 'primary-cal@example.test': eventsFullFixture.items },
      });

      fake.deleteEvent('primary-cal@example.test', 'evt-rec_20261001T090000Z');

      const cred = { refreshToken: 'rt-test' };
      const from = new Date('2026-10-01T00:00:00Z');
      const to = new Date('2026-10-20T00:00:00Z');

      const result = await fake.fetchWindow(cred, ['primary-cal@example.test'], from, to);

      expect(
        result.events.find((e) => e.providerEventId === 'evt-rec_20261001T090000Z'),
      ).toBeUndefined();
    });

    it('fake: revoke causes AuthError on subsequent calls', async () => {
      const fake = new GoogleFake({
        calendars: calendarListFixture.items,
        items: { 'primary-cal@example.test': eventsFullFixture.items },
      });

      const cred = { refreshToken: 'rt-test' };
      await fake.revoke();

      const from = new Date('2026-10-01T00:00:00Z');
      const to = new Date('2026-10-20T00:00:00Z');

      await expect(
        fake.fetchWindow(cred, ['primary-cal@example.test'], from, to),
      ).rejects.toBeInstanceOf(AuthError);
    });
  });
});
