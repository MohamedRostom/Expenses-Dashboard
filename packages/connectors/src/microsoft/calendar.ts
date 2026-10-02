import { refreshAccessToken } from './oauth.js';
import { AuthError, RateLimited, ProviderError } from '../panels/index.js';
import type { CalendarSource, EventOccurrence } from '../panels/index.js';

export interface MicrosoftRawCalendar {
  id: string;
  name: string;
  isDefaultCalendar: boolean;
  hexColor: string;
}

/** Graph event with `Prefer: outlook.timezone="UTC"`: dateTimes are UTC without a zone suffix. */
export interface MicrosoftRawEvent {
  id: string;
  subject?: string;
  start?: { dateTime: string; timeZone?: string };
  end?: { dateTime: string; timeZone?: string };
  isAllDay?: boolean;
  webLink?: string;
  location?: { displayName?: string };
  originalStartTimeZone?: string;
  /** The signed-in user's own response to the event. */
  responseStatus?: { response: string };
  '@removed'?: { reason: string };
  [key: string]: unknown;
}

export interface GraphCalendarViewResponse {
  value: MicrosoftRawEvent[];
  '@odata.nextLink'?: string;
  '@odata.deltaLink'?: string;
}

const TENTATIVE = new Set(['tentativelyAccepted', 'notResponded']);

/** Map a Graph event to an EventOccurrence (contracts/providers.md). */
export function toOccurrence(item: MicrosoftRawEvent, calendarId: string): EventOccurrence {
  const utc = (dt = '') => new Date(`${dt}Z`);
  const response = item.responseStatus?.response;
  const result: EventOccurrence = {
    providerEventId: item.id,
    calendarId,
    title: item.subject ?? '',
    // All-day events arrive as midnight dateTimes, so the same parse gives UTC midnights.
    startsAt: utc(item.start?.dateTime),
    endsAt: utc(item.end?.dateTime),
    allDay: !!item.isAllDay,
    tentative: response !== undefined && TENTATIVE.has(response),
    declined: response === 'declined',
  };
  if (item.webLink) result.link = item.webLink;
  if (item.originalStartTimeZone) result.timeZone = item.originalStartTimeZone;
  if (item.location?.displayName) result.location = item.location.displayName;
  return result;
}

type FetchWindowResult = Awaited<ReturnType<CalendarSource['fetchWindow']>>;

/** Graph lost the delta state (410 or `syncStateNotFound`): refetch the full window. */
class SyncStateLost extends Error {}

export function createMicrosoftCalendarSource({
  clientId,
  clientSecret,
  apiBase,
  oauthEndpoints,
  fetchImpl,
}: {
  clientId: string;
  clientSecret: string;
  apiBase: string;
  oauthEndpoints?: { token?: string };
  fetchImpl: typeof fetch;
}): CalendarSource {
  const token = (cred: unknown) =>
    refreshAccessToken(
      { refreshToken: (cred as { refreshToken: string }).refreshToken, clientId, clientSecret },
      fetchImpl,
      oauthEndpoints,
    );

  async function get<T>(url: string, accessToken: string): Promise<T> {
    const res = await fetchImpl(url, {
      headers: { Authorization: `Bearer ${accessToken}`, Prefer: 'outlook.timezone="UTC"' },
    });
    if (res.ok) return (await res.json()) as T;
    if (res.status === 401) throw new AuthError('graph calendar 401');
    if (res.status === 429) {
      const retryAfter = Number(res.headers.get('Retry-After'));
      throw new RateLimited('graph calendar 429', retryAfter > 0 ? retryAfter * 1000 : 60_000);
    }
    if (res.status === 410) throw new SyncStateLost();
    const body = (await res.json().catch(() => null)) as { error?: { code?: string } } | null;
    if (body?.error?.code === 'syncStateNotFound') throw new SyncStateLost();
    throw new ProviderError(`graph calendar ${res.status}`);
  }

  /** Walks nextLink pages from `url`; the last page's deltaLink is the next cursor. */
  async function walk(url: string, calendarId: string, accessToken: string) {
    const events: EventOccurrence[] = [];
    const deletedIds: string[] = [];
    let cursor: string | undefined;
    let next: string | undefined = url;
    while (next) {
      const page: GraphCalendarViewResponse = await get(next, accessToken);
      for (const item of page.value) {
        if (item['@removed']) deletedIds.push(item.id);
        else events.push(toOccurrence(item, calendarId));
      }
      next = page['@odata.nextLink'];
      cursor = page['@odata.deltaLink'] ?? cursor;
    }
    return { events, deletedIds, cursor };
  }

  return {
    async listCalendars(cred) {
      const { accessToken } = await token(cred);
      const data = await get<{ value: MicrosoftRawCalendar[] }>(
        `${apiBase}/v1.0/me/calendars`,
        accessToken,
      );
      return data.value.map((cal) => ({
        id: cal.id,
        name: cal.name,
        isPrimary: cal.isDefaultCalendar,
        colour: cal.hexColor,
      }));
    },

    // The refresh job calls this once per calendar (cursors are per calendar).
    async fetchWindow(cred, calendarIds, from, to, cursor) {
      const { accessToken, rotatedRefreshToken } = await token(cred);
      const calendarId = calendarIds[0];
      if (!calendarId) return { events: [], full: true };
      const fullUrl =
        `${apiBase}/v1.0/me/calendars/${encodeURIComponent(calendarId)}/calendarView/delta?` +
        new URLSearchParams({ startDateTime: from.toISOString(), endDateTime: to.toISOString() });

      let full = !cursor;
      let page;
      try {
        page = await walk(cursor ?? fullUrl, calendarId, accessToken);
      } catch (err) {
        if (!(err instanceof SyncStateLost) || !cursor) throw err;
        full = true;
        page = await walk(fullUrl, calendarId, accessToken);
      }

      const result: FetchWindowResult = { events: page.events, full };
      if (page.deletedIds.length > 0) result.deletedIds = page.deletedIds;
      if (page.cursor) result.cursor = page.cursor;
      if (rotatedRefreshToken) result.rotatedCredential = { refreshToken: rotatedRefreshToken };
      return result;
    },

    async verify(cred) {
      const { accessToken } = await token(cred);
      await get(`${apiBase}/v1.0/me`, accessToken);
    },

    // Microsoft exposes no revoke endpoint; the user removes the app from their account.
    async revoke() {},
  };
}
