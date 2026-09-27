import { AuthError } from '../panels/index.js';
import type {
  CalendarSource,
  EventOccurrence,
  MailSource,
  MessageHeader,
} from '../panels/index.js';
import { toOccurrence } from './calendar.js';
import type { MicrosoftRawEvent, MicrosoftRawCalendar } from './calendar.js';
import { toMessageHeader } from './mail.js';
import type { MicrosoftRawMessage } from './mail.js';
import calendarsFixture from './fixtures/calendar/calendars.json';
import page1 from './fixtures/calendar/view-full-page1.json';
import page2 from './fixtures/calendar/view-full-page2.json';
import mailPage1 from './fixtures/mail/messages-full-page1.json';
import mailPage2 from './fixtures/mail/messages-full-page2.json';

/**
 * In-memory fake implementation of Microsoft Graph calendar and mail providers.
 */
export class GraphFake implements CalendarSource, MailSource {
  private calendars: Record<string, MicrosoftRawCalendar>;
  private items: Record<string, MicrosoftRawEvent[]>;
  private messages: MicrosoftRawMessage[];
  private revoked = false;
  // ponytail: a monotonic "changed since" counter in place of Graph's opaque delta tokens — the
  // fake only needs "what changed after seq N", not a real deltaLink shape.
  private changeSeq = 0;
  private seqByKey = new Map<string, number>();
  private mailSeqById = new Map<string, number>();

  constructor(seed?: {
    calendars?: Record<string, MicrosoftRawCalendar>;
    items?: Record<string, MicrosoftRawEvent[]>;
    messages?: MicrosoftRawMessage[];
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
    this.messages =
      seed?.messages ?? ([...mailPage1.value, ...mailPage2.value] as MicrosoftRawMessage[]);
    for (const item of this.messages) {
      this.mailSeqById.set(item.id, 0);
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

  /** Messages changed since `cursor` (`@removed` tombstones included); a full fetch (no cursor)
   * excludes removed messages entirely. */
  private changedMessages(cursor?: string): MicrosoftRawMessage[] {
    if (!cursor) return this.messages.filter((item) => !item['@removed']);
    const cursorSeq = Number(cursor) || 0;
    return this.messages.filter((item) => (this.mailSeqById.get(item.id) ?? 0) > cursorSeq);
  }

  async fetchInbox(cred: unknown, limit: number, cursor?: string) {
    if (this.revoked) {
      throw new AuthError('Access revoked');
    }

    const full = !cursor;
    const messages: MessageHeader[] = [];
    for (const item of this.changedMessages(cursor)) {
      if (item['@removed']) continue;
      messages.push(toMessageHeader(item));
      if (messages.length >= limit) break;
    }

    return { messages, cursor: String(this.changeSeq), full };
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
   * Add a message to the inbox in the fake.
   */
  addMessage(rawItem: MicrosoftRawMessage) {
    this.messages.push(rawItem);
    this.changeSeq++;
    this.mailSeqById.set(rawItem.id, this.changeSeq);
  }

  /**
   * Flip a message's read state in the fake (default: mark read).
   */
  markRead(messageId: string, isRead = true) {
    const item = this.messages.find((m) => m.id === messageId);
    if (!item) return;
    item.isRead = isRead;
    this.changeSeq++;
    this.mailSeqById.set(messageId, this.changeSeq);
  }

  /** Raw delta page for the HTTP mock's `messages/delta`: a full listing (no deltatoken) excludes
   * removed messages; given a deltatoken cursor, only messages changed since it (`@removed`
   * tombstones included). Also hands back the current seq to embed in the next deltaLink. */
  rawMailDeltaPage(cursor?: string): { items: MicrosoftRawMessage[]; seq: number } {
    return { items: this.changedMessages(cursor), seq: this.changeSeq };
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
