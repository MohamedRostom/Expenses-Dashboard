/**
 * "YYYY-MM" for a date, using its UTC calendar day. Intended to match the Notion `Month`
 * formula (formatDate(prop("Date"), "YYYY-MM")); Notion formats in the page's time zone, so
 * timestamps near midnight can differ. Revisit when the Phase 3 sync engine lands.
 */
export function monthKey(date: Date): string {
  if (Number.isNaN(date.getTime())) throw new RangeError('monthKey: invalid date');
  return date.toISOString().slice(0, 7);
}
