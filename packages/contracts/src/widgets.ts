import { z } from 'zod';
import { PlaceCandidate } from './places.js';

export const WidgetKind = z.enum(['currency', 'weather', 'sunrise', 'spend_pace', 'fixed_costs']);
export type WidgetKindT = z.infer<typeof WidgetKind>;

export const WidgetState = z.enum(['ready', 'empty', 'stale', 'error', 'unavailable']);
export type WidgetStateT = z.infer<typeof WidgetState>;

/** Why a widget is in `error` state; a 401 is the app-wide session_expired, never a cause. */
export const WidgetCause = z.enum([
  'rate_unavailable',
  'source_unreachable',
  'source_limit_reached',
  'place_not_found',
]);
export type WidgetCauseT = z.infer<typeof WidgetCause>;

const ATTRIBUTION = 'Weather data by Open-Meteo.com';
const Direction = z.enum(['up', 'down', 'flat']);

const CurrencyChange = z.object({ pct: z.number(), direction: Direction });
export const CurrencyRow = z.union([
  z.object({ code: z.string(), isDefault: z.literal(true) }),
  z.object({
    code: z.string(),
    rate: z.number(),
    rateDate: z.string(),
    prevChange: CurrencyChange.nullable(),
    monthChange: CurrencyChange.extend({ since: z.string().optional() }).nullable(),
    changesPending: z.boolean().optional(),
  }),
  /** The pair has no stored history yet (backfill pending or failed). */
  z.object({ code: z.string(), pending: z.literal(true) }),
]);
export type CurrencyRowT = z.infer<typeof CurrencyRow>;

export const CurrencyFigures = z.object({ rows: z.array(CurrencyRow) });
export const WeatherFigures = z.object({
  place: z.string(),
  temperatureC: z.number(),
  condition: z.string(),
  icon: z.string(),
  todayMaxC: z.number(),
  todayMinC: z.number(),
  outlook: z.array(
    z.object({
      date: z.string(),
      maxC: z.number(),
      minC: z.number(),
      icon: z.string(),
      condition: z.string(),
    }),
  ),
  observedAt: z.string(),
  staleSince: z.string().optional(),
  attribution: z.literal(ATTRIBUTION),
});
export const SunriseFigures = z.object({
  place: z.string(),
  sunrise: z.string().nullable(),
  sunset: z.string().nullable(),
  daylightSeconds: z.number(),
  placeTimeZone: z.string(),
  showZone: z.boolean(),
  polar: z.enum(['day', 'night']).optional(),
  attribution: z.literal(ATTRIBUTION),
});
export const SpendPaceFigures = z.object({
  spentMinor: z.number().int(),
  budgetMinor: z.number().int().nullable(),
  pct: z.number().nullable(),
  daysLeft: z.number().int(),
  dailyToBudgetMinor: z.number().int().nullable(),
  overBudget: z.boolean(),
});
export const FixedCostsFigures = z.object({
  remaining: z.array(
    z.object({
      categoryId: z.string(),
      name: z.string(),
      usualMinor: z.number().int().nullable(),
      usualBasis: z.enum(['budget', 'previous', 'none']),
    }),
  ),
  totalExpectedMinor: z.number().int(),
  allRecorded: z.boolean(),
});

const base = {
  id: z.string(),
  position: z.number().int(),
  settings: z.record(z.string(), z.unknown()),
  place: PlaceCandidate.optional(),
  state: WidgetState,
  asOf: z.string(),
  cause: WidgetCause.optional(),
};

/** Discriminated on `kind`; `figures` is absent when the widget is unavailable or errored. */
export const Widget = z.discriminatedUnion('kind', [
  z.object({ ...base, kind: z.literal('currency'), figures: CurrencyFigures.optional() }),
  z.object({ ...base, kind: z.literal('weather'), figures: WeatherFigures.optional() }),
  z.object({ ...base, kind: z.literal('sunrise'), figures: SunriseFigures.optional() }),
  z.object({ ...base, kind: z.literal('spend_pace'), figures: SpendPaceFigures.optional() }),
  z.object({ ...base, kind: z.literal('fixed_costs'), figures: FixedCostsFigures.optional() }),
]);
export type WidgetT = z.infer<typeof Widget>;

export const WidgetCreate = z.object({
  kind: WidgetKind,
  settings: z.record(z.string(), z.unknown()).optional(),
  placeId: z.string().optional(),
  place: PlaceCandidate.optional(),
  duplicateOf: z.string().optional(),
});
export type WidgetCreateT = z.infer<typeof WidgetCreate>;

export const WidgetPatch = z.object({
  settings: z.record(z.string(), z.unknown()).optional(),
  placeId: z.string().optional(),
  place: PlaceCandidate.optional(),
});
export type WidgetPatchT = z.infer<typeof WidgetPatch>;

export const OrderBody = z.object({ ids: z.array(z.string()) });
export type OrderBodyT = z.infer<typeof OrderBody>;

export const TemperatureUnit = z.enum(['C', 'F']);
export type TemperatureUnitT = z.infer<typeof TemperatureUnit>;

export const WidgetsResponse = z.object({
  widgets: z.array(Widget),
  limit: z.number().int(),
  temperatureUnit: TemperatureUnit,
});
export type WidgetsResponseT = z.infer<typeof WidgetsResponse>;

export const WidgetResponse = z.object({ widget: Widget });
export type WidgetResponseT = z.infer<typeof WidgetResponse>;

export const WidgetType = z.object({
  kind: WidgetKind,
  name: z.string(),
  description: z.string(),
  enabled: z.boolean(),
  needsPlace: z.boolean(),
  settingsSchema: z.record(z.string(), z.unknown()),
});
export type WidgetTypeT = z.infer<typeof WidgetType>;

export const WidgetTypesResponse = z.object({ types: z.array(WidgetType) });
export type WidgetTypesResponseT = z.infer<typeof WidgetTypesResponse>;

/** POST /widgets/refresh; named apart from the RefreshResponse in today.ts (queued ids). */
export const WidgetsRefreshResponse = z.object({ queued: z.number().int() });
export type WidgetsRefreshResponseT = z.infer<typeof WidgetsRefreshResponse>;

export const HealthWidgetsResponse = z.object({ status: z.enum(['ok', 'degraded']) });
export type HealthWidgetsResponseT = z.infer<typeof HealthWidgetsResponse>;
