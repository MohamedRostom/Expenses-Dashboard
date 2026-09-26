import { AuthError } from '../panels/index.js';
import type { CalendarSource, EventOccurrence } from '../panels/index.js';
import { toOccurrence } from './calendar.js';
import type { MicrosoftRawEvent, MicrosoftRawCalendar } from './calendar.js';
import calendarsFixture from './fixtures/calendar/calendars.json';
import page1 from './fixtures/calendar/view-full-page1.json';
import page2 from './fixtures/calendar/view-full-page2.json';

/**
 * In-memory fake implementation of Microsoft Graph calendar provider.
 */
export class GraphFake implements CalendarSource {
  private calendars: Record<string, MicrosoftRawCalendar>;
  private items: Record<string, MicrosoftRawEvent[]>;
  private revoked = false;
  private syncCounter = 0;

  constructor(seed?: {
    calendars?: Record<string, MicrosoftRawCalendar>;
    items?: Record<string, MicrosoftRawEvent[]>;
  }) {
    this.calendars =
      seed?.calendars ?? Object.fromEntries(calendarsFixture.value.map((c) => [c.id, c]));
    this.items = seed?.items ?? {
      'primary-cal@example.test': [
        ...(page1.value as MicrosoftRawEvent[]),
        ...(page2.value as MicrosoftRawEvent[]),
      ],
      'cal-work': [],
    };
  }

  async listCalendars() {
    if (this.revoked) {
      throw new AuthError('Access revoked');
    }

    return Object.values(this.calendars).map((cal) => ({
      id: cal.id,
      name: cal.name,
      isPrimary: cal.isDefaultCalendar,
      colour: cal.hexColor,
    }));
  }

  async fetchWindow(cred: unknown, calendarIds: string[], from: Date, to: Date) {
    if (this.revoked) {
      throw new AuthError('Access revoked');
    }

    const calendarId = calendarIds[0];
    if (!calendarId) {
      return {
        events: [],
        full: true,
      };
    }

    const events = this.items[calendarId] ?? [];
    const occurrences: EventOccurrence[] = events.map((item) => toOccurrence(item, calendarId));

    // Filter by date range
    const filtered = occurrences.filter((e) => {
      return e.startsAt < to && e.endsAt > from;
    });

    this.syncCounter++;
    const newCursor = `fake-sync-${this.syncCounter}`;

    // The fake ignores cursors and always answers with the full window.
    return { events: filtered, cursor: newCursor, full: true };
  }

  async verify() {
    if (this.revoked) {
      throw new AuthError('Access revoked');
    }
  }

  async revoke() {
    this.revoked = true;
  }

  /**
   * Add an event to a calendar in the fake.
   */
  addEvent(calendarId: string, rawItem: MicrosoftRawEvent) {
    if (!this.items[calendarId]) {
      this.items[calendarId] = [];
    }
    this.items[calendarId].push(rawItem);
  }

  /**
   * Delete an event from a calendar in the fake.
   */
  deleteEvent(calendarId: string, eventId: string) {
    if (this.items[calendarId]) {
      this.items[calendarId] = this.items[calendarId].filter((e) => e.id !== eventId);
    }
  }

  /**
   * Get raw calendars for mock HTTP server.
   */
  rawCalendars(): MicrosoftRawCalendar[] {
    return Object.values(this.calendars);
  }

  /**
   * Get raw events for a calendar for mock HTTP server.
   */
  rawEvents(calendarId: string): MicrosoftRawEvent[] {
    return this.items[calendarId] ?? [];
  }
}
