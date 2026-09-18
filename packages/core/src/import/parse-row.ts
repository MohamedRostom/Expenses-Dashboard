import { getCurrency, isCurrencyCode } from '../money/currencies.js';

export type DateFormat = 'YYYY-MM-DD' | 'DD/MM/YYYY' | 'MM/DD/YYYY';
export type DecimalSeparator = '.' | ',';

/** Column name/index per field, plus per-batch parsing options — the shape stored in
 * import_profiles.mapping (data-model.md Phase 2). */
export interface ColumnMapping {
  date: string;
  amount: string;
  currency: string;
  description: string;
  category?: string | undefined;
  id?: string | undefined;
  dateFormat: DateFormat;
  decimalSeparator: DecimalSeparator;
}

export interface ParsedRow {
  date: string; // ISO YYYY-MM-DD
  amountMinor: number;
  currency: string;
  description: string;
  categoryHint?: string;
  externalId?: string;
}

export type ParseRowResult = { ok: true; row: ParsedRow } | { ok: false; error: string };

function parseDate(raw: string, format: DateFormat): string | null {
  const value = raw.trim();
  let match: RegExpExecArray | null;
  let year: string, month: string, day: string;
  if (format === 'YYYY-MM-DD') {
    match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) return null;
    [, year, month, day] = match as unknown as [string, string, string, string];
  } else {
    match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value);
    if (!match) return null;
    const [, first, second, y] = match as unknown as [string, string, string, string];
    if (format === 'DD/MM/YYYY') {
      day = first;
      month = second;
    } else {
      month = first;
      day = second;
    }
    year = y;
  }
  const m = Number(month);
  const d = Number(day);
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const iso = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  const parsed = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  // Reject e.g. 31 Feb silently rolling over into March.
  if (
    parsed.getUTCFullYear() !== Number(year) ||
    parsed.getUTCMonth() + 1 !== m ||
    parsed.getUTCDate() !== d
  ) {
    return null;
  }
  return iso;
}

/** Parses a decimal amount string with the given separator into minor units for `currency`.
 * Returns null on a malformed amount or too many decimal places for the currency's exponent. */
function parseAmountMinor(
  raw: string,
  separator: DecimalSeparator,
  currency: string,
): number | null {
  const info = getCurrency(currency);
  const normalized =
    separator === ',' ? raw.trim().replace(/\./g, '').replace(',', '.') : raw.trim();
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(normalized);
  if (!match) return null;
  const [, sign, whole, fraction = ''] = match;
  if (fraction.length > info.exponent) return null;
  const paddedFraction = fraction.padEnd(info.exponent, '0');
  const minor = Number(`${whole}${paddedFraction}`) * (sign === '-' ? -1 : 1);
  if (!Number.isSafeInteger(minor)) return null;
  return minor;
}

/** Parses one raw CSV row (keyed by column name) into a ParsedRow using `mapping`, or an error
 * code/message describing why the row can't be imported. */
export function parseRow(raw: Record<string, string>, mapping: ColumnMapping): ParseRowResult {
  const dateRaw = raw[mapping.date];
  const amountRaw = raw[mapping.amount];
  const currencyRaw = raw[mapping.currency]?.trim().toUpperCase();
  const descriptionRaw = raw[mapping.description];

  if (!dateRaw) return { ok: false, error: 'missing_date' };
  if (!amountRaw) return { ok: false, error: 'missing_amount' };
  if (!currencyRaw) return { ok: false, error: 'missing_currency' };
  if (descriptionRaw === undefined || descriptionRaw === '') {
    return { ok: false, error: 'missing_description' };
  }

  const date = parseDate(dateRaw, mapping.dateFormat);
  if (!date) return { ok: false, error: 'invalid_date' };

  if (!isCurrencyCode(currencyRaw)) return { ok: false, error: 'unknown_currency' };

  const amountMinor = parseAmountMinor(amountRaw, mapping.decimalSeparator, currencyRaw);
  if (amountMinor === null) return { ok: false, error: 'invalid_amount' };
  if (amountMinor === 0) return { ok: false, error: 'zero_amount' };

  const row: ParsedRow = {
    date,
    amountMinor,
    currency: currencyRaw,
    description: descriptionRaw.trim(),
  };
  const categoryHint = mapping.category ? raw[mapping.category]?.trim() : undefined;
  if (categoryHint) row.categoryHint = categoryHint;
  const externalId = mapping.id ? raw[mapping.id]?.trim() : undefined;
  if (externalId) row.externalId = externalId;

  return { ok: true, row };
}
