// T064: the real client (fetch stub, following PROPFIND discovery -> REPORT calendar-query) and
// CalDavFake against the same recorded fixtures (see fixtures/README.md), asserting identical
// EventOccurrence output — contracts/providers.md's fake rule.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { AuthError, ProviderError, VerificationError } from '../panels/index.js';
import { createCalDavSource, parseXml, type CalDavCredential } from './client.js';
import { CalDavFake } from './fake.js';

const ROOT = 'https://caldav.example.test/';
const PRINCIPAL = 'https://caldav.example.test/principals/alice/';
const HOME = 'https://caldav.example.test/calendars/alice/';
const PERSONAL = 'https://caldav.example.test/calendars/alice/personal/';

const CRED: CalDavCredential = {
  url: ROOT,
  username: 'alice@example.test',
  password: 'app-password',
};

function fixture(name: string): string {
  const dir = fileURLToPath(new URL('./fixtures/', import.meta.url));
  return readFileSync(`${dir}${name}`, 'utf-8');
}

/** A fetch stub that answers the discovery PROPFINDs plus one REPORT, keyed by method + URL. */
function discoveryFetch(reportXml: string, opts: { ctag?: string; unauthorized?: boolean } = {}) {
  return async (input: string | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    if (opts.unauthorized) {
      return new Response(fixture('error-401.xml'), { status: 401 });
    }
    if (method === 'PROPFIND' && url === ROOT) {
      return new Response(fixture('propfind-current-user-principal.xml'), { status: 207 });
    }
    if (method === 'PROPFIND' && url === PRINCIPAL) {
      return new Response(fixture('propfind-calendar-home-set.xml'), { status: 207 });
    }
    if (method === 'PROPFIND' && url === HOME) {
      return new Response(fixture('propfind-calendar-list.xml'), { status: 207 });
    }
    if (method === 'PROPFIND' && url === PERSONAL) {
      const changed = opts.ctag === 'changed';
      return new Response(
        fixture(changed ? 'propfind-calendar-ctag-changed.xml' : 'propfind-calendar-ctag.xml'),
        { status: 207 },
      );
    }
    if (method === 'REPORT' && url === PERSONAL) {
      return new Response(reportXml, { status: 207 });
    }
    return new Response('not found', { status: 404 });
  };
}

describe('CalDAV CalendarSource', () => {
  describe('discovery', () => {
    it('walks current-user-principal -> calendar-home-set -> calendar list, filtering out the home collection and a VTODO-only calendar', async () => {
      const source = createCalDavSource({
        fetchImpl: discoveryFetch('') as unknown as typeof fetch,
      });
      const calendars = await source.listCalendars(CRED);
      expect(calendars).toEqual([{ id: PERSONAL, name: 'Personal', isPrimary: true }]);
    });

    it('verify succeeds when discovery succeeds', async () => {
      const source = createCalDavSource({
        fetchImpl: discoveryFetch('') as unknown as typeof fetch,
      });
      await expect(source.verify(CRED)).resolves.toBeUndefined();
    });

    it('verify wraps a discovery failure in VerificationError({ step: "discovery" })', async () => {
      const source = createCalDavSource({
        fetchImpl: discoveryFetch('', { unauthorized: true }) as unknown as typeof fetch,
      });
      await expect(source.verify(CRED)).rejects.toMatchObject({
        name: 'VerificationError',
        step: 'discovery',
      });
    });

    it('a 401 outside verify throws AuthError, not VerificationError', async () => {
      const source = createCalDavSource({
        fetchImpl: discoveryFetch('', { unauthorized: true }) as unknown as typeof fetch,
      });
      await expect(source.listCalendars(CRED)).rejects.toBeInstanceOf(AuthError);
    });
  });

  describe('fetchWindow: contract test, real client vs fake, over the same fixtures', () => {
    const from = new Date('2026-10-01T00:00:00Z');
    const to = new Date('2026-10-20T00:00:00Z');

    it('expand honoured: maps a pre-expanded recurring event, an all-day event, PARTSTAT and a TZID event', async () => {
      const reportXml = fixture('report-calendar-query-expand.xml');
      const source = createCalDavSource({
        fetchImpl: discoveryFetch(reportXml) as unknown as typeof fetch,
      });

      const result = await source.fetchWindow(CRED, [PERSONAL], from, to);

      expect(result.full).toBe(true);
      expect(result.events).toHaveLength(7);

      const recurring = result.events.filter((e) => e.title === 'Recurring Meeting');
      expect(recurring).toHaveLength(3);
      expect(new Set(recurring.map((e) => e.providerEventId)).size).toBe(3);

      const needsAction = result.events.find((e) => e.providerEventId.endsWith('20261001T090000Z'));
      expect(needsAction?.tentative).toBe(true);
      expect(needsAction?.declined).toBe(false);

      const tentative = result.events.find((e) => e.providerEventId.endsWith('20261008T090000Z'));
      expect(tentative?.tentative).toBe(true);
      expect(tentative?.declined).toBe(false);

      const declined = result.events.find((e) => e.providerEventId.endsWith('20261015T090000Z'));
      expect(declined?.tentative).toBe(false);
      expect(declined?.declined).toBe(true);

      const twoDay = result.events.find((e) => e.title === 'Two Day Event');
      expect(twoDay?.allDay).toBe(true);
      expect(twoDay?.startsAt).toEqual(new Date('2026-10-05T00:00:00Z'));
      expect(twoDay?.endsAt).toEqual(new Date('2026-10-07T00:00:00Z'));

      const accepted = result.events.find((e) => e.title === 'Accepted Event');
      expect(accepted?.tentative).toBe(false);
      expect(accepted?.declined).toBe(false);
      expect(accepted?.location).toBe('Room 1');

      const noAttendees = result.events.find((e) => e.title === 'No Attendees Event');
      expect(noAttendees?.tentative).toBe(false);
      expect(noAttendees?.declined).toBe(false);

      const tzEvent = result.events.find((e) => e.title === 'London Time Event');
      expect(tzEvent?.timeZone).toBe('Europe/London');
      // 2026-10-14 15:00 Europe/London is still BST (+01:00) -> 14:00 UTC.
      expect(tzEvent?.startsAt).toEqual(new Date('2026-10-14T14:00:00Z'));
      expect(tzEvent?.endsAt).toEqual(new Date('2026-10-14T15:00:00Z'));
    });

    it('expand ignored: expands RRULE+EXDATE locally with ical.js and applies the RECURRENCE-ID override', async () => {
      const reportXml = fixture('report-calendar-query-no-expand.xml');
      const source = createCalDavSource({
        fetchImpl: discoveryFetch(reportXml) as unknown as typeof fetch,
      });

      // A wider window than the other cases here so both the EXDATE'd occurrence (Oct 22) and the
      // last one (Oct 29) fall inside it.
      const wideTo = new Date('2026-10-31T00:00:00Z');
      const result = await source.fetchWindow(CRED, [PERSONAL], from, wideTo);

      // RRULE COUNT=5 weekly from Oct 1 -> Oct 1, 8, 15, 22, 29; EXDATE removes Oct 22.
      expect(result.events).toHaveLength(4);
      const byDate = new Map(result.events.map((e) => [e.startsAt.toISOString(), e]));

      expect(byDate.get('2026-10-01T09:00:00.000Z')?.tentative).toBe(false);
      expect(byDate.has('2026-10-22T09:00:00.000Z')).toBe(false);
      expect(byDate.get('2026-10-15T09:00:00.000Z')?.title).toBe('Weekly Standup');
      expect(byDate.get('2026-10-29T09:00:00.000Z')).toBeDefined();

      // The moved occurrence: RECURRENCE-ID keeps the original 09:00 instant, but its own
      // DTSTART/DTEND (10:00-10:30) and PARTSTAT (NEEDS-ACTION) are the override's.
      const moved = byDate.get('2026-10-08T10:00:00.000Z');
      expect(moved).toBeDefined();
      expect(moved!.title).toBe('Weekly Standup (moved)');
      expect(moved!.tentative).toBe(true);
      expect(byDate.has('2026-10-08T09:00:00.000Z')).toBe(false);
    });

    it('cursor unchanged (same ctag): no events, full: false', async () => {
      const reportXml = fixture('report-calendar-query-expand.xml');
      const source = createCalDavSource({
        fetchImpl: discoveryFetch(reportXml) as unknown as typeof fetch,
      });

      const first = await source.fetchWindow(CRED, [PERSONAL], from, to);
      const second = await source.fetchWindow(CRED, [PERSONAL], from, to, first.cursor);

      expect(second.full).toBe(false);
      expect(second.events).toHaveLength(0);
      expect(second.cursor).toBe(first.cursor);
    });

    it('cursor changed (ctag changed): forces a full window fetch', async () => {
      const reportXml = fixture('report-calendar-query-expand.xml');
      const source = createCalDavSource({
        fetchImpl: discoveryFetch(reportXml, { ctag: 'changed' }) as unknown as typeof fetch,
      });

      const result = await source.fetchWindow(
        CRED,
        [PERSONAL],
        from,
        to,
        JSON.stringify({ [PERSONAL]: '0' }),
      );

      expect(result.full).toBe(true);
      expect(result.events.length).toBeGreaterThan(0);
    });

    it('401 on REPORT throws AuthError', async () => {
      const source = createCalDavSource({
        fetchImpl: discoveryFetch('', { unauthorized: true }) as unknown as typeof fetch,
      });
      await expect(source.fetchWindow(CRED, [PERSONAL], from, to)).rejects.toBeInstanceOf(
        AuthError,
      );
    });

    it('fake: identical output to the real client over the same ICS fixtures', async () => {
      const expandIcs = extractCalendarDataBlocks(fixture('report-calendar-query-expand.xml'));
      const noExpandIcs = extractCalendarDataBlocks(fixture('report-calendar-query-no-expand.xml'));

      const realSource = createCalDavSource({
        fetchImpl: discoveryFetch(
          fixture('report-calendar-query-expand.xml'),
        ) as unknown as typeof fetch,
      });
      const fake = new CalDavFake({
        calendars: [{ id: PERSONAL, name: 'Personal', isPrimary: true }],
        resources: { [PERSONAL]: expandIcs },
      });

      const realResult = await realSource.fetchWindow(CRED, [PERSONAL], from, to);
      const fakeResult = await fake.fetchWindow(CRED, [PERSONAL], from, to);

      const sortById = (events: typeof realResult.events) =>
        [...events].sort((a, b) => a.providerEventId.localeCompare(b.providerEventId));
      expect(sortById(fakeResult.events)).toEqual(sortById(realResult.events));

      // Same for the un-expanded (locally-expanded) fixture, seeded directly into a fresh fake.
      const fakeNoExpand = new CalDavFake({
        calendars: [{ id: PERSONAL, name: 'Personal', isPrimary: true }],
        resources: { [PERSONAL]: noExpandIcs },
      });
      const realNoExpand = createCalDavSource({
        fetchImpl: discoveryFetch(
          fixture('report-calendar-query-no-expand.xml'),
        ) as unknown as typeof fetch,
      });
      const fakeNoExpandResult = await fakeNoExpand.fetchWindow(CRED, [PERSONAL], from, to);
      const realNoExpandResult = await realNoExpand.fetchWindow(CRED, [PERSONAL], from, to);
      expect(sortById(fakeNoExpandResult.events)).toEqual(sortById(realNoExpandResult.events));
    });

    it('fake: addEvent/deleteEvent change what the next fetchWindow returns and bump the cursor', async () => {
      const fake = new CalDavFake({
        calendars: [{ id: PERSONAL, name: 'Personal', isPrimary: true }],
      });
      const ics =
        'BEGIN:VCALENDAR\nVERSION:2.0\nBEGIN:VEVENT\nUID:new-evt@example.test\nDTSTAMP:20261001T000000Z\nDTSTART:20261010T100000Z\nDTEND:20261010T110000Z\nSUMMARY:New Event\nEND:VEVENT\nEND:VCALENDAR\n';

      fake.addEvent(PERSONAL, 'new-evt.ics', ics);
      const first = await fake.fetchWindow(CRED, [PERSONAL], from, to);
      expect(first.events).toHaveLength(1);
      expect(first.events[0]!.providerEventId).toBe('new-evt@example.test');

      const unchanged = await fake.fetchWindow(CRED, [PERSONAL], from, to, first.cursor);
      expect(unchanged.full).toBe(false);
      expect(unchanged.events).toHaveLength(0);

      fake.deleteEvent(PERSONAL, 'new-evt.ics');
      const afterDelete = await fake.fetchWindow(CRED, [PERSONAL], from, to, first.cursor);
      expect(afterDelete.full).toBe(true);
      expect(afterDelete.events).toHaveLength(0);
    });

    it('fake: revoke causes AuthError on fetchWindow and VerificationError on verify', async () => {
      const fake = new CalDavFake({
        calendars: [{ id: PERSONAL, name: 'Personal', isPrimary: true }],
      });
      await fake.revoke();
      await expect(fake.fetchWindow(CRED, [PERSONAL], from, to)).rejects.toBeInstanceOf(AuthError);
      await expect(fake.verify()).rejects.toBeInstanceOf(VerificationError);
    });
  });

  describe('revoke', () => {
    it('is a no-op (contracts/providers.md: "none; credential deleted")', async () => {
      const source = createCalDavSource({
        fetchImpl: discoveryFetch('') as unknown as typeof fetch,
      });
      await expect(source.revoke(CRED)).resolves.toBeUndefined();
    });
  });
});

/** Pulls each `<C:calendar-data>` block's raw ICS text out of a REPORT multistatus fixture, keyed
 * by its response `<D:href>` — used to seed a CalDavFake with the same ICS the real-client test
 * against the same fixture parses, so the two are compared over identical input. */
function extractCalendarDataBlocks(xml: string): Record<string, string> {
  const blocks: Record<string, string> = {};
  const responseRe = /<D:response>([\s\S]*?)<\/D:response>/g;
  let m: RegExpExecArray | null;
  while ((m = responseRe.exec(xml))) {
    const block = m[1]!;
    const href = /<D:href>([^<]+)<\/D:href>/.exec(block)?.[1];
    const data = /<C:calendar-data>([\s\S]*?)<\/C:calendar-data>/.exec(block)?.[1];
    if (href && data) blocks[href] = data;
  }
  return blocks;
}

// CodeQL js/polynomial-redos (alert 10): a standards CalDAV server is chosen by the user, so its
// responses are untrusted; the XML tokenizer must stay linear and the body size bounded.
describe('parseXml', () => {
  it('builds the element tree: namespaces dropped, attributes, text, CDATA, comments skipped', () => {
    const root = parseXml(
      '<?xml version="1.0"?><!-- c --><D:multistatus xmlns:D="DAV:"><D:href a="x&amp;y">/p/</D:href>' +
        '<C:data><![CDATA[BEGIN:VCALENDAR]]></C:data><D:empty/></D:multistatus>',
    );
    const ms = root.children[0]!;
    expect(ms.name).toBe('multistatus');
    expect(ms.children.map((c) => [c.name, c.attrs, c.text])).toEqual([
      ['href', { a: 'x&y' }, '/p/'],
      ['data', {}, 'BEGIN:VCALENDAR'],
      ['empty', {}, ''],
    ]);
  });

  it.each(['<!--', '<?', '</', '<![CDATA[', '<'])('stays linear on %s repeated', (start) => {
    const crafted = start.repeat(50_000);
    const started = performance.now();
    parseXml(crafted);
    expect(performance.now() - started).toBeLessThan(200);
  });

  it('refuses a response body over the size cap', async () => {
    const huge = '<D:multistatus>' + ' '.repeat(3 * 1024 * 1024) + '</D:multistatus>';
    const source = createCalDavSource({
      fetchImpl: (async () => new Response(huge, { status: 207 })) as unknown as typeof fetch,
    });
    await expect(
      source.listCalendars({ url: 'https://dav.example.test/', username: 'u', password: 'p' }),
    ).rejects.toBeInstanceOf(ProviderError);
  });
});
