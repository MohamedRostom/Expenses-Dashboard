/**
 * CalDAV `CalendarSource` (research.md R3, contracts/providers.md "Standards (CalDAV)"):
 * `PROPFIND` discovery (`current-user-principal` -> `calendar-home-set` -> calendar list),
 * `REPORT calendar-query` with `<C:expand>` over the seven-day window, `ical.js` parsing, local
 * recurrence expansion when the server ignores `expand`, the user's `PARTSTAT` mapped per
 * providers.md (`NEEDS-ACTION` counts as tentative), `getctag`/`sync-token` as the per-calendar
 * cursor. Basic auth (the user's app password). `verify` = the full discovery chain, wrapped so
 * any failure surfaces as `VerificationError({ step: 'discovery' })` — CalDAV has only the one
 * verification step (contracts/providers.md's Standards (CalDAV) row).
 */
import ICAL from 'ical.js';
import type { CalendarSource, EventOccurrence } from '../panels/index.js';
import { AuthError, ProviderError, VerificationError } from '../panels/index.js';

export interface CalDavCredential {
  url: string;
  username: string;
  password: string;
}

export interface CalDavConfig {
  fetchImpl?: typeof fetch;
}

export interface CalDavCalendar {
  id: string;
  name: string;
  isPrimary: boolean;
  colour?: string;
}

// -------------------------------------------------------------------------------------------
// ponytail: a hand-rolled tag-soup XML reader, not a general XML parser — no DTD/entity
// expansion beyond the five XML predefined entities plus numeric character references, no
// namespace validation (every tag is matched by local name only, which is exactly how CalDAV
// clients are expected to read multistatus bodies per RFC 4918 §14). Good enough for the fixed
// WebDAV multistatus / calendar-data shapes this client sends and reads; upgrade to a real XML
// parser (e.g. `fast-xml-parser`) if a server ever emits something this can't read (CDATA and
// comments are the two things it explicitly does handle).
// -------------------------------------------------------------------------------------------

export interface XmlElement {
  name: string;
  attrs: Record<string, string>;
  children: XmlElement[];
  text: string;
}

/** Responses bigger than this are refused: a standards CalDAV server is user-chosen, so its
 * output is untrusted and must not be able to exhaust memory or time. */
const MAX_RESPONSE_CHARS = 2 * 1024 * 1024;

/** Splits XML into markup and text tokens in one forward pass. Each markup token's end is found
 * with a single indexOf from its start, and unterminated markup ends the scan, so the cost is
 * linear (the regex tokenizer this replaces was quadratic on crafted input, CodeQL
 * js/polynomial-redos). */
function xmlTokens(xml: string): string[] {
  const tokens: string[] = [];
  let i = 0;
  while (i < xml.length) {
    const lt = xml.indexOf('<', i);
    if (lt === -1) {
      tokens.push(xml.slice(i));
      break;
    }
    if (lt > i) tokens.push(xml.slice(i, lt));
    const end = xml.startsWith('<![CDATA[', lt)
      ? ']]>'
      : xml.startsWith('<!--', lt)
        ? '-->'
        : xml.startsWith('<?', lt)
          ? '?>'
          : '>';
    const close = xml.indexOf(end, lt + 1);
    if (close === -1) break; // unterminated markup: the rest is malformed, drop it
    tokens.push(xml.slice(lt, close + end.length));
    i = close + end.length;
  }
  return tokens;
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

export function parseXml(xml: string): XmlElement {
  const tokens = xmlTokens(xml);
  const root: XmlElement = { name: '#root', attrs: {}, children: [], text: '' };
  const stack: XmlElement[] = [root];
  for (const token of tokens) {
    if (token.startsWith('<!--') || token.startsWith('<?')) continue;
    if (token.startsWith('<![CDATA[')) {
      stack[stack.length - 1]!.text += token.slice('<![CDATA['.length, -']]>'.length);
      continue;
    }
    if (token.startsWith('</')) {
      if (stack.length > 1) stack.pop();
      continue;
    }
    if (token.startsWith('<')) {
      const selfClosing = token.endsWith('/>');
      const inner = token.slice(1, selfClosing ? -2 : -1).trim();
      const spaceIdx = inner.search(/\s/);
      const rawName = spaceIdx === -1 ? inner : inner.slice(0, spaceIdx);
      const name = rawName.includes(':') ? rawName.split(':').pop()! : rawName;
      const attrs: Record<string, string> = {};
      if (spaceIdx !== -1) {
        const attrRe = /([\w:-]+)\s*=\s*"([^"]*)"/g;
        let m: RegExpExecArray | null;
        while ((m = attrRe.exec(inner.slice(spaceIdx + 1)))) {
          const attrName = m[1]!.includes(':') ? m[1]!.split(':').pop()! : m[1]!;
          attrs[attrName] = decodeXmlEntities(m[2]!);
        }
      }
      const el: XmlElement = { name, attrs, children: [], text: '' };
      stack[stack.length - 1]!.children.push(el);
      if (!selfClosing) stack.push(el);
      continue;
    }
    stack[stack.length - 1]!.text += decodeXmlEntities(token);
  }
  return root;
}

export function findAll(el: XmlElement, name: string): XmlElement[] {
  const out: XmlElement[] = [];
  for (const child of el.children) {
    if (child.name === name) out.push(child);
    out.push(...findAll(child, name));
  }
  return out;
}

export function findFirst(el: XmlElement, name: string): XmlElement | undefined {
  for (const child of el.children) {
    if (child.name === name) return child;
    const found = findFirst(child, name);
    if (found) return found;
  }
  return undefined;
}

function text(el: XmlElement | undefined): string | undefined {
  const t = el?.text.trim();
  return t ? t : undefined;
}

function resolveHref(base: string, href: string): string {
  return new URL(href, base).toString();
}

function icalUtc(d: Date): string {
  return d
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z');
}

function authHeader(cred: CalDavCredential): Record<string, string> {
  return { Authorization: `Basic ${btoa(`${cred.username}:${cred.password}`)}` };
}

async function davRequest(
  fetchImpl: typeof fetch,
  cred: CalDavCredential,
  url: string,
  method: 'PROPFIND' | 'REPORT',
  depth: 0 | 1,
  body: string,
): Promise<XmlElement> {
  const response = await fetchImpl(url, {
    method,
    headers: {
      ...authHeader(cred),
      Depth: String(depth),
      'Content-Type': 'application/xml; charset=utf-8',
    },
    body,
  });
  if (response.status === 401) {
    throw new AuthError('CalDAV: unauthorized');
  }
  if (!response.ok && response.status !== 207) {
    throw new ProviderError(`caldav ${method} ${response.status}`);
  }
  const declared = Number(response.headers.get('content-length') ?? 0);
  if (declared > MAX_RESPONSE_CHARS) {
    throw new ProviderError(`caldav ${method} response too large`);
  }
  const text = await response.text();
  if (text.length > MAX_RESPONSE_CHARS) {
    throw new ProviderError(`caldav ${method} response too large`);
  }
  return parseXml(text);
}

async function propfindCurrentUserPrincipal(
  fetchImpl: typeof fetch,
  cred: CalDavCredential,
): Promise<string> {
  const xml = await davRequest(
    fetchImpl,
    cred,
    cred.url,
    'PROPFIND',
    0,
    '<?xml version="1.0" encoding="utf-8" ?><D:propfind xmlns:D="DAV:"><D:prop><D:current-user-principal/></D:prop></D:propfind>',
  );
  const href = text(findFirst(findFirst(xml, 'current-user-principal')!, 'href'));
  if (!href) throw new ProviderError('caldav: no current-user-principal in PROPFIND response');
  return resolveHref(cred.url, href);
}

async function propfindCalendarHomeSet(
  fetchImpl: typeof fetch,
  cred: CalDavCredential,
  principalUrl: string,
): Promise<string> {
  const xml = await davRequest(
    fetchImpl,
    cred,
    principalUrl,
    'PROPFIND',
    0,
    '<?xml version="1.0" encoding="utf-8" ?><D:propfind xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav"><D:prop><C:calendar-home-set/></D:prop></D:propfind>',
  );
  const href = text(findFirst(findFirst(xml, 'calendar-home-set')!, 'href'));
  if (!href) throw new ProviderError('caldav: no calendar-home-set in PROPFIND response');
  return resolveHref(principalUrl, href);
}

function supportsVEvent(supportedSet: XmlElement | undefined): boolean {
  if (!supportedSet) return false;
  return findAll(supportedSet, 'comp').some((c) => c.attrs['name'] === 'VEVENT');
}

async function propfindCalendars(
  fetchImpl: typeof fetch,
  cred: CalDavCredential,
  homeUrl: string,
): Promise<CalDavCalendar[]> {
  const xml = await davRequest(
    fetchImpl,
    cred,
    homeUrl,
    'PROPFIND',
    1,
    '<?xml version="1.0" encoding="utf-8" ?><D:propfind xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav" xmlns:CS="http://calendarserver.org/ns/"><D:prop><D:resourcetype/><D:displayname/><C:supported-calendar-component-set/><CS:getctag/></D:prop></D:propfind>',
  );
  const calendars: CalDavCalendar[] = [];
  for (const response of findAll(xml, 'response')) {
    const href = text(findFirst(response, 'href'));
    if (!href) continue;
    const resourcetype = findFirst(response, 'resourcetype');
    const isCalendar = !!resourcetype && findFirst(resourcetype, 'calendar') !== undefined;
    if (!isCalendar) continue; // the home collection itself, and anything else non-calendar
    if (!supportsVEvent(findFirst(response, 'supported-calendar-component-set'))) continue;
    calendars.push({
      id: resolveHref(homeUrl, href),
      name: text(findFirst(response, 'displayname')) ?? '',
      isPrimary: calendars.length === 0,
    });
  }
  return calendars;
}

async function discoverCalendars(
  fetchImpl: typeof fetch,
  cred: CalDavCredential,
): Promise<CalDavCalendar[]> {
  const principalUrl = await propfindCurrentUserPrincipal(fetchImpl, cred);
  const homeUrl = await propfindCalendarHomeSet(fetchImpl, cred, principalUrl);
  return propfindCalendars(fetchImpl, cred, homeUrl);
}

async function ctagFor(
  fetchImpl: typeof fetch,
  cred: CalDavCredential,
  calendarUrl: string,
): Promise<string> {
  const xml = await davRequest(
    fetchImpl,
    cred,
    calendarUrl,
    'PROPFIND',
    0,
    '<?xml version="1.0" encoding="utf-8" ?><D:propfind xmlns:D="DAV:" xmlns:CS="http://calendarserver.org/ns/"><D:prop><D:sync-token/><CS:getctag/></D:prop></D:propfind>',
  );
  // ponytail: cursor = sync-token if the calendar advertises one, else getctag — a change forces
  // a full `calendar-query` REPORT rather than an RFC 6578 `sync-collection` REPORT with per-href
  // deltas. That's all fetchWindow's contract needs (a per-calendar cursor whose change triggers
  // a full window refetch); upgrade to real sync-collection if per-event deltas are needed.
  return text(findFirst(xml, 'sync-token')) ?? text(findFirst(xml, 'getctag')) ?? '';
}

async function reportCalendarQuery(
  fetchImpl: typeof fetch,
  cred: CalDavCredential,
  calendarUrl: string,
  from: Date,
  to: Date,
): Promise<XmlElement> {
  const start = icalUtc(from);
  const end = icalUtc(to);
  const body =
    '<?xml version="1.0" encoding="utf-8" ?>' +
    '<C:calendar-query xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">' +
    '<D:prop><D:getetag/>' +
    `<C:calendar-data><C:expand start="${start}" end="${end}"/></C:calendar-data>` +
    '</D:prop>' +
    '<C:filter><C:comp-filter name="VCALENDAR"><C:comp-filter name="VEVENT">' +
    `<C:time-range start="${start}" end="${end}"/>` +
    '</C:comp-filter></C:comp-filter></C:filter>' +
    '</C:calendar-query>';
  return davRequest(fetchImpl, cred, calendarUrl, 'REPORT', 1, body);
}

// -------------------------------------------------------------------------------------------
// ICS parsing / mapping — shared by the real client and CalDavFake (see fake.ts) so both produce
// identical EventOccurrence output from the same recorded ICS text.
// -------------------------------------------------------------------------------------------

function icalTimeToDate(t: InstanceType<typeof ICAL.Time>): Date {
  if (t.isDate) return new Date(Date.UTC(t.year, t.month - 1, t.day));
  return t.toJSDate();
}

function timeZoneOf(t: InstanceType<typeof ICAL.Time>): string | undefined {
  if (t.isDate) return undefined;
  const tzid = t.zone?.tzid;
  return tzid && tzid !== 'UTC' && tzid !== 'floating' ? tzid : undefined;
}

function partstatFor(
  event: InstanceType<typeof ICAL.Event>,
  username: string,
): { tentative: boolean; declined: boolean } {
  const target = `mailto:${username}`.toLowerCase();
  for (const prop of event.component.getAllProperties('attendee')) {
    const value = String(prop.getFirstValue() ?? '').toLowerCase();
    if (value !== target) continue;
    const partstat = String(prop.getParameter('partstat') ?? '').toUpperCase();
    return {
      tentative: partstat === 'TENTATIVE' || partstat === 'NEEDS-ACTION',
      declined: partstat === 'DECLINED',
    };
  }
  return { tentative: false, declined: false };
}

function mapToOccurrence(
  event: InstanceType<typeof ICAL.Event>,
  calendarId: string,
  cred: CalDavCredential,
  overrideStart?: InstanceType<typeof ICAL.Time>,
  overrideEnd?: InstanceType<typeof ICAL.Time>,
  overrideRecurrenceId?: InstanceType<typeof ICAL.Time>,
): EventOccurrence | null {
  const status = event.component.getFirstPropertyValue('status');
  if (typeof status === 'string' && status.toUpperCase() === 'CANCELLED') return null;

  const startTime = overrideStart ?? event.startDate;
  const endTime = overrideEnd ?? event.endDate;
  if (!startTime || !endTime) return null;

  const allDay = startTime.isDate;
  const { tentative, declined } = partstatFor(event, cred.username);
  const recurrenceId =
    overrideRecurrenceId ?? (event.isRecurrenceException() ? event.recurrenceId : undefined);

  const occurrence: EventOccurrence = {
    providerEventId: recurrenceId ? `${event.uid}_${recurrenceId.toICALString()}` : event.uid,
    calendarId,
    title: event.summary || '',
    startsAt: icalTimeToDate(startTime),
    endsAt: icalTimeToDate(endTime),
    allDay,
    tentative,
    declined,
  };
  const timeZone = timeZoneOf(startTime);
  if (timeZone) occurrence.timeZone = timeZone;
  if (event.location) occurrence.location = event.location;
  return occurrence;
}

function expandLocally(
  master: InstanceType<typeof ICAL.Component>,
  calendarId: string,
  from: Date,
  to: Date,
  cred: CalDavCredential,
): EventOccurrence[] {
  const event = new ICAL.Event(master); // auto-relates sibling VEVENTs with RECURRENCE-ID (event.js)
  const results: EventOccurrence[] = [];
  const iterator = event.iterator();
  const fromIcal = ICAL.Time.fromJSDate(from, true);
  const toIcal = ICAL.Time.fromJSDate(to, true);
  let next: InstanceType<typeof ICAL.Time> | null;
  let guard = 0;
  // ponytail: a 10,000-occurrence guard against a pathological RRULE (e.g. SECONDLY with no
  // COUNT/UNTIL) — the seven-day window this client actually asks for never gets close.
  while ((next = iterator.next()) && guard++ < 10000) {
    if (next.compare(toIcal) >= 0) break;
    if (next.compare(fromIcal) < 0) continue;
    const details = event.getOccurrenceDetails(next);
    const occurrence = mapToOccurrence(
      details.item,
      calendarId,
      cred,
      details.startDate,
      details.endDate,
      details.recurrenceId,
    );
    if (occurrence) results.push(occurrence);
  }
  return results;
}

/** Parses one calendar object resource's ICS text (one `<C:calendar-data>` body) into the
 * `EventOccurrence`s it contributes within [from, to) — handling both a server that honoured
 * `<C:expand>` (every VEVENT is already a single occurrence) and one that didn't (a master VEVENT
 * carrying `RRULE`, expanded here with `ical.js`, its `RECURRENCE-ID` overrides picked up
 * automatically via `event.js`'s parent-component auto-relate). Exported for `CalDavFake`. */
export function parseCalendarObjectToOccurrences(
  icsText: string,
  calendarId: string,
  from: Date,
  to: Date,
  cred: CalDavCredential,
): EventOccurrence[] {
  const jcal = ICAL.parse(icsText);
  const component = new ICAL.Component(jcal);
  for (const vtimezone of component.getAllSubcomponents('vtimezone')) {
    ICAL.TimezoneService.register(vtimezone);
  }

  const vevents = component.getAllSubcomponents('vevent');
  const masters = vevents.filter((v) => v.hasProperty('rrule') && !v.hasProperty('recurrence-id'));
  const consumedUids = new Set(masters.map((v) => v.getFirstPropertyValue('uid')));

  const results: EventOccurrence[] = [];
  for (const master of masters) {
    results.push(...expandLocally(master, calendarId, from, to, cred));
  }
  for (const vevent of vevents) {
    if (consumedUids.has(vevent.getFirstPropertyValue('uid'))) continue;
    const occurrence = mapToOccurrence(new ICAL.Event(vevent), calendarId, cred);
    if (occurrence) results.push(occurrence);
  }
  return results;
}

async function fetchCalendarEvents(
  fetchImpl: typeof fetch,
  cred: CalDavCredential,
  calendarUrl: string,
  from: Date,
  to: Date,
): Promise<EventOccurrence[]> {
  const xml = await reportCalendarQuery(fetchImpl, cred, calendarUrl, from, to);
  const events: EventOccurrence[] = [];
  for (const response of findAll(xml, 'response')) {
    const icsText = text(findFirst(response, 'calendar-data'));
    if (!icsText) continue;
    events.push(...parseCalendarObjectToOccurrences(icsText, calendarUrl, from, to, cred));
  }
  return events;
}

export function createCalDavSource(config: CalDavConfig = {}): CalendarSource {
  const fetchImpl = config.fetchImpl ?? fetch;

  return {
    async listCalendars(cred: unknown): Promise<CalDavCalendar[]> {
      return discoverCalendars(fetchImpl, cred as CalDavCredential);
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
      const c = cred as CalDavCredential;
      const cursorMap: Record<string, string> = cursor ? JSON.parse(cursor) : {};
      const nextCursorMap: Record<string, string> = { ...cursorMap };
      const events: EventOccurrence[] = [];
      let full = false;

      for (const calendarId of calendarIds) {
        const ctag = await ctagFor(fetchImpl, c, calendarId);
        if (cursorMap[calendarId] !== undefined && cursorMap[calendarId] === ctag) {
          continue; // unchanged since the last refresh: no full window fetch needed
        }
        full = true;
        events.push(...(await fetchCalendarEvents(fetchImpl, c, calendarId, from, to)));
        nextCursorMap[calendarId] = ctag;
      }

      return { events, full, cursor: JSON.stringify(nextCursorMap) };
    },

    async verify(cred: unknown): Promise<void> {
      try {
        await discoverCalendars(fetchImpl, cred as CalDavCredential);
      } catch (err) {
        throw new VerificationError(
          `CalDAV discovery failed: ${(err as Error).message}`,
          'discovery',
        );
      }
    },

    // "none; credential deleted" (contracts/providers.md's Standards (CalDAV) row) — the caller
    // just deletes the stored app password, same as the IMAP standards connector.
    async revoke(): Promise<void> {},
  };
}
