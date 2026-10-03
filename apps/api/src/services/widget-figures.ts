import type { WidgetStateT } from '@desk/contracts';
import type { SessionUser } from '../middleware/session.js';
import { todayInTimeZone } from './capture.js';

export type FigureKind = 'currency' | 'weather' | 'sunrise' | 'spend_pace' | 'fixed_costs';

export type WidgetFigures = {
  state: WidgetStateT;
  asOf: string;
  figures?: unknown;
};

/** The user's day, computed once per request in their time zone (research R10). */
export type FigureContext = {
  now: Date;
  /** YYYY-MM-DD in the user's time zone. */
  day: string;
  /** First and last day (YYYY-MM-DD) of the month containing `day`. */
  monthStart: string;
  monthEnd: string;
};

type Builder = (
  user: SessionUser,
  widget: { id: string; settings: unknown },
  ctx: FigureContext,
) => Promise<{ state: WidgetStateT; figures?: unknown }>;

const empty: Builder = async () => ({ state: 'empty' });

/** Per-kind builders; US1, US2 and US4 replace the `empty` entries. */
const builders: Record<FigureKind, Builder> = {
  currency: empty,
  weather: empty,
  sunrise: empty,
  spend_pace: empty,
  fixed_costs: empty,
};

export function monthWindow(day: string): { monthStart: string; monthEnd: string } {
  const [y, m] = day.split('-').map(Number) as [number, number];
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const ym = day.slice(0, 7);
  return { monthStart: `${ym}-01`, monthEnd: `${ym}-${String(last).padStart(2, '0')}` };
}

/** Figures for each widget, keyed by widget id. A flag-off kind is `unavailable`, keeping
 * whatever the builder returned. */
export async function figuresFor(
  user: SessionUser,
  widgets: { id: string; kind: string; settings: unknown }[],
  flags: Record<string, boolean>,
  now: Date,
): Promise<Map<string, WidgetFigures>> {
  const day = todayInTimeZone(user.timeZone, now);
  const ctx: FigureContext = { now, day, ...monthWindow(day) };
  const out = new Map<string, WidgetFigures>();
  for (const w of widgets) {
    const built = await builders[w.kind as FigureKind](user, w, ctx);
    out.set(w.id, {
      ...built,
      state: flags[`widgets.${w.kind}`] ? built.state : 'unavailable',
      asOf: now.toISOString(),
    });
  }
  return out;
}
