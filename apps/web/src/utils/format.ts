import { getCurrency } from '@desk/core';

/** Locale-formatted money with the ISO code always appended (Intl currency style alone may only show a symbol). */
export function formatMoney(minor: number, currency: string, locale?: string): string {
  const { exponent } = getCurrency(currency);
  const major = minor / 10 ** exponent;
  const formatted = new Intl.NumberFormat(locale, { style: 'currency', currency }).format(major);
  return `${formatted} ${currency}`;
}

/** Locale-formatted date from an ISO date string (e.g. "2026-09-18"). `new Date(dateStr)` parses
 * a bare date as UTC midnight, then Intl formats it in the local zone — west of UTC that's
 * still "yesterday" locally, showing the wrong day. Parsing the components directly as a local
 * date sidesteps the UTC round-trip entirely. */
export function formatDate(dateStr: string, locale?: string): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(
    new Date(year as number, (month as number) - 1, day),
  );
}

/** Locale-formatted date+time from a full ISO timestamp (e.g. a session's lastSeenAt, a
 * version's editedAt) — unlike formatDate this is a real instant, not a bare calendar date, so
 * the ordinary UTC-parse-then-local-format Date behavior is exactly what's wanted here. */
export function formatDateTime(isoStr: string, locale?: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(isoStr),
  );
}
