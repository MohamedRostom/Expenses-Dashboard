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
  // ponytail: a monotonic "changed since" counter in place of Graph's opaque delta tokens — the
  // fake only needs "what changed after seq N", not a real deltaLink shape.
  private changeSeq = 0;
  private seqByKey = new Map<string, number>();

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
    for (const [calendarId, events] of Object.entries(this.items)) {
      for (const item of events) {
        this.seqByKey.set(this.key(calendarId, item.id), 0);
      }
    }
  }

  private key(calendarId: string, id: string): string {
    return `${calendarId}::${id}`;
  }

  /** Items changed since `cursor` (`@removed` tombstones included); a full fetch (no cursor)
   * excludes removed items entirely. */
  private changedItems(calendarId: string, cursor?: string): MicrosoftRawEvent[] {
    const items = this.items[calendarId] ?? [];
    if (!cursor) return items.filter((item) => !item['@removed']);
    const cursorSeq = Number(cursor) || 0;
    return items.filter(
      (item) => (this.seqByKey.get(this.key(calendarId, item.id)) ?? 0) > cursorSeq,
    );
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

  async fetchWindow(cred: unknown, calendarIds: string[], from: Date, to: Date, cursor?: string) {
    if (this.revoked) {
      throw new AuthError('Access revoked');
    }

    const calendarId = calendarIds[0];
    if (!calendarId) {
      return { events: [], full: true };
    }

    const full = !cursor;
    const events: EventOccurrence[] = [];
    const deletedIds: string[] = [];

    for (const item of this.changedItems(calendarId, cursor)) {
      if (item['@removed']) {
        deletedIds.push(item.id);
        continue;
      }

      const occurrence = toOccurrence(item, calendarId);
      if (full && !(occurrence.startsAt < to && occurrence.endsAt > from)) continue;
      events.push(occurrence);
    }

    const result: {
      events: EventOccurrence[];
      deletedIds?: string[];
      cursor?: string;
      full: boolean;
    } = { events, cursor: String(this.changeSeq), full };
    if (deletedIds.length > 0) result.deletedIds = deletedIds;
    return result;
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
    this.changeSeq++;
    this.seqByKey.set(this.key(calendarId, rawItem.id), this.changeSeq);
  }

  /**
   * Tombstones an event in the fake instead of removing it — real Graph delta feeds report a
   * deletion as `{ id, '@removed': { reason: 'deleted' } }` on the next incremental fetch.
   */
  deleteEvent(calendarId: string, eventId: string) {
    const item = (this.items[calendarId] || []).find((e) => e.id === eventId);
    if (!item) return;
    item['@removed'] = { reason: 'deleted' };
    this.changeSeq++;
    this.seqByKey.set(this.key(calendarId, eventId), this.changeSeq);
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

  /** Raw delta page for the HTTP mock's `calendarView/delta`: a full listing (no deltatoken)
   * excludes removed items; given a deltatoken cursor, only items changed since it (`@removed`
   * tombstones included). Also hands back the current seq to embed in the next deltaLink. */
  rawDeltaPage(calendarId: string, cursor?: string): { items: MicrosoftRawEvent[]; seq: number } {
    return { items: this.changedItems(calendarId, cursor), seq: this.changeSeq };
  }
}
