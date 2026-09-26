import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { expandToDays } from './window.js';

type Occurrence = {
  startsAt: Date;
  endsAt: Date;
  allDay: boolean;
  declined: boolean;
  tentative: boolean;
};

describe('expandToDays', () => {
  it('returns exactly 7 buckets', () => {
    const today = new Date('2026-10-01T12:00:00Z');
    const result = expandToDays([], 'UTC', today);
    expect(result).toHaveLength(7);
  });

  it('dates start from today in the given timeZone', () => {
    const today = new Date('2026-10-01T12:00:00Z');
    const result = expandToDays([], 'UTC', today);
    expect(result[0]!.date).toBe('2026-10-01');
    expect(result[1]!.date).toBe('2026-10-02');
    expect(result[6]!.date).toBe('2026-10-07');
  });

  it('handles today in different timeZone (Europe/London)', () => {
    const today = new Date('2026-10-01T12:00:00Z');
    const result = expandToDays([], 'Europe/London', today);
    expect(result[0]!.date).toBe('2026-10-01');
    expect(result[1]!.date).toBe('2026-10-02');
  });

  it('FR-006 example: timed event 3 days ago 09:00 to tomorrow 10:00', () => {
    const today = new Date('2026-10-04T12:00:00Z');
    const event: Occurrence = {
      startsAt: new Date('2026-10-01T09:00:00Z'),
      endsAt: new Date('2026-10-05T10:00:00Z'),
      allDay: false,
      declined: false,
      tentative: false,
    };
    const result = expandToDays([event], 'UTC', today);
    const bucketDates = result.filter((b) => b.events.includes(event)).map((b) => b.date);
    // Window is [today, today+1, ..., today+6], event spans from 3 days ago to tomorrow → buckets [0, 1]
    expect(bucketDates).toEqual(['2026-10-04', '2026-10-05']);
  });

  it('all-day event spans exactly 2 days', () => {
    const today = new Date('2026-10-04T12:00:00Z');
    const event: Occurrence = {
      startsAt: new Date('2026-10-04T00:00:00Z'),
      endsAt: new Date('2026-10-06T00:00:00Z'),
      allDay: true,
      declined: false,
      tentative: false,
    };
    const result = expandToDays([event], 'UTC', today);
    const bucketDates = result.filter((b) => b.events.includes(event)).map((b) => b.date);
    // All-day event from Oct 4 00:00Z to Oct 6 00:00Z is on Oct 4 and Oct 5 only
    expect(bucketDates).toEqual(['2026-10-04', '2026-10-05']);
  });

  it('all-day events appear before timed events in each bucket', () => {
    const today = new Date('2026-10-01T12:00:00Z');
    const allDayEvent: Occurrence = {
      startsAt: new Date('2026-10-01T00:00:00Z'),
      endsAt: new Date('2026-10-02T00:00:00Z'),
      allDay: true,
      declined: false,
      tentative: false,
    };
    const timedEvent: Occurrence = {
      startsAt: new Date('2026-10-01T15:00:00Z'),
      endsAt: new Date('2026-10-01T16:00:00Z'),
      allDay: false,
      declined: false,
      tentative: false,
    };
    const result = expandToDays([timedEvent, allDayEvent], 'UTC', today);
    const bucket = result.find((b) => b.date === '2026-10-01');
    expect(bucket).toBeDefined();
    expect(bucket!.events[0]).toBe(allDayEvent);
    expect(bucket!.events[1]).toBe(timedEvent);
  });

  it('declines events do not appear in result', () => {
    const today = new Date('2026-10-01T12:00:00Z');
    const event: Occurrence = {
      startsAt: new Date('2026-10-01T15:00:00Z'),
      endsAt: new Date('2026-10-01T16:00:00Z'),
      allDay: false,
      declined: true,
      tentative: false,
    };
    const result = expandToDays([event], 'UTC', today);
    const allEvents = result.flatMap((b) => b.events);
    expect(allEvents).not.toContain(event);
  });

  it('tentative object identity is preserved', () => {
    const today = new Date('2026-10-01T12:00:00Z');
    const event: Occurrence = {
      startsAt: new Date('2026-10-01T15:00:00Z'),
      endsAt: new Date('2026-10-01T16:00:00Z'),
      allDay: false,
      declined: false,
      tentative: true,
    };
    const result = expandToDays([event], 'UTC', today);
    const bucket = result.find((b) => b.date === '2026-10-01');
    expect(bucket!.events[0]).toBe(event);
  });

  it('America/Los_Angeles: 2026-10-01T06:30Z lands in 2026-09-30 bucket', () => {
    const today = new Date('2026-09-30T12:00:00Z');
    // 2026-10-01T06:00Z to 2026-10-01T06:30Z in PDT (UTC-7) is 2026-09-30 23:00 to 23:30 local
    const event: Occurrence = {
      startsAt: new Date('2026-10-01T06:00:00Z'),
      endsAt: new Date('2026-10-01T06:30:00Z'),
      allDay: false,
      declined: false,
      tentative: false,
    };
    const result = expandToDays([event], 'America/Los_Angeles', today);
    const bucketDates = result.filter((b) => b.events.includes(event)).map((b) => b.date);
    // Event is entirely on 2026-09-30 in local time, and today is 2026-09-30, so it should be in bucket 0
    expect(bucketDates).toEqual(['2026-09-30']);
  });

  it('an event ending exactly at local midnight does not spill into the next day (end exclusive)', () => {
    const today = new Date('2026-10-01T12:00:00Z');
    // 22:00 to 00:00 in London (BST, UTC+1) on 2026-10-01
    const event: Occurrence = {
      startsAt: new Date('2026-10-01T21:00:00Z'),
      endsAt: new Date('2026-10-01T23:00:00Z'),
      allDay: false,
      declined: false,
      tentative: false,
    };
    const result = expandToDays([event], 'Europe/London', today);
    const got = result.filter((b) => b.events.includes(event)).map((b) => b.date);
    expect(got).toEqual(['2026-10-01']);
  });

  it('7 consecutive dates across Europe/London DST end (today = 2026-10-24)', () => {
    const today = new Date('2026-10-24T12:00:00Z');
    const result = expandToDays([], 'Europe/London', today);
    expect(result.map((b) => b.date)).toEqual([
      '2026-10-24',
      '2026-10-25',
      '2026-10-26',
      '2026-10-27',
      '2026-10-28',
      '2026-10-29',
      '2026-10-30',
    ]);
  });

  const ZONES = [
    'UTC',
    'Europe/London',
    'America/Los_Angeles',
    'Pacific/Kiritimati',
    'Asia/Kolkata',
  ];
  const localDay = (d: Date, timeZone: string) =>
    new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d);

  it('property: a timed event is on exactly the local days it overlaps, within the window', () => {
    fc.assert(
      fc.property(
        fc.date({
          min: new Date('2026-01-01T00:00:00Z'),
          max: new Date('2026-12-31T00:00:00Z'),
          noInvalidDate: true,
        }),
        fc.constantFrom(...ZONES),
        fc.integer({ min: -4 * 24 * 60, max: 8 * 24 * 60 }), // start, minutes from today
        fc.integer({ min: 0, max: 3 * 24 * 60 }), // duration in minutes
        (today, zone, startMin, durMin) => {
          const startsAt = new Date(today.getTime() + startMin * 60_000);
          const endsAt = new Date(startsAt.getTime() + durMin * 60_000);
          const event: Occurrence = {
            startsAt,
            endsAt,
            allDay: false,
            declined: false,
            tentative: false,
          };

          const result = expandToDays([event], zone, today);

          // Reference: sample every 15 minutes over [start, end) plus the last instant before end.
          const expected = new Set<string>([localDay(startsAt, zone)]);
          for (let t = startsAt.getTime(); t < endsAt.getTime(); t += 15 * 60_000) {
            expected.add(localDay(new Date(t), zone));
          }
          if (endsAt > startsAt) expected.add(localDay(new Date(endsAt.getTime() - 1), zone));
          const window = result.map((b) => b.date);
          const want = window.filter((d) => expected.has(d));
          const got = result.filter((b) => b.events.includes(event)).map((b) => b.date);
          expect(got).toEqual(want);
        },
      ),
    );
  });

  it('property: an all-day event is on its calendar dates in every zone', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...ZONES),
        fc.integer({ min: -3, max: 8 }), // start, days from 2026-10-10
        fc.integer({ min: 1, max: 5 }), // length in days
        (zone, offset, length) => {
          const today = new Date('2026-10-10T12:00:00Z');
          const startsAt = new Date(Date.UTC(2026, 9, 10 + offset));
          const endsAt = new Date(Date.UTC(2026, 9, 10 + offset + length));
          const event: Occurrence = {
            startsAt,
            endsAt,
            allDay: true,
            declined: false,
            tentative: false,
          };

          const result = expandToDays([event], zone, today);

          const dates = Array.from({ length }, (_, i) =>
            new Date(Date.UTC(2026, 9, 10 + offset + i)).toISOString().slice(0, 10),
          );
          const want = result.map((b) => b.date).filter((d) => dates.includes(d));
          const got = result.filter((b) => b.events.includes(event)).map((b) => b.date);
          expect(got).toEqual(want);
        },
      ),
    );
  });

  it('property: timed events sorted by startsAt within bucket', () => {
    const today = new Date('2026-10-04T12:00:00Z');
    const events: Occurrence[] = [
      {
        startsAt: new Date('2026-10-04T15:00:00Z'),
        endsAt: new Date('2026-10-04T16:00:00Z'),
        allDay: false,
        declined: false,
        tentative: false,
      },
      {
        startsAt: new Date('2026-10-04T09:00:00Z'),
        endsAt: new Date('2026-10-04T10:00:00Z'),
        allDay: false,
        declined: false,
        tentative: false,
      },
      {
        startsAt: new Date('2026-10-04T12:00:00Z'),
        endsAt: new Date('2026-10-04T13:00:00Z'),
        allDay: false,
        declined: false,
        tentative: false,
      },
    ];

    const result = expandToDays(events, 'UTC', today);
    const bucket = result.find((b) => b.date === '2026-10-04');
    expect(bucket).toBeDefined();
    // All three should be in the bucket
    expect(bucket!.events).toHaveLength(3);
    // Check they're sorted by startsAt
    expect(bucket!.events[0]!.startsAt.getTime()).toBeLessThan(
      bucket!.events[1]!.startsAt.getTime(),
    );
    expect(bucket!.events[1]!.startsAt.getTime()).toBeLessThan(
      bucket!.events[2]!.startsAt.getTime(),
    );
  });
});
