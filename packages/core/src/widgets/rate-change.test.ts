import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { rateChanges } from './rate-change.js';

const day = (i: number) => new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10);
const series = (rates: string[]) => rates.map((rate, i) => ({ date: day(i), rate }));

// 4-decimal rates as strings from integers, so a float oracle is exact enough.
const rateArb = fc.integer({ min: 1000, max: 30000 }).map((n) => (n / 10000).toFixed(4));
const historyArb = fc.array(rateArb, { minLength: 2, maxLength: 60 }).map((rs) => series(rs));

describe('rateChanges', () => {
  it('throws on an empty list', () => {
    expect(() => rateChanges([])).toThrow();
  });

  it('one date gives both changes null', () => {
    expect(rateChanges(series(['1.1']))).toEqual({ prevChange: null, monthChange: null });
  });

  it('prev compares the last two dates; pct is within half a tenth of the float oracle', () => {
    fc.assert(
      fc.property(historyArb, (h) => {
        const { prevChange } = rateChanges(h);
        const a = Number(h[h.length - 2]!.rate);
        const b = Number(h[h.length - 1]!.rate);
        expect(prevChange!.since).toBe(h[h.length - 2]!.date);
        expect(Math.abs(Number(prevChange!.pct) - (100 * (b - a)) / a)).toBeLessThanOrEqual(
          0.0500001,
        );
        expect(prevChange!.pct).toMatch(/^-?\d+\.\d$/);
        const expectedDir = prevChange!.pct === '0.0' ? 'flat' : b > a ? 'up' : 'down';
        expect(prevChange!.direction).toBe(expectedDir);
      }),
    );
  });

  it('month compares the last date with the earliest date at or after last-30d; since only when history is shorter', () => {
    fc.assert(
      fc.property(
        fc.array(rateArb, { minLength: 2, maxLength: 80 }),
        fc.boolean(),
        (rs, skipWeekends) => {
          // calendar dates, optionally with weekend gaps like real published rates
          const h = series(rs)
            .map((p, i) => ({ ...p, i }))
            .filter((p) => !skipWeekends || ![0, 6].includes(new Date(p.date).getUTCDay()))
            .map(({ date, rate }) => ({ date, rate }));
          fc.pre(h.length >= 2);
          const last = h[h.length - 1]!;
          const cutoff = new Date(Date.parse(last.date) - 30 * 86_400_000)
            .toISOString()
            .slice(0, 10);
          const base = h.find((p) => p.date >= cutoff)!;
          const { monthChange } = rateChanges(h);
          if (h[0]!.date > cutoff) expect(monthChange!.since).toBe(h[0]!.date);
          else expect(monthChange!.since).toBeUndefined();
          const a = Number(base.rate);
          expect(
            Math.abs(Number(monthChange!.pct) - (100 * (Number(last.rate) - a)) / a),
          ).toBeLessThanOrEqual(0.0500001);
        },
      ),
    );
  });

  it('31 calendar days with weekend gaps reach back 30 days: no since; 12 dates: since', () => {
    const cal = (n: number) =>
      Array.from({ length: n }, (_, i) => day(i - 1))
        .filter((d) => ![0, 6].includes(new Date(d).getUTCDay()))
        .map((date) => ({ date, rate: '1.1' }));
    const full = cal(31); // 2025-12-31 (Wed)..2026-01-30 (Fri)
    expect(full.length).toBeLessThan(31);
    expect(rateChanges(full).monthChange!.since).toBeUndefined();
    const short = cal(16).slice(0, 12);
    expect(short).toHaveLength(12);
    expect(rateChanges(short).monthChange!.since).toBe(short[0]!.date);
  });

  it('uses scaled integers: 10-digit rates are exact', () => {
    // 1.1234567891 * 1.2 = 1.34814814692 -> exactly +20.0%
    const r = rateChanges(series(['1.1234567891', '1.34814814692']));
    expect(r.prevChange).toEqual({ pct: '20.0', direction: 'up', since: day(0) });
  });

  it('rounds half away from zero (half-up on the magnitude)', () => {
    expect(rateChanges(series(['2', '2.001'])).prevChange!.pct).toBe('0.1');
    const down = rateChanges(series(['2', '1.999'])).prevChange!;
    expect(down).toMatchObject({ pct: '-0.1', direction: 'down' });
  });

  it('equal or sub-tenth moves are flat', () => {
    expect(rateChanges(series(['1.5', '1.5'])).prevChange).toMatchObject({
      pct: '0.0',
      direction: 'flat',
    });
    expect(rateChanges(series(['1.2345', '1.2346'])).prevChange!.direction).toBe('flat');
  });
});
