import { getCurrency } from './currencies.js';
import { Money, type MoneyValue } from './money.js';

/** Rounds |num/den| to the nearest integer, ties to even, then reapplies the sign. */
export function roundHalfEven(num: bigint, den: bigint): bigint {
  const negative = num < 0n !== den < 0n;
  const n = num < 0n ? -num : num;
  const d = den < 0n ? -den : den;
  const quotient = n / d;
  const remainder = n % d;
  const twiceRemainder = remainder * 2n;
  const roundUp = twiceRemainder > d || (twiceRemainder === d && quotient % 2n === 1n);
  const result = roundUp ? quotient + 1n : quotient;
  return negative ? -result : result;
}

function parseDecimal(value: string): { intVal: bigint; exp: number } {
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(value.trim());
  if (!match) throw new RangeError(`convert: not a decimal rate: ${value}`);
  const [, sign, whole, fraction = ''] = match;
  return { intVal: BigInt(`${sign}${whole}${fraction}`), exp: fraction.length };
}

/**
 * Converts Money to another currency using a decimal-string exchange rate, as scaled-integer
 * multiplication (no floating point) with half-even rounding to the target exponent.
 */
export function convert(money: MoneyValue, rate: string, to: string): MoneyValue {
  const fromInfo = getCurrency(money.currency);
  const toInfo = getCurrency(to);
  const { intVal: rateInt, exp: rateExp } = parseDecimal(rate);

  const numerator = BigInt(money.minor) * rateInt;
  const pow = toInfo.exponent - fromInfo.exponent - rateExp;
  const resultBig =
    pow >= 0 ? numerator * 10n ** BigInt(pow) : roundHalfEven(numerator, 10n ** BigInt(-pow));

  const resultMinor = Number(resultBig);
  if (!Number.isSafeInteger(resultMinor)) {
    throw new RangeError('convert: result exceeds the safe integer range');
  }
  // A tiny amount (e.g. 1 JPY into GBP) can legitimately round to zero — that's a real
  // conversion result, not invalid input, so it skips Money()'s "never zero" guard (which
  // exists to catch zero *user input*, not a rounding outcome).
  if (resultMinor === 0) {
    getCurrency(to); // still validate the currency code
    return { minor: 0, currency: to };
  }
  return Money(resultMinor, to);
}
