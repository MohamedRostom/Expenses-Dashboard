/** Pure helpers for the widget strip: the one-line summary each widget shows on a phone, and the
 * sun times relative to now in the place's own zone. No DOM, no stores. */
import type { TemperatureUnitT, WidgetT } from '@desk/contracts';

type Sun = NonNullable<Extract<WidgetT, { kind: 'sunrise' }>['figures']>;
type FiguresOf<K extends WidgetT['kind']> = NonNullable<Extract<WidgetT, { kind: K }>['figures']>;

/** "YYYY-MM-DDTHH:MM" wall time in `timeZone`, matching how sun times arrive from the server. */
export function clockIn(timeZone: string, now: Date): string {
  // sv-SE formats as "2026-11-25 09:30"
  const s = new Intl.DateTimeFormat('sv-SE', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(now);
  return s.replace(' ', 'T');
}

// Wall times compared as if UTC: both sides are in the same zone, so only the difference matters.
const minutes = (wall: string) => Date.parse(`${wall}:00Z`) / 60_000;
const hhmm = (wall: string) => wall.slice(11, 16);

export function duration(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  if (h === 0 && m > 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

export function nextSunEvent(sun: Sun, now: string): { label: string; in: string } | null {
  if (sun.polar || !sun.sunrise || !sun.sunset) return null;
  const t = minutes(now);
  for (const [label, at] of [
    ['Sunrise', sun.sunrise],
    ['Sunset', sun.sunset],
  ] as const) {
    const left = minutes(at) - t;
    if (left > 0) return { label, in: duration(left) };
  }
  return null;
}

/** Where the sun is between sunrise (0) and sunset (1), clamped; polar day 1, polar night 0. */
export function daylightFraction(sun: Sun, now: string): number {
  if (!sun.sunrise || !sun.sunset) return sun.polar === 'day' ? 1 : 0;
  const rise = minutes(sun.sunrise);
  const f = (minutes(now) - rise) / (minutes(sun.sunset) - rise);
  return Math.min(1, Math.max(0, f));
}

type Summarisable = { kind: WidgetT['kind']; figures?: WidgetT['figures'] };

export function summary(w: Summarisable, unit: TemperatureUnitT, now: string): string | null {
  if (!w.figures) return null;
  const deg = (c: number) => `${Math.round(unit === 'F' ? (c * 9) / 5 + 32 : c)}°`;
  switch (w.kind) {
    case 'weather': {
      const f = w.figures as FiguresOf<'weather'>;
      return `${deg(f.temperatureC)} ${f.condition} · H ${deg(f.todayMaxC)} L ${deg(f.todayMinC)}`;
    }
    case 'sunrise': {
      const f = w.figures as Sun;
      if (f.polar) return f.polar === 'day' ? 'Sun up all day' : 'Sun down all day';
      const next = nextSunEvent(f, now);
      if (next) {
        const at = next.label === 'Sunrise' ? f.sunrise! : f.sunset!;
        return `${next.label} ${hhmm(at)} · in ${next.in}`;
      }
      return `Sunrise ${hhmm(f.sunrise!)} · Sunset ${hhmm(f.sunset!)}`;
    }
    case 'currency': {
      const row = (w.figures as FiguresOf<'currency'>).rows.find((r) => 'rate' in r);
      return row && 'rate' in row ? `${row.code} ${row.rate}` : 'Rate not available yet';
    }
    case 'spend_pace': {
      const f = w.figures as FiguresOf<'spend_pace'>;
      const days = f.daysLeft === 1 ? '1 day left' : `${f.daysLeft} days left`;
      return f.pct === null ? days : `${Math.round(f.pct)}% of budget · ${days}`;
    }
    case 'fixed_costs': {
      const f = w.figures as FiguresOf<'fixed_costs'>;
      return f.allRecorded ? 'All recorded' : `${f.remaining.length} still to record`;
    }
  }
}
