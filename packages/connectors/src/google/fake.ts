import type { CalendarSource, EventOccurrence } from '../panels/index.js';
import { AuthError } from '../panels/index.js';
import { toOccurrence } from './calendar.js';

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

interface GoogleCalendarListItem {
  id: string;
  summary?: string;
  primary?: boolean;
  backgroundColor?: string;
}

export class GoogleFake implements CalendarSource {
  private calendars: GoogleCalendarListItem[];
  private items: Record<string, GoogleEventItem[]>;
  private revoked = false;
  private syncCounter = 0;

  constructor(seed?: {
    calendars: GoogleCalendarListItem[];
    items: Record<string, GoogleEventItem[]>;
  }) {
    this.calendars = seed?.calendars || [];
    this.items = seed?.items || {};
  }

  async listCalendars(): Promise<
    Array<{ id: string; name: string; isPrimary: boolean; colour?: string }>
  > {
    if (this.revoked) {
      throw new AuthError('Access revoked');
    }

    return this.calendars.map((cal) => {
      const result: { id: string; name: string; isPrimary: boolean; colour?: string } = {
        id: cal.id,
        name: cal.summary || '',
        isPrimary: !!cal.primary,
      };
      if (cal.backgroundColor) result.colour = cal.backgroundColor;
      return result;
    });
  }

  async fetchWindow(
    cred: unknown,
    calendarIds: string[],
    from: Date,
    to: Date,
  ): Promise<{
    events: EventOccurrence[];
    deletedIds?: string[];
    cursor?: string;
    full: boolean;
    rotatedCredential?: unknown;
  }> {
    if (this.revoked) {
      throw new AuthError('Access revoked');
    }

    const events: EventOccurrence[] = [];

    for (const calendarId of calendarIds) {
      const calendarItems = this.items[calendarId] || [];

      for (const item of calendarItems) {
        if (item.status === 'cancelled') {
          continue;
        }

        const occurrence = toOccurrence(item, calendarId);
        if (occurrence) {
          // Check if occurrence overlaps with [from, to)
          const eventStart = occurrence.startsAt.getTime();
          const eventEnd = occurrence.endsAt.getTime();
          const fromTime = from.getTime();
          const toTime = to.getTime();

          if (eventStart < toTime && eventEnd > fromTime) {
            events.push(occurrence);
          }
        }
      }
    }

    this.syncCounter++;

    return {
      events,
      cursor: `fake-sync-${this.syncCounter}`,
      full: true,
    };
  }

  async verify(): Promise<void> {
    await this.listCalendars();
  }

  async revoke(): Promise<void> {
    this.revoked = true;
  }

  addEvent(calendarId: string, item: GoogleEventItem): void {
    if (!this.items[calendarId]) {
      this.items[calendarId] = [];
    }
    this.items[calendarId].push(item);
  }

  deleteEvent(calendarId: string, eventId: string): void {
    if (this.items[calendarId]) {
      this.items[calendarId] = this.items[calendarId].filter((e) => e.id !== eventId);
    }
  }

  rawCalendars(): GoogleCalendarListItem[] {
    return this.calendars;
  }

  rawEvents(calendarId: string): GoogleEventItem[] {
    return this.items[calendarId] || [];
  }
}
