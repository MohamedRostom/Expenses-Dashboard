import { and, asc, eq, gte, inArray, lte, max, sql } from 'drizzle-orm';
import { categories, expenses, fxRates, weatherReadings, type Db } from '@desk/db';
import {
  WEATHER_ATTRIBUTION,
  type CurrencyRowT,
  type WidgetCauseT,
  type WidgetKindT,
  type WidgetStateT,
} from '@desk/contracts';
import type { Forecast } from '@desk/connectors/open-meteo';
import {
  fixedCosts,
  monthSummary,
  rateChanges,
  roundCoord,
  spendPace,
  type RateChange,
} from '@desk/core';
import { wmo } from '@desk/connectors/open-meteo/wmo';
import type { SessionUser } from '../middleware/session.js';
import { toCategoryRow, toExpenseRow } from '../routes/summary.js';
import { todayInTimeZone } from './capture.js';
import { weatherPausedUntil } from './source-usage.js';

type WidgetFigures = {
  state: WidgetStateT;
  asOf: string;
  cause?: WidgetCauseT;
  figures?: unknown;
};

/** The user's day, computed once per request in their time zone (research R10). Lookups shared
 * by several widgets are memoised here so a strip of N widgets runs each query once. */
type FigureContext = {
  now: Date;
  /** YYYY-MM-DD in the user's time zone. */
  day: string;
  /** First and last day (YYYY-MM-DD) of the month containing `day`. */
  monthStart: string;
  monthEnd: string;
  latestRateDate: () => Promise<string | null>;
  pausedUntil: () => Promise<Date | null>;
  rollups: () => ReturnType<typeof monthRollups>;
};

const once = <T>(f: () => Promise<T>) => {
  let p: Promise<T> | undefined;
  return () => (p ??= f());
};

type Built = { state: WidgetStateT; figures?: unknown; cause?: WidgetCauseT; asOf?: string };

type Builder = (
  db: Db,
  user: SessionUser,
  widget: { id: string; settings: unknown; place?: WidgetPlace },
  ctx: FigureContext,
) => Promise<Built>;

type WidgetPlace = { name: string; timeZone: string; lat: number; lon: number };

const toChange = (c: RateChange | null) =>
  c && { pct: Number(c.pct), direction: c.direction, ...(c.since && { since: c.since }) };

/** T030: rows from fx_rates for (code, default) up to the user's day, newest row as the rate. */
const currency: Builder = async (db, user, widget, ctx) => {
  const codes = (widget.settings as { currencies?: string[] }).currencies ?? [];
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
  const latest = (await ctx.latestRateDate()) ?? '';
  const stale = rows.some((r) => 'rateDate' in r && r.rateDate < latest);
  return { state: stale ? 'stale' : 'ready', figures: { rows }, ...(newest && { asOf: newest }) };
};

const STALE_AFTER_MS = 3600_000;

/** T044/T059: the shared reading for the widget's rounded place plus its state and cause. */
async function reading(db: Db, place: WidgetPlace | undefined, ctx: FigureContext) {
  if (!place) return { fail: { state: 'error', cause: 'place_not_found' } as Built };
  const [r] = await db
    .select()
    .from(weatherReadings)
    .where(
      and(
        eq(weatherReadings.lat, roundCoord(place.lat).toFixed(2)),
        eq(weatherReadings.lon, roundCoord(place.lon).toFixed(2)),
      ),
    );
  const paused = await ctx.pausedUntil();
  const cause: WidgetCauseT | undefined = paused
    ? 'source_limit_reached'
    : r?.error
      ? 'source_unreachable'
      : undefined;
  if (!r?.current || !r.daily) {
    return { fail: (cause ? { state: 'error', cause } : { state: 'empty' }) as Built };
  }
  const stale = ctx.now.getTime() - r.fetchedAt.getTime() > STALE_AFTER_MS;
  return {
    timeZone: r.timeZone,
    current: r.current as Forecast['current'],
    daily: r.daily as Forecast['daily'],
    state: (stale || cause ? 'stale' : 'ready') as WidgetStateT,
    ...(cause && { cause }),
    ...(stale && { staleSince: r.fetchedAt.toISOString() }),
  };
}

const weather: Builder = async (db, _user, widget, ctx) => {
  const r = await reading(db, widget.place, ctx);
  if ('fail' in r) return r.fail;
  const { current, daily } = r;
  const today = daily[0]!;
  return {
    state: r.state,
    ...(r.cause && { cause: r.cause }),
    asOf: current.observedAt,
    figures: {
      place: widget.place!.name,
      temperatureC: current.temperatureC,
      condition: wmo(current.weatherCode).condition,
      icon: wmo(current.weatherCode).icon,
      todayMaxC: today.maxC,
      todayMinC: today.minC,
      outlook: daily.slice(1, 4).map((d) => ({
        date: d.date,
        maxC: d.maxC,
        minC: d.minC,
        icon: wmo(d.weatherCode).icon,
        condition: wmo(d.weatherCode).condition,
      })),
      observedAt: current.observedAt,
      ...(r.staleSince && { staleSince: r.staleSince }),
      attribution: WEATHER_ATTRIBUTION,
    },
  };
};

const sunrise: Builder = async (db, user, widget, ctx) => {
  const r = await reading(db, widget.place, ctx);
  if ('fail' in r) return r.fail;
  const today = r.daily[0]!;
  const noTimes = today.sunrise === null || today.sunset === null;
  const polar = !noTimes
    ? undefined
    : today.daylightSeconds >= 86400
      ? 'day'
      : today.daylightSeconds === 0
        ? 'night'
        : undefined;
  return {
    state: r.state,
    ...(r.cause && { cause: r.cause }),
    asOf: r.current.observedAt,
    figures: {
      place: widget.place!.name,
      sunrise: today.sunrise,
      sunset: today.sunset,
      daylightSeconds: today.daylightSeconds,
      placeTimeZone: r.timeZone,
      showZone: r.timeZone !== user.timeZone,
      ...(polar && { polar }),
      attribution: WEATHER_ATTRIBUTION,
    },
  };
};

/** T059: the month rollups `/summary/month` serves, for the user's current and previous month. */
async function monthRollups(
  db: Db,
  user: SessionUser,
  ctx: { monthStart: string; monthEnd: string },
) {
  const prevDay = new Date(Date.parse(`${ctx.monthStart}T00:00:00Z`) - 86400_000)
    .toISOString()
    .slice(0, 10);
  const prev = monthWindow(prevDay);
  const [expenseRows, categoryRows] = await Promise.all([
    db
      .select()
      .from(expenses)
      .where(
        and(
          eq(expenses.userId, user.id),
          gte(expenses.expenseDate, prev.monthStart),
          lte(expenses.expenseDate, ctx.monthEnd),
        ),
      ),
    db.select().from(categories).where(eq(categories.userId, user.id)),
  ]);
  const rows = expenseRows.map(toExpenseRow);
  const cats = categoryRows.map(toCategoryRow);
  return {
    categoryRows,
    cats,
    thisMonth: monthSummary(rows, cats, ctx.monthStart.slice(0, 7)),
    previousMonth: monthSummary(rows, cats, prev.monthStart.slice(0, 7)),
  };
}

const totals = (s: ReturnType<typeof monthSummary>) =>
  new Map(s.categories.filter((c) => c.spent > 0).map((c) => [c.id, c.spent]));

const spend_pace: Builder = async (_db, user, _widget, ctx) => {
  const { cats, thisMonth } = await ctx.rollups();
  const figures = spendPace(
    thisMonth,
    cats.map((c) => c.budgetMinor),
    user.timeZone,
    ctx.now,
  );
  // No budget: still carry the spend so far; the web frame adds the set-a-budget offer.
  const state = cats.every((c) => c.budgetMinor === null) ? 'empty' : 'ready';
  return { state, asOf: ctx.now.toISOString(), figures };
};

const fixed_costs: Builder = async (_db, _user, _widget, ctx) => {
  const { categoryRows, thisMonth, previousMonth } = await ctx.rollups();
  if (!categoryRows.some((c) => c.defaultKind === 'fixed')) return { state: 'empty' };
  const { remaining, totalExpectedMinor, allRecorded } = fixedCosts(
    categoryRows.map((c) => ({ ...c, defaultKind: c.defaultKind ?? '' })),
    totals(thisMonth),
    totals(previousMonth),
  );
  return {
    state: 'ready',
    asOf: ctx.now.toISOString(),
    figures: { remaining, totalExpectedMinor, allRecorded },
  };
};

const builders: Record<WidgetKindT, Builder> = {
  currency,
  weather,
  sunrise,
  spend_pace,
  fixed_costs,
};

function monthWindow(day: string): { monthStart: string; monthEnd: string } {
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
  widgets: { id: string; kind: string; settings: unknown; place?: WidgetPlace }[],
  flags: Record<string, boolean>,
  now: Date,
): Promise<Map<string, WidgetFigures>> {
  const day = todayInTimeZone(user.timeZone, now);
  const month = monthWindow(day);
  const ctx: FigureContext = {
    now,
    day,
    ...month,
    // ponytail: "the provider's latest published date" = newest fx_rates date up to the user's day.
    latestRateDate: once(async () => {
      const [r] = await db
        .select({ d: max(fxRates.rateDate) })
        .from(fxRates)
        .where(lte(fxRates.rateDate, day));
      return r?.d ?? null;
    }),
    pausedUntil: once(() => weatherPausedUntil(db, now)),
    rollups: once(() => monthRollups(db, user, month)),
  };
  const built = await Promise.all(
    widgets.map((w) => builders[w.kind as WidgetKindT](db, user, w, ctx)),
  );
  return new Map(
    widgets.map((w, i): [string, WidgetFigures] => [
      w.id,
      {
        ...built[i]!,
        state: flags[`widgets.${w.kind}`] ? built[i]!.state : 'unavailable',
        asOf: built[i]!.asOf ?? now.toISOString(),
      },
    ]),
  );
}
