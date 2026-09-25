import { getCurrency } from './currencies.js';

/** Amount in integer minor units of `currency`. Never a float, never zero, never unsafe. */
export interface MoneyValue {
  readonly minor: number;
  readonly currency: string;
}

/** Constructs a Money value. Throws RangeError on a non-safe-integer, zero, or unknown currency. */
export function Money(minor: number, currency: string): MoneyValue {
  if (!Number.isSafeInteger(minor)) {
    throw new RangeError(`Money: minor units must be a safe integer, got ${minor}`);
  }
  if (minor === 0) throw new RangeError('Money: amount must not be zero');
  getCurrency(currency); // throws RangeError on an unknown code
  return { minor, currency };
}

/** Parses a decimal major-unit string (e.g. "12.34") into Money for `currency`. */
export function parseMajor(major: string, currency: string): MoneyValue {
  const info = getCurrency(currency);
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(major.trim());
  if (!match) throw new RangeError(`parseMajor: not a decimal amount: ${major}`);
  const [, sign, whole, fraction = ''] = match;
  if (fraction.length > info.exponent) {
    throw new RangeError(
      `parseMajor: ${currency} has ${info.exponent} decimal places, got ${major}`,
    );
  }
  const paddedFraction = fraction.padEnd(info.exponent, '0');
  const minor = Number(`${whole}${paddedFraction}`) * (sign === '-' ? -1 : 1);
  return Money(minor, currency);
}

/** Formats Money back to a decimal major-unit string with the currency's fixed exponent. */
export function formatMajor(money: MoneyValue): string {
  const info = getCurrency(money.currency);
  const sign = money.minor < 0 ? '-' : '';
  const abs = Math.abs(money.minor)
    .toString()
    .padStart(info.exponent + 1, '0');
  if (info.exponent === 0) return `${sign}${abs}`;
  const cut = abs.length - info.exponent;
  return `${sign}${abs.slice(0, cut)}.${abs.slice(cut)}`;
}

/** Adds two Money values of the same currency. Throws RangeError on a currency mismatch. */
export function add(a: MoneyValue, b: MoneyValue): MoneyValue {
  if (a.currency !== b.currency) {
    throw new RangeError(`add: currency mismatch ${a.currency} vs ${b.currency}`);
  }
  return Money(a.minor + b.minor, a.currency);
}

/** Flips the sign, keeping the currency. */
export function negate(money: MoneyValue): MoneyValue {
  return Money(-money.minor, money.currency);
}
