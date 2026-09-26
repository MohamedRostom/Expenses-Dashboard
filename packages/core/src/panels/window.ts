/**
 * Seven-day window for the Today calendar panel (FR-006): buckets today..today+6 in the
 * user's zone. Timed events land on every local day they overlap (end exclusive); all-day
 * events keep their calendar dates whatever the zone.
 */

export type Occurrence = {
  startsAt: Date;
  endsAt: Date;
  allDay: boolean;
  declined: boolean;
  tentative: boolean;
};

export type DayBucket<T extends Occurrence> = {
  date: string; // YYYY-MM-DD
  events: T[];
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** YYYY-MM-DD of `d` in `timeZone` (en-CA formats dates that way). */
export function localDate(d: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

const utcDate = (d: Date) => d.toISOString().slice(0, 10);

export function expandToDays<T extends Occurrence>(
  occurrences: T[],
  timeZone: string,
  today: Date,
): DayBucket<T>[] {
  const first = new Date(`${localDate(today, timeZone)}T00:00:00Z`);
  const buckets: DayBucket<T>[] = Array.from({ length: 7 }, (_, i) => ({
    date: utcDate(new Date(first.getTime() + i * DAY_MS)),
    events: [],
  }));

  for (const e of occurrences) {
    if (e.declined) continue;
    let from: string;
    let to: string; // inclusive
    if (e.allDay) {
      from = utcDate(e.startsAt);
      to = utcDate(new Date(e.endsAt.getTime() - DAY_MS));
    } else {
      from = localDate(e.startsAt, timeZone);
      const last = e.endsAt > e.startsAt ? new Date(e.endsAt.getTime() - 1) : e.startsAt;
      to = localDate(last, timeZone);
    }
    for (const b of buckets) if (b.date >= from && b.date <= to) b.events.push(e);
  }

  for (const b of buckets) {
    b.events.sort(
      (a, c) => Number(c.allDay) - Number(a.allDay) || a.startsAt.getTime() - c.startsAt.getTime(),
    );
  }
  return buckets;
}
