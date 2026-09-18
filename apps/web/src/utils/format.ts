import { getCurrency } from '@desk/core';

/** Locale-formatted money with the ISO code always appended (Intl currency style alone may only show a symbol). */
export function formatMoney(minor: number, currency: string, locale?: string): string {
  const { exponent } = getCurrency(currency);
  const major = minor / 10 ** exponent;
  const formatted = new Intl.NumberFormat(locale, { style: 'currency', currency }).format(major);
  return `${formatted} ${currency}`;
}

/** Locale-formatted date from an ISO date string (e.g. "2026-09-18"). */
export function formatDate(dateStr: string, locale?: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(dateStr));
}
