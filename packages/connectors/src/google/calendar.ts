import { refreshAccessToken, revoke } from './oauth.js';
import type { CalendarSource, EventOccurrence } from '../panels/index.js';
import { AuthError, RateLimited, ProviderError } from '../panels/index.js';

export interface GoogleCalendarConfig {
  clientId: string;
  clientSecret: string;
  apiBase: string;
  oauthEndpoints?: { token?: string; revoke?: string };
  fetchImpl?: typeof fetch;
}

interface GoogleCalendarListItem {
  id: string;
  summary?: string;
  primary?: boolean;
  backgroundColor?: string;
}

interface GoogleEventItem {
  id: string;
  status?: string;
  summary?: string;
  location?: string;
  start?: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  end?: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  attendees?: Array<{
    email: string;
    self?: boolean;
    responseStatus?: string;
  }>;
  htmlLink?: string;
}

interface GoogleEventsResponse {
  items?: GoogleEventItem[];
  nextPageToken?: string;
  nextSyncToken?: string;
}

export function toOccurrence(item: GoogleEventItem, calendarId: string): EventOccurrence | null {
  if (!item.id) return null;

  const title = item.summary || '';
  let startsAt: Date;
  let endsAt: Date;
  let allDay = false;
  let timeZone: string | undefined;

  // Parse start/end times
  if (item.start?.date) {
    // All-day event
    allDay = true;
    startsAt = new Date(item.start.date + 'T00:00:00Z');
    endsAt = new Date(item.end?.date + 'T00:00:00Z');
  } else if (item.start?.dateTime) {
    // Timed event
    startsAt = new Date(item.start.dateTime);
    endsAt = new Date(item.end?.dateTime || item.start.dateTime);
    timeZone = item.start.timeZone;
  } else {
    return null;
  }

  // Parse attendee responses
  let tentative = false;
  let declined = false;

  if (item.attendees) {
    const selfAttendee = item.attendees.find((a) => a.self);
    if (selfAttendee) {
      if (
        selfAttendee.responseStatus === 'tentative' ||
        selfAttendee.responseStatus === 'needsAction'
      ) {
        tentative = true;
      } else if (selfAttendee.responseStatus === 'declined') {
        declined = true;
      }
    }
  }

  const occurrence: EventOccurrence = {
    providerEventId: item.id,
    calendarId,
    title,
    startsAt,
    endsAt,
    allDay,
    tentative,
    declined,
  };
  if (timeZone) occurrence.timeZone = timeZone;
  if (item.location) occurrence.location = item.location;
  if (item.htmlLink) occurrence.link = item.htmlLink;
  return occurrence;
}

export function createGoogleCalendarSource(config: GoogleCalendarConfig): CalendarSource {
  const fetchImpl = config.fetchImpl || fetch;

  return {
    async listCalendars(
      cred: unknown,
    ): Promise<Array<{ id: string; name: string; isPrimary: boolean; colour?: string }>> {
      const credential = cred as { refreshToken: string };

      // Refresh access token first
      const tokenResult = await refreshAccessToken(
        {
          refreshToken: credential.refreshToken,
          clientId: config.clientId,
          clientSecret: config.clientSecret,
        },
        fetchImpl,
        config.oauthEndpoints,
      );

      const url = `${config.apiBase}/calendar/v3/users/me/calendarList`;
      const response = await fetchImpl(url, {
        headers: {
          Authorization: `Bearer ${tokenResult.accessToken}`,
        },
      });

      if (response.status === 401) {
        throw new AuthError('Invalid credentials');
      }
      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After');
        const retryAfterMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : 60000;
        throw new RateLimited('Rate limited', retryAfterMs);
      }
      if (!response.ok) {
        throw new ProviderError(`google calendar ${response.status}`);
      }

      const data = (await response.json()) as {
        items?: GoogleCalendarListItem[];
      };

      return (data.items || []).map((item) => {
        const cal: { id: string; name: string; isPrimary: boolean; colour?: string } = {
          id: item.id,
          name: item.summary || '',
          isPrimary: !!item.primary,
        };
        if (item.backgroundColor) cal.colour = item.backgroundColor;
        return cal;
      });
    },

    async fetchWindow(
      cred: unknown,
      calendarIds: string[],
      from: Date,
      to: Date,
      cursor?: string,
    ): Promise<{
      events: EventOccurrence[];
      deletedIds?: string[];
      cursor?: string;
      full: boolean;
      rotatedCredential?: unknown;
    }> {
      const credential = cred as { refreshToken: string };

      // Refresh access token first
      const tokenResult = await refreshAccessToken(
        {
          refreshToken: credential.refreshToken,
          clientId: config.clientId,
          clientSecret: config.clientSecret,
        },
        fetchImpl,
        config.oauthEndpoints,
      );

      const events: EventOccurrence[] = [];
      const deletedIds: string[] = [];
      let nextCursor = cursor;
      const full = !cursor;

      for (const calendarId of calendarIds) {
        let url = `${config.apiBase}/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`;
        const params = new URLSearchParams();
        params.set('singleEvents', 'true');
        params.set('showDeleted', 'true');
        params.set('maxResults', '250');

        if (cursor) {
          params.set('syncToken', cursor);
        } else {
          params.set('timeMin', from.toISOString());
          params.set('timeMax', to.toISOString());
        }

        url += '?' + params.toString();

        let pageToken: string | undefined;
        let syncToken: string | undefined;

        while (true) {
          let pageUrl = url;
          if (pageToken) {
            pageUrl += `&pageToken=${encodeURIComponent(pageToken)}`;
          }

          const response = await fetchImpl(pageUrl, {
            headers: {
              Authorization: `Bearer ${tokenResult.accessToken}`,
            },
          });

          if (response.status === 410) {
            if (cursor) {
              // Retry full without cursor
              return this.fetchWindow(credential, calendarIds, from, to);
            }
            throw new ProviderError(`google calendar ${response.status}`);
          }

          if (response.status === 401) {
            throw new AuthError('Invalid credentials');
          }
          if (response.status === 429) {
            const retryAfter = response.headers.get('Retry-After');
            const retryAfterMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : 60000;
            throw new RateLimited('Rate limited', retryAfterMs);
          }
          if (!response.ok) {
            throw new ProviderError(`google calendar ${response.status}`);
          }

          const data = (await response.json()) as GoogleEventsResponse;

          if (data.items) {
            for (const item of data.items) {
              if (item.status === 'cancelled') {
                deletedIds.push(item.id);
              } else {
                const occurrence = toOccurrence(item, calendarId);
                if (occurrence) {
                  events.push(occurrence);
                }
              }
            }
          }

          // Google sends nextSyncToken on the last page only.
          if (data.nextSyncToken) syncToken = data.nextSyncToken;

          pageToken = data.nextPageToken;

          if (!pageToken) {
            break;
          }
        }

        nextCursor = syncToken || cursor;
      }

      const result: {
        events: EventOccurrence[];
        deletedIds?: string[];
        cursor?: string;
        full: boolean;
      } = {
        events,
        full,
      };
      if (deletedIds.length > 0) result.deletedIds = deletedIds;
      if (nextCursor) result.cursor = nextCursor;
      return result;
    },

    async verify(cred: unknown): Promise<void> {
      await this.listCalendars(cred);
    },

    async revoke(cred: unknown): Promise<void> {
      const credential = cred as { refreshToken: string };
      await revoke(credential.refreshToken, fetchImpl, config.oauthEndpoints);
    },
  };
}
