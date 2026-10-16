/** Fixtures for the widget mock-ups (T027a). Pure data and copy: no API, no store. Content mirrors
 * components/widgets/* (read for wording only). Money is formatted from integer minor units. */

export type WidgetKind = 'currency' | 'weather' | 'sunrise' | 'spend-pace' | 'fixed-costs';
export type WidgetState = 'default' | 'loading' | 'empty' | 'error' | 'stale';

export const WIDGET_KINDS: readonly WidgetKind[] = [
  'currency',
  'weather',
  'sunrise',
  'spend-pace',
  'fixed-costs',
];
export const WIDGET_STATES: readonly WidgetState[] = [
  'default',
  'loading',
  'empty',
  'error',
  'stale',
];
export const WIDGET_NAMES: Record<WidgetKind, string> = {
  currency: 'Currency',
  weather: 'Weather',
  sunrise: 'Sunrise',
  'spend-pace': 'Spend pace',
  'fixed-costs': 'Fixed costs',
};

/** The widgets page opens with four on the strip, one absent, so the add sheet is never empty. */
export const DEFAULT_STRIP: WidgetKind[] = ['currency', 'weather', 'spend-pace', 'fixed-costs'];
/** The Today strip shows three. */
export const TODAY_STRIP: WidgetKind[] = ['currency', 'weather', 'spend-pace'];

export const STALE_AS_OF = '09:07';
export const staleWords = `as of ${STALE_AS_OF}, not refreshed`;

export const money = (minor: number) =>
  new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(minor / 100);

export const CURRENCY = {
  pair: 'GBP to EUR',
  rate: '1.1842',
  arrivedRate: '1.1861',
  meta: 'ECB rate, 12 Sep 2026',
  day: 'up 0.2%',
  month: 'down 0.8%',
};

export const WEATHER = {
  place: 'Leeds',
  condition: 'Light cloud',
  temps: [14, 15, 15, 16, 15, 14],
  high: 17,
  low: 9,
  outlook: [
    { day: 'Tue', max: 16, min: 8 },
    { day: 'Wed', max: 18, min: 10 },
    { day: 'Thu', max: 15, min: 9 },
  ],
  meta: 'as of 09:12, Open-Meteo',
};

export const SUNRISE = {
  place: 'Leeds',
  sunrise: '06:28',
  sunset: '19:31',
  length: '13 h 3 min',
  meta: 'Open-Meteo, 14 Sep 2026',
};

export const PACE = {
  spentMinor: 128460,
  budgetMinor: 215000,
  monthDays: 30,
  startDay: 14,
  meta: 'September budget',
};
export const pacePct = () => Math.round((PACE.spentMinor / PACE.budgetMinor) * 1000) / 10;
/** What is left per remaining day to stay on budget; null on the last day. */
export const perDayMinor = (day: number) =>
  day >= PACE.monthDays
    ? null
    : Math.round((PACE.budgetMinor - PACE.spentMinor) / (PACE.monthDays - day));

export const FIXED = {
  remaining: [
    { name: 'Council tax', note: 'about', minor: 16800 },
    { name: 'Gym & health', note: '', minor: 4500 },
    { name: 'Internet', note: '', minor: 3200 },
  ],
  totalMinor: 24500,
  meta: 'Fixed categories still to pay',
};

export const EMPTY_COPY: Record<WidgetKind, { title: string; hint: string }> = {
  currency: { title: 'No currency pair yet', hint: 'Pick a currency to follow.' },
  weather: { title: 'No place chosen', hint: 'Search for a town in settings.' },
  sunrise: { title: 'No place chosen', hint: 'Search for a town in settings.' },
  'spend-pace': { title: 'No budget set', hint: 'Set a budget in Categories.' },
  'fixed-costs': { title: 'No fixed categories', hint: 'Mark a category as fixed.' },
};

/** Error copy branches on cause. `keeps` = the last value stays visible under the message. */
export const ERROR_COPY: Record<WidgetKind, { text: string; keeps: boolean }> = {
  currency: { text: 'The rate service did not answer. Showing the last rate.', keeps: true },
  weather: { text: 'The weather service is not responding. Try again soon.', keeps: false },
  sunrise: { text: 'We could not look up that place. Check it in settings.', keeps: false },
  'spend-pace': { text: 'Spending could not be totalled. Showing the last total.', keeps: true },
  'fixed-costs': { text: 'Categories could not be read. Showing the last list.', keeps: true },
};

export interface SettingsField {
  label: string;
  options: string[];
}
export const SETTINGS: Record<WidgetKind, SettingsField[]> = {
  currency: [
    { label: 'Currency to follow', options: ['EUR', 'USD', 'JPY'] },
    { label: 'Compared against', options: ['GBP'] },
  ],
  weather: [
    { label: 'Place', options: ['Leeds', 'Bristol', 'Glasgow'] },
    { label: 'Temperature unit', options: ['Celsius', 'Fahrenheit'] },
  ],
  sunrise: [{ label: 'Place', options: ['Leeds', 'Bristol', 'Glasgow'] }],
  'spend-pace': [{ label: 'Budget', options: ['Monthly total', 'Variable only'] }],
  'fixed-costs': [{ label: 'Show', options: ['Still to pay', 'Everything'] }],
};
