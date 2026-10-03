import { and, asc, eq, inArray, lte, max, sql } from 'drizzle-orm';
import { fxRates, type Db } from '@desk/db';
import type { CurrencyRowT, WidgetCauseT, WidgetStateT } from '@desk/contracts';
import { rateChanges, type RateChange } from '@desk/core';
import type { SessionUser } from '../middleware/session.js';
import { todayInTimeZone } from './capture.js';

export type FigureKind = 'currency' | 'weather' | 'sunrise' | 'spend_pace' | 'fixed_costs';

export type WidgetFigures = {
  state: WidgetStateT;
  asOf: string;
  cause?: WidgetCauseT;
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

type Built = { state: WidgetStateT; figures?: unknown; cause?: WidgetCauseT; asOf?: string };

type Builder = (
  db: Db,
  user: SessionUser,
  widget: { id: string; settings: unknown },
  ctx: FigureContext,
) => Promise<Built>;

const empty: Builder = async () => ({ state: 'empty' });

const toChange = (c: RateChange | null) =>
  c && { pct: Number(c.pct), direction: c.direction, ...(c.since && { since: c.since }) };

/** T030: rows from fx_rates for (code, default) up to the user's day, newest row as the rate. */
const currency: Builder = async (db, user, widget, ctx) => {
  const codes = (widget.settings as { currencies?: string[] }).currencies ?? [];
  // ponytail: "the provider's latest published date" = newest fx_rates date up to the user's day.
  const [latest] = await db
    .select({ d: max(fxRates.rateDate) })
    .from(fxRates)
    .where(lte(fxRates.rateDate, ctx.day));
  const rows: CurrencyRowT[] = [];
  let newest = '';
  // T072: one query for every non-default code, newest 31 rows per code.
  const others = codes.filter((c) => c !== user.defaultCurrency);
  const ranked = others.length
    ? db
        .select({
          base: fxRates.base,
          date: fxRates.rateDate,
          rate: fxRates.rate,
          rn: sql<number>`row_number() over (partition by ${fxRates.base} order by ${fxRates.rateDate} desc)`.as(
            'rn',
          ),
        })
        .from(fxRates)
        .where(
          and(
            inArray(fxRates.base, others),
            eq(fxRates.quote, user.defaultCurrency),
            lte(fxRates.rateDate, ctx.day),
          ),
        )
        .as('ranked')
    : null;
  const byCode = new Map<string, { date: string; rate: string }[]>();
  if (ranked) {
    const found = await db
      .select({ base: ranked.base, date: ranked.date, rate: ranked.rate })
      .from(ranked)
      .where(lte(ranked.rn, 31))
      .orderBy(ranked.base, asc(ranked.date));
    for (const r of found) byCode.set(r.base, [...(byCode.get(r.base) ?? []), r]);
  }
  for (const code of codes) {
    if (code === user.defaultCurrency) {
      rows.push({ code, isDefault: true });
      continue;
    }
    const history = byCode.get(code) ?? [];
    const last = history[history.length - 1];
    if (!last) {
      rows.push({ code, pending: true });
      continue;
    }
    const { prevChange, monthChange } = rateChanges(history);
    if (last.date > newest) newest = last.date;
    rows.push({
      code,
      rate: Number(last.rate),
      rateDate: last.date,
      prevChange: toChange(prevChange),
      monthChange: toChange(monthChange),
      ...(history.length < 2 && { changesPending: true }),
    });
  }
  if (rows.every((r) => 'pending' in r)) return { state: 'error', cause: 'rate_unavailable' };
  const stale = rows.some((r) => 'rateDate' in r && r.rateDate < (latest?.d ?? ''));
  return { state: stale ? 'stale' : 'ready', figures: { rows }, ...(newest && { asOf: newest }) };
};

/** Per-kind builders; US2 and US4 replace the `empty` entries. */
const builders: Record<FigureKind, Builder> = {
  currency,
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
  db: Db,
  user: SessionUser,
  widgets: { id: string; kind: string; settings: unknown }[],
  flags: Record<string, boolean>,
  now: Date,
): Promise<Map<string, WidgetFigures>> {
  const day = todayInTimeZone(user.timeZone, now);
  const ctx: FigureContext = { now, day, ...monthWindow(day) };
  const out = new Map<string, WidgetFigures>();
  for (const w of widgets) {
    const built = await builders[w.kind as FigureKind](db, user, w, ctx);
    out.set(w.id, {
      ...built,
      state: flags[`widgets.${w.kind}`] ? built.state : 'unavailable',
      asOf: built.asOf ?? now.toISOString(),
    });
  }
  return out;
}
