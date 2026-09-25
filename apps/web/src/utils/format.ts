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

const BROWSER_PATTERNS: [RegExp, string][] = [
  [/Edg\//, 'Edge'],
  [/OPR\//, 'Opera'],
  [/Firefox\//, 'Firefox'],
  // Chrome and Safari both include "Safari/" in their UA; Chrome (and Chromium-based browsers
  // not already matched above) also includes "Chrome/", so it must be checked first.
  [/Chrome\//, 'Chrome'],
  [/Safari\//, 'Safari'],
];

const OS_PATTERNS: [RegExp, string][] = [
  [/Windows/, 'Windows'],
  // iPhone/iPad UAs include "like Mac OS X", so iOS must be checked before macOS.
  [/iPhone|iPad|iPod/, 'iOS'],
  [/Mac OS X|Macintosh/, 'macOS'],
  // Android UAs also match /Linux/, so it must be checked first.
  [/Android/, 'Android'],
  [/Linux/, 'Linux'],
];

function firstMatch(ua: string, patterns: [RegExp, string][]): string | undefined {
  return patterns.find(([re]) => re.test(ua))?.[1];
}

/** FR-004: sessions are "shown by browser, operating system". A hand-rolled match over the
 * common desktop/mobile UA strings — ponytail: no ua-parser-js dependency for a display-only
 * label; upgrade if a browser/OS this misses turns out to matter. */
export function describeDevice(userAgent: string | null): string {
  if (!userAgent) return 'Unknown device';
  const browser = firstMatch(userAgent, BROWSER_PATTERNS);
  const os = firstMatch(userAgent, OS_PATTERNS);
  if (browser && os) return `${browser} on ${os}`;
  return browser ?? os ?? 'Unknown device';
}
