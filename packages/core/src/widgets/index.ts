export {
  WIDGET_KINDS,
  WIDGET_LIMIT,
  CURRENCY_CAP,
  settingsDescriptor,
  validateSettings,
  type WidgetKind,
  type SettingsContext,
  type SettingsIssue,
  type SettingsDescriptor,
} from './settings.js';
export { rateChanges, type RatePoint, type RateChange, type RateChanges } from './rate-change.js';
export { roundCoord, cacheKey, normaliseQuery, nearest } from './place.js';
export { spendPace, type SpendPace } from './spend-pace.js';
export { fixedCosts, type FixedCostRow, type FixedCosts } from './fixed-costs.js';
