import { describe, expect, it, vi } from 'vitest';
import { createMicrosoftCalendarSource, toOccurrence, type MicrosoftRawEvent } from './calendar.js';
import { GraphFake } from './fake.js';
import { AuthError, ProviderError, RateLimited } from '../panels/index.js';
import calendarsFixture from './fixtures/calendar/calendars.json';
import page1 from './fixtures/calendar/view-full-page1.json';
import page2 from './fixtures/calendar/view-full-page2.json';
import deltaFixture from './fixtures/calendar/view-delta.json';
import syncStateNotFound from './fixtures/calendar/error-syncStateNotFound.json';

const API = 'https://graph.microsoft.com';
const CAL = 'primary-cal@example.test';
const FROM = new Date('2026-10-01T00:00:00Z');
const TO = new Date('2026-10-16T00:00:00Z');
const CURSOR = page2['@odata.deltaLink'];

type Route = (url: string) => Response | undefined;
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers });

/** Token endpoint rotates the refresh token, as Microsoft does on every exchange. */
function stub(route: Route) {
  const calls: { url: string; headers: Record<string, string> }[] = [];
  const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.includes('/oauth2/v2.0/token')) {
      return json({ access_token: 'at', refresh_token: 'rt-2' });
    }
    calls.push({ url, headers: (init?.headers ?? {}) as Record<string, string> });
    return route(url) ?? json({ error: { code: 'notFound' } }, 404);
  }) as unknown as typeof fetch;
  const source = createMicrosoftCalendarSource({
    clientId: 'client',
    clientSecret: 'secret',
    apiBase: API,
    fetchImpl,
  });
  return { source, calls };
}

const fullWindow: Route = (url) => {
  if (url.includes('skiptoken')) return json(page2);
  if (url.includes('/calendarView/delta?startDateTime')) return json(page1);
  return undefined;
};

const byId = <T extends { providerEventId: string }>(xs: T[]) =>
  [...xs].sort((a, b) => a.providerEventId.localeCompare(b.providerEventId));

const cred = { refreshToken: 'rt-1' };

describe('Microsoft calendar: real client against recorded fixtures', () => {
  it('lists calendars with the default one marked primary', async () => {
    const { source } = stub((url) =>
      url === `${API}/v1.0/me/calendars` ? json(calendarsFixture) : undefined,
    );
    expect(await source.listCalendars(cred)).toEqual([
      { id: CAL, name: 'Primary Calendar', isPrimary: true, colour: '#0078D4' },
      { id: 'cal-work', name: 'Work Calendar', isPrimary: false, colour: '#50E6FF' },
    ]);
  });

  it('full fetch follows nextLink, returns the deltaLink cursor and matches the fake', async () => {
    const { source, calls } = stub(fullWindow);

    const real = await source.fetchWindow(cred, [CAL], FROM, TO);
    const fake = await new GraphFake().fetchWindow(cred, [CAL], FROM, TO);

    expect(calls.map((c) => c.url)).toEqual([
      `${API}/v1.0/me/calendars/${encodeURIComponent(CAL)}/calendarView/delta?startDateTime=${encodeURIComponent(FROM.toISOString())}&endDateTime=${encodeURIComponent(TO.toISOString())}`,
      page1['@odata.nextLink'],
    ]);
    expect(real.full).toBe(true);
    expect(real.cursor).toBe(CURSOR);
    expect(real.events).toHaveLength(page1.value.length + page2.value.length);
    expect(byId(real.events)).toEqual(byId(fake.events));
  });

  it('sends Prefer outlook.timezone UTC and the bearer token on every Graph call', async () => {
    const { source, calls } = stub(fullWindow);
    await source.fetchWindow(cred, [CAL], FROM, TO);
    for (const c of calls) {
      expect(c.headers['Prefer']).toBe('outlook.timezone="UTC"');
      expect(c.headers['Authorization']).toBe('Bearer at');
    }
  });

  it('returns the rotated refresh token as rotatedCredential', async () => {
    const { source } = stub(fullWindow);
    const result = await source.fetchWindow(cred, [CAL], FROM, TO);
    expect(result.rotatedCredential).toEqual({ refreshToken: 'rt-2' });
  });

  it('maps the recurring series to three distinct occurrences', async () => {
    const { source } = stub(fullWindow);
    const { events } = await source.fetchWindow(cred, [CAL], FROM, TO);
    const recurring = events.filter((e) => e.providerEventId.startsWith('evt-rec_'));
    expect(recurring.map((e) => e.startsAt.toISOString())).toEqual([
      '2026-10-01T09:00:00.000Z',
      '2026-10-02T09:00:00.000Z',
      '2026-10-03T09:00:00.000Z',
    ]);
  });

  it('maps the two-day all-day event to UTC midnights, end exclusive', async () => {
    const { source } = stub(fullWindow);
    const { events } = await source.fetchWindow(cred, [CAL], FROM, TO);
    const allDay = events.find((e) => e.providerEventId === 'evt-allday-2d');
    expect(allDay).toMatchObject({
      allDay: true,
      startsAt: new Date('2026-10-04T00:00:00Z'),
      endsAt: new Date('2026-10-06T00:00:00Z'),
    });
  });

  it('maps the user response per providers.md', async () => {
    const { source } = stub(fullWindow);
    const { events } = await source.fetchWindow(cred, [CAL], FROM, TO);
    const flags = (id: string) => {
      const e = events.find((x) => x.providerEventId === id);
      return e && { tentative: e.tentative, declined: e.declined };
    };
    expect(flags('evt-tentative')).toEqual({ tentative: true, declined: false });
    expect(flags('evt-needsaction')).toEqual({ tentative: true, declined: false });
    expect(flags('evt-declined')).toEqual({ tentative: false, declined: true });
    expect(flags('evt-organizer')).toEqual({ tentative: false, declined: false });
    expect(flags('evt-no-attendees')).toEqual({ tentative: false, declined: false });
    expect(flags('evt-rec_20261001T090000Z')).toEqual({ tentative: false, declined: false });
  });

  it('incremental fetch GETs the stored deltaLink and reports removals', async () => {
    const { source, calls } = stub((url) => (url === CURSOR ? json(deltaFixture) : undefined));

    const result = await source.fetchWindow(cred, [CAL], FROM, TO, CURSOR);

    expect(calls.map((c) => c.url)).toEqual([CURSOR]);
    expect(result.full).toBe(false);
    expect(result.events.map((e) => e.providerEventId)).toEqual(['evt-delta-new']);
    expect(result.deletedIds).toEqual(['evt-to-remove']);
    expect(result.cursor).toBe(deltaFixture['@odata.deltaLink']);
  });

  it('syncStateNotFound on the cursor refetches the full window', async () => {
    const { source, calls } = stub((url) =>
      url === CURSOR ? json(syncStateNotFound, 400) : fullWindow(url),
    );

    const result = await source.fetchWindow(cred, [CAL], FROM, TO, CURSOR);

    expect(calls[0]!.url).toBe(CURSOR);
    expect(calls[1]!.url).toContain('/calendarView/delta?startDateTime=');
    expect(result.full).toBe(true);
    expect(result.cursor).toBe(CURSOR);
  });

  it('410 on the cursor refetches the full window', async () => {
    const { source } = stub((url) => (url === CURSOR ? json({}, 410) : fullWindow(url)));
    const result = await source.fetchWindow(cred, [CAL], FROM, TO, CURSOR);
    expect(result.full).toBe(true);
    expect(result.events).toHaveLength(page1.value.length + page2.value.length);
  });

  it('401 throws AuthError', async () => {
    const { source } = stub(() => json({ error: { code: 'InvalidAuthenticationToken' } }, 401));
    await expect(source.fetchWindow(cred, [CAL], FROM, TO)).rejects.toBeInstanceOf(AuthError);
  });

  it('429 throws RateLimited with Retry-After in milliseconds', async () => {
    const { source } = stub(() => json({}, 429, { 'Retry-After': '30' }));
    const err = await source.fetchWindow(cred, [CAL], FROM, TO).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RateLimited);
    expect((err as RateLimited).retryAfterMs).toBe(30_000);
  });

  it('other failures throw ProviderError carrying only the status', async () => {
    const { source } = stub(() => json({ error: { message: 'secret detail' } }, 503));
    const err = await source.fetchWindow(cred, [CAL], FROM, TO).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect((err as Error).message).toBe('graph calendar 503');
  });
});

describe('toOccurrence', () => {
  const base: MicrosoftRawEvent = {
    id: 'evt-x',
    subject: '',
    start: { dateTime: '2026-10-01T09:00:00.0000000', timeZone: 'UTC' },
    end: { dateTime: '2026-10-01T10:00:00.0000000', timeZone: 'UTC' },
    isAllDay: false,
  };

  it('keeps an empty subject as an empty title and reads location and link', () => {
    const occ = toOccurrence(
      { ...base, location: { displayName: 'Room A' }, webLink: 'https://outlook.test/x' },
      'cal-1',
    );
    expect(occ).toMatchObject({ title: '', location: 'Room A', link: 'https://outlook.test/x' });
  });

  it('parses Graph UTC dateTimes without a zone suffix as UTC', () => {
    const occ = toOccurrence(base, 'cal-1');
    expect(occ.startsAt.toISOString()).toBe('2026-10-01T09:00:00.000Z');
    expect(occ.endsAt.toISOString()).toBe('2026-10-01T10:00:00.000Z');
  });
});

describe('GraphFake', () => {
  it('adds and deletes events', async () => {
    const fake = new GraphFake();
    fake.addEvent(CAL, { ...page2.value[0]!, id: 'evt-added' } as MicrosoftRawEvent);
    let ids = (await fake.fetchWindow(cred, [CAL], FROM, TO)).events.map((e) => e.providerEventId);
    expect(ids).toContain('evt-added');

    fake.deleteEvent(CAL, 'evt-added');
    ids = (await fake.fetchWindow(cred, [CAL], FROM, TO)).events.map((e) => e.providerEventId);
    expect(ids).not.toContain('evt-added');
  });

  it('deleteEvent tombstones — an incremental fetch reports the removal, a later full fetch omits it', async () => {
    const fake = new GraphFake();
    fake.addEvent(CAL, { ...page1.value[0]!, id: 'evt-tomb' } as MicrosoftRawEvent);

    const first = await fake.fetchWindow(cred, [CAL], FROM, TO);
    expect(first.events.map((e) => e.providerEventId)).toContain('evt-tomb');

    fake.deleteEvent(CAL, 'evt-tomb');

    const incremental = await fake.fetchWindow(cred, [CAL], FROM, TO, first.cursor);
    expect(incremental.full).toBe(false);
    expect(incremental.deletedIds).toEqual(['evt-tomb']);

    const full = await fake.fetchWindow(cred, [CAL], FROM, TO);
    expect(full.events.map((e) => e.providerEventId)).not.toContain('evt-tomb');
  });

  it('incremental fetch through the real client reports removals via rawDeltaPage', async () => {
    const fake = new GraphFake();
    fake.addEvent(CAL, { ...page1.value[0]!, id: 'evt-to-delete' } as MicrosoftRawEvent);

    const deltaLink = (seq: number) =>
      `${API}/v1.0/me/calendars/${encodeURIComponent(CAL)}/calendarView/delta?$deltatoken=${seq}`;

    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes('/oauth2/v2.0/token')) {
        return json({ access_token: 'at', refresh_token: 'rt-2' });
      }
      const u = new URL(url);
      const deltaToken = u.searchParams.get('$deltatoken') ?? undefined;
      const { items, seq } = fake.rawDeltaPage(CAL, deltaToken);
      return json({ value: items, '@odata.deltaLink': deltaLink(seq) });
    }) as unknown as typeof fetch;

    const source = createMicrosoftCalendarSource({
      clientId: 'client',
      clientSecret: 'secret',
      apiBase: API,
      fetchImpl,
    });

    const first = await source.fetchWindow(cred, [CAL], FROM, TO);
    fake.deleteEvent(CAL, 'evt-to-delete');

    const second = await source.fetchWindow(cred, [CAL], FROM, TO, first.cursor);

    expect(second.full).toBe(false);
    expect(second.deletedIds).toEqual(['evt-to-delete']);
  });

  it('throws AuthError on every call after revoke', async () => {
    const fake = new GraphFake();
    await fake.revoke();
    await expect(fake.listCalendars()).rejects.toBeInstanceOf(AuthError);
    await expect(fake.fetchWindow(cred, [CAL], FROM, TO)).rejects.toBeInstanceOf(AuthError);
  });
});
