import fc from 'fast-check';
import { convert } from './convert.js';
import { Money, add } from './money.js';

describe('convert', () => {
  it('rounds half-even on exact .5 minor units, both directions', () => {
    // 2.5 -> 2 (round down, even), 3.5 -> 4 (round up, even): exponent-preserving rate of 0.5.
    expect(convert(Money(5, 'GBP'), '0.5', 'GBP').minor).toBe(2);
    expect(convert(Money(7, 'GBP'), '0.5', 'GBP').minor).toBe(4);
    // Same again with negative amounts.
    expect(convert(Money(-5, 'GBP'), '0.5', 'GBP').minor).toBe(-2);
    expect(convert(Money(-7, 'GBP'), '0.5', 'GBP').minor).toBe(-4);
  });

  it('changes exponent 2 -> 0 (GBP -> JPY)', () => {
    // 12.34 GBP * rate 10 -> 123.40 JPY minor units at exponent 0 -> 123
    const result = convert(Money(1234, 'GBP'), '10', 'JPY');
    expect(result.currency).toBe('JPY');
    expect(result.minor).toBe(123);
  });

  it('changes exponent 2 -> 3 (GBP -> KWD)', () => {
    const result = convert(Money(100, 'GBP'), '0.25', 'KWD');
    expect(result.currency).toBe('KWD');
    expect(result.minor).toBe(250); // 1.00 GBP * 0.25 = 0.250 KWD = 250 minor units
  });

  it('changes exponent 0 -> 0 (JPY -> KRW), identity rate', () => {
    const result = convert(Money(1000, 'JPY'), '1', 'KRW');
    expect(result.currency).toBe('KRW');
    expect(result.minor).toBe(1000);
  });

  it('convert(sum) is within one minor unit of sum(convert) per row', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 1, max: 100_000 }), { minLength: 1, maxLength: 15 }),
        fc.integer({ min: 1, max: 999999 }),
        (minors, rateThousandths) => {
          const rate = (rateThousandths / 1000).toFixed(6);
          const moneys = minors.map((m) => Money(m, 'GBP'));
          const summed = moneys.reduce((sum, m) => add(sum, m));
          // A row whose converted value rounds to zero can't be Money (T008 forbids zero);
          // that is a real edge case, not a bug in convert, so skip it rather than failing.
          let convertedRows: ReturnType<typeof convert>[];
          let convertedSum: ReturnType<typeof convert>;
          try {
            convertedRows = moneys.map((m) => convert(m, rate, 'EUR'));
            convertedSum = convert(summed, rate, 'EUR');
          } catch (err) {
            if (err instanceof RangeError) {
              fc.pre(false);
              return;
            }
            throw err;
          }
          const sumOfConverted = convertedRows.reduce((sum, m) => add(sum, m));
          const diff = Math.abs(convertedSum.minor - sumOfConverted.minor);
          expect(diff).toBeLessThanOrEqual(moneys.length);
        },
      ),
    );
  });
});
