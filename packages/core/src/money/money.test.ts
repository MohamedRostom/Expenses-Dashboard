import fc from 'fast-check';
import { CURRENCIES } from './currencies.js';
import { Money, add, formatMajor, negate, parseMajor } from './money.js';

const currencyCodes = CURRENCIES.map((c) => c.code);

describe('Money', () => {
  it('rejects non-safe-integer minor amounts', () => {
    expect(() => Money(1.5, 'GBP')).toThrow(RangeError);
    expect(() => Money(Number.MAX_SAFE_INTEGER + 1, 'GBP')).toThrow(RangeError);
    expect(() => Money(NaN, 'GBP')).toThrow(RangeError);
  });

  it('rejects zero', () => {
    expect(() => Money(0, 'GBP')).toThrow(RangeError);
  });

  it('rejects unknown currency codes', () => {
    expect(() => Money(100, 'XXX')).toThrow(RangeError);
  });

  it('parse/format round-trips for every currency in the table', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...currencyCodes),
        fc.integer({ min: 1, max: 1_000_000 }),
        (code, majorUnits) => {
          const info = CURRENCIES.find((c) => c.code === code)!;
          const major = (majorUnits / 10 ** info.exponent).toFixed(info.exponent);
          const money = parseMajor(major, code);
          expect(formatMajor(money)).toBe(major);
        },
      ),
    );
  });

  it('sums are exact integers', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -1_000_000, max: 1_000_000 }).filter((n) => n !== 0),
        fc.array(
          fc.integer({ min: -1_000_000, max: 1_000_000 }).filter((n) => n !== 0),
          {
            maxLength: 20,
          },
        ),
        (first, rest) => {
          // Money can never be zero (T008), so skip runs whose running total passes through it.
          let running = first;
          for (const m of rest) {
            running += m;
            fc.pre(running !== 0);
          }
          const total = rest.reduce((sum, m) => add(sum, Money(m, 'GBP')), Money(first, 'GBP'));
          expect(total.minor).toBe(running);
        },
      ),
    );
  });

  it('add throws on currency mismatch', () => {
    expect(() => add(Money(100, 'GBP'), Money(100, 'USD'))).toThrow(RangeError);
  });

  it('negate flips the sign and keeps the currency', () => {
    const m = Money(500, 'GBP');
    expect(negate(m)).toEqual(Money(-500, 'GBP'));
  });
});
