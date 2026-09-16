/**
 * "YYYY-MM" for a date, using its UTC calendar day. Matches the Notion `Month`
 * formula (formatDate(prop("Date"), "YYYY-MM")) so both sides bucket expenses identically.
 */
export function monthKey(date: Date): string {
  if (Number.isNaN(date.getTime())) throw new RangeError('monthKey: invalid date');
  return date.toISOString().slice(0, 7);
}
