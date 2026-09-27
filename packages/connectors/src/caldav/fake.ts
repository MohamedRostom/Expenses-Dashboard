import type { CalendarSource, EventOccurrence } from '../panels/index.js';
import { AuthError, VerificationError } from '../panels/index.js';
import {
  parseCalendarObjectToOccurrences,
  type CalDavCalendar,
  type CalDavCredential,
} from './client.js';

/**
 * In-memory `CalendarSource` for CalDAV, seeded with the same recorded ICS text the real client's
 * fixtures use — `parseCalendarObjectToOccurrences` (client.ts) does the actual ICS-to-
 * `EventOccurrence` mapping, so the fake can only ever agree with the real client's output; there
 * is no second, hand-duplicated mapping to drift out of sync (contracts/providers.md's fake rule:
 * "the fake replays the fixtures").
 */
export class CalDavFake implements CalendarSource {
  private calendars: CalDavCalendar[];
  // calendarId -> resource href -> ICS text (one calendar object resource per event, exactly as
  // a real CalDAV collection stores them).
  private resources: Map<string, Map<string, string>>;
  private revisions: Map<string, number> = new Map();
  private revoked = false;

  constructor(seed?: {
    calendars?: CalDavCalendar[];
    resources?: Record<string, Record<string, string>>;
  }) {
    this.calendars = seed?.calendars ?? [];
    this.resources = new Map(
      Object.entries(seed?.resources ?? {}).map(([calendarId, hrefs]) => [
        calendarId,
        new Map(Object.entries(hrefs)),
      ]),
    );
  }

  private bumpRevision(calendarId: string): void {
    this.revisions.set(calendarId, (this.revisions.get(calendarId) ?? 0) + 1);
  }

  private ctag(calendarId: string): string {
    return String(this.revisions.get(calendarId) ?? 0);
  }

  async listCalendars(): Promise<CalDavCalendar[]> {
    if (this.revoked) throw new AuthError('CalDAV: unauthorized');
    return this.calendars;
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
    if (this.revoked) throw new AuthError('CalDAV: unauthorized');
    const c = cred as CalDavCredential;
    const cursorMap: Record<string, string> = cursor ? JSON.parse(cursor) : {};
    const nextCursorMap: Record<string, string> = { ...cursorMap };
    const events: EventOccurrence[] = [];
    let full = false;

    for (const calendarId of calendarIds) {
      const ctag = this.ctag(calendarId);
      if (cursorMap[calendarId] !== undefined && cursorMap[calendarId] === ctag) {
        continue;
      }
      full = true;
      for (const icsText of (this.resources.get(calendarId) ?? new Map()).values()) {
        events.push(...parseCalendarObjectToOccurrences(icsText, calendarId, from, to, c));
      }
      nextCursorMap[calendarId] = ctag;
    }

    return { events, full, cursor: JSON.stringify(nextCursorMap) };
  }

  async verify(): Promise<void> {
    if (this.revoked) throw new VerificationError('CalDAV: unauthorized', 'discovery');
  }

  async revoke(): Promise<void> {
    this.revoked = true;
  }

  /** Adds (or replaces) one calendar object resource — `href` is the resource's path within
   * `calendarId`, `icsText` its full `VCALENDAR` text (matching what a real REPORT would return in
   * `<C:calendar-data>`). */
  addEvent(calendarId: string, href: string, icsText: string): void {
    if (!this.resources.has(calendarId)) this.resources.set(calendarId, new Map());
    this.resources.get(calendarId)!.set(href, icsText);
    this.bumpRevision(calendarId);
  }

  deleteEvent(calendarId: string, href: string): void {
    if (!this.resources.get(calendarId)?.delete(href)) return;
    this.bumpRevision(calendarId);
  }

  /** The ctag `fetchWindow` would report for this calendar right now — for a mock server's
   * PROPFIND `CS:getctag` response (infra/mocks/src/caldav.ts). */
  currentCtag(calendarId: string): string {
    return this.ctag(calendarId);
  }

  /** This calendar's raw (href, ICS text) resources — for a mock server's REPORT `calendar-query`
   * response (infra/mocks/src/caldav.ts), which just wraps each one in `<C:calendar-data>`. */
  rawResources(calendarId: string): Array<[string, string]> {
    return [...(this.resources.get(calendarId) ?? new Map()).entries()];
  }
}
