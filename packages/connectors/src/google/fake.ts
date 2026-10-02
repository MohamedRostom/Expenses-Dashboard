import type {
  CalendarSource,
  EventOccurrence,
  MailSource,
  MessageHeader,
} from '../panels/index.js';
import { AuthError } from '../panels/index.js';
import { toOccurrence } from './calendar.js';
import { toMessageHeader, type GmailMessageMetadata } from './gmail.js';

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

export class GoogleFake implements CalendarSource, MailSource {
  private calendars: GoogleCalendarListItem[];
  private items: Record<string, GoogleEventItem[]>;
  private revoked = false;
  // ponytail: a monotonic "changed since" counter instead of real opaque sync tokens — the fake
  // only needs to answer "what changed after cursor N", not produce Google-shaped tokens.
  private changeSeq = 0;
  private seqByKey = new Map<string, number>();

  // Mail: Gmail's historyId is one counter for the whole mailbox (not per-calendar like sync
  // tokens), so it gets its own sequence rather than reusing changeSeq.
  private mailMessages: GmailMessageMetadata[] = [];
  private mailHistorySeq = 0;
  /** History seq each message was added at, and label changes since, for rawHistorySince. */
  private mailAddedSeq = new Map<string, number>();
  private mailLabelChanges: Array<{ id: string; seq: number }> = [];

  constructor(seed?: {
    calendars?: GoogleCalendarListItem[];
    items?: Record<string, GoogleEventItem[]>;
    mail?: { messages: GmailMessageMetadata[] };
  }) {
    this.calendars = seed?.calendars || [];
    this.items = seed?.items || {};
    for (const [calendarId, items] of Object.entries(this.items)) {
      for (const item of items) {
        this.seqByKey.set(this.key(calendarId, item.id), 0);
      }
    }
    this.mailMessages = seed?.mail?.messages ?? [];
    for (const message of this.mailMessages) {
      const historyId = Number(message.historyId ?? 0);
      if (historyId > this.mailHistorySeq) this.mailHistorySeq = historyId;
      this.mailAddedSeq.set(message.id, historyId);
    }
  }

  private key(calendarId: string, id: string): string {
    return `${calendarId}::${id}`;
  }

  /** Items changed since `cursor` (tombstones included); a full fetch (no cursor) excludes
   * cancelled items entirely, same as the real API's `showDeleted=true` semantics. */
  private changedItems(calendarId: string, cursor?: string): GoogleEventItem[] {
    const items = this.items[calendarId] || [];
    if (!cursor) return items.filter((item) => item.status !== 'cancelled');
    const cursorSeq = Number(cursor) || 0;
    return items.filter(
      (item) => (this.seqByKey.get(this.key(calendarId, item.id)) ?? 0) > cursorSeq,
    );
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
    cursor?: string,
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

    const full = !cursor;
    const events: EventOccurrence[] = [];
    const deletedIds: string[] = [];

    for (const calendarId of calendarIds) {
      for (const item of this.changedItems(calendarId, cursor)) {
        if (item.status === 'cancelled') {
          // A full fetch never includes cancelled items (changedItems already excludes them);
          // an incremental fetch reports them as deletions instead of occurrences.
          deletedIds.push(item.id);
          continue;
        }

        const occurrence = toOccurrence(item, calendarId);
        if (!occurrence) continue;

        if (full) {
          // Only a full fetch is windowed by [from, to) — same as the real client, which sends
          // timeMin/timeMax only when there's no syncToken.
          const eventStart = occurrence.startsAt.getTime();
          const eventEnd = occurrence.endsAt.getTime();
          if (!(eventStart < to.getTime() && eventEnd > from.getTime())) continue;
        }

        events.push(occurrence);
      }
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
    this.changeSeq++;
    this.seqByKey.set(this.key(calendarId, item.id), this.changeSeq);
  }

  /** Tombstones instead of removing the item — real Google/Graph delta feeds report a deletion
   * as an item with `status: 'cancelled'` on the next incremental fetch, not a gap. */
  deleteEvent(calendarId: string, eventId: string): void {
    const item = (this.items[calendarId] || []).find((e) => e.id === eventId);
    if (!item) return;
    item.status = 'cancelled';
    this.changeSeq++;
    this.seqByKey.set(this.key(calendarId, eventId), this.changeSeq);
  }

  rawCalendars(): GoogleCalendarListItem[] {
    return this.calendars;
  }

  rawEvents(calendarId: string): GoogleEventItem[] {
    return this.items[calendarId] || [];
  }

  /** Raw (un-mapped-to-EventOccurrence) items for the HTTP mock's `events.list`: a full listing
   * (no cursor) excludes cancelled items; given a syncToken cursor, only items changed since it
   * (tombstones included) — the same "changed since" logic `fetchWindow` uses, at the wire shape
   * the real Google API returns. Also hands back the next syncToken to advertise. */
  rawEventsPage(
    calendarId: string,
    cursor?: string,
  ): { items: GoogleEventItem[]; nextSyncToken: string } {
    return { items: this.changedItems(calendarId, cursor), nextSyncToken: String(this.changeSeq) };
  }

  // --- Mail (MailSource) ---

  private inboxMessages(): GmailMessageMetadata[] {
    // Mirrors the real query `-category:promotions -category:social`.
    return this.mailMessages.filter(
      (m) =>
        !(m.labelIds ?? []).includes('CATEGORY_PROMOTIONS') &&
        !(m.labelIds ?? []).includes('CATEGORY_SOCIAL'),
    );
  }

  async fetchInbox(
    _cred: unknown,
    limit: number,
    cursor?: string,
  ): Promise<{
    messages: MessageHeader[];
    unreadTotal?: number;
    cursor?: string;
    full: boolean;
  }> {
    if (this.revoked) {
      throw new AuthError('Access revoked');
    }

    const full = !cursor;
    const cursorSeq = cursor ? Number(cursor) || 0 : 0;
    const candidates = full
      ? this.inboxMessages()
      : this.mailMessages.filter((m) => Number(m.historyId ?? 0) > cursorSeq);

    const messages = candidates.slice(0, limit).map(toMessageHeader);
    const unreadTotal = this.inboxMessages().filter((m) =>
      (m.labelIds ?? []).includes('UNREAD'),
    ).length;

    return { messages, unreadTotal, cursor: String(this.mailHistorySeq), full };
  }

  /** Adds a message and assigns it the next historyId, as a real incremental sync would see it. */
  addMessage(message: Omit<GmailMessageMetadata, 'historyId'>): void {
    this.mailHistorySeq++;
    this.mailMessages.push({ ...message, historyId: String(this.mailHistorySeq) });
    this.mailAddedSeq.set(message.id, this.mailHistorySeq);
  }

  /** Drops the UNREAD label from a message, as reading it in a real client would. */
  markRead(messageId: string): void {
    const message = this.mailMessages.find((m) => m.id === messageId);
    if (!message) return;
    message.labelIds = (message.labelIds ?? []).filter((l) => l !== 'UNREAD');
    // A label change is a new history record, as in Gmail, so an incremental sync sees it.
    this.mailHistorySeq++;
    message.historyId = String(this.mailHistorySeq);
    this.mailLabelChanges.push({ id: messageId, seq: this.mailHistorySeq });
  }

  rawMessagesList(limit?: number): Array<{ id: string; threadId?: string }> {
    const items = this.inboxMessages().map((m) =>
      m.threadId !== undefined ? { id: m.id, threadId: m.threadId } : { id: m.id },
    );
    return limit === undefined ? items : items.slice(0, limit);
  }

  rawMessage(id: string): GmailMessageMetadata | undefined {
    return this.mailMessages.find((m) => m.id === id);
  }

  rawHistorySince(startHistoryId: string): {
    addedIds: string[];
    labelChangedIds: string[];
    historyId: string;
  } {
    const startSeq = Number(startHistoryId) || 0;
    const addedIds = this.mailMessages
      .filter((m) => (this.mailAddedSeq.get(m.id) ?? 0) > startSeq)
      .map((m) => m.id);
    const labelChangedIds = [
      ...new Set(this.mailLabelChanges.filter((c) => c.seq > startSeq).map((c) => c.id)),
    ].filter((id) => !addedIds.includes(id));
    return { addedIds, labelChangedIds, historyId: String(this.mailHistorySeq) };
  }

  rawLabelInbox(): { messagesUnread: number } {
    return {
      messagesUnread: this.inboxMessages().filter((m) => (m.labelIds ?? []).includes('UNREAD'))
        .length,
    };
  }

  rawProfile(): { historyId: string } {
    return { historyId: String(this.mailHistorySeq) };
  }
}
