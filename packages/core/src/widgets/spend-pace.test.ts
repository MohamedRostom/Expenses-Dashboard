import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { spendPace } from './spend-pace.js';

const zones = [
  'Pacific/Honolulu',
  'America/New_York',
  'Europe/London',
  'Asia/Kolkata',
  'Pacific/Auckland',
  'Pacific/Kiritimati',
];

function refDaysLeft(timeZone: string, now: Date): number {
  const s = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).format(now); // M/D/YYYY
  const [m, d, y] = s.split('/').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m, 0)).getUTCDate() - d + 1;
}

const nowArb = fc
  .tuple(
    fc.integer({ min: 2024, max: 2028 }),
    fc.integer({ min: 0, max: 11 }),
    fc.integer({ min: 0, max: 30 }),
    fc.integer({ min: -90, max: 90 }), // minutes around UTC midnight
  )
  .map(([y, m, d, off]) => new Date(Date.UTC(y, m, 1 + d, 0, off)));
const zoneArb = fc.constantFrom(...zones);
const budgetsArb = fc.array(fc.option(fc.integer({ min: 0, max: 1_000_000 }), { nil: null }), {
  maxLength: 8,
});

describe('spendPace', () => {
  it('daysLeft matches the calendar in the user zone', () => {
    fc.assert(
      fc.property(nowArb, zoneArb, (now, tz) => {
        expect(spendPace({ tiles: { spent: 0 } }, [], tz, now).daysLeft).toBe(refDaysLeft(tz, now));
      }),
    );
  });

  it('budget, pct, daily and overBudget are consistent integers', () => {
    fc.assert(
      fc.property(
        nowArb,
        zoneArb,
        budgetsArb,
        fc.integer({ min: 0, max: 2_000_000 }),
        (now, tz, budgets, spent) => {
          const p = spendPace({ tiles: { spent } }, budgets, tz, now);
          const known = budgets.filter((b): b is number => b !== null);
          expect(p.spentMinor).toBe(spent);
          expect(p.budgetMinor).toBe(known.length ? known.reduce((a, b) => a + b, 0) : null);
          if (p.budgetMinor === null) {
            expect(p.pct).toBeNull();
            expect(p.overBudget).toBe(false);
            expect(p.dailyToBudgetMinor).toBeNull();
            return;
          }
          expect(p.overBudget).toBe(spent > p.budgetMinor);
          expect(p.pct).toBe(
            p.budgetMinor === 0 ? null : Math.round((100 * spent) / p.budgetMinor),
          );
          if (p.overBudget) {
            expect(p.dailyToBudgetMinor).toBeNull();
          } else {
            const used = p.dailyToBudgetMinor! * p.daysLeft + spent;
            expect(used).toBeLessThanOrEqual(p.budgetMinor);
            expect(p.budgetMinor - used).toBeLessThanOrEqual(p.daysLeft - 1);
            expect(Number.isInteger(p.dailyToBudgetMinor)).toBe(true);
          }
        },
      ),
    );
  });

  it('day 1 with zero spend gives the full budget spread, no NaN', () => {
    const p = spendPace(
      { tiles: { spent: 0 } },
      [3100],
      'Europe/London',
      new Date('2026-10-01T12:00:00Z'),
    );
    expect(p).toMatchObject({ spentMinor: 0, daysLeft: 31, dailyToBudgetMinor: 100, pct: 0 });
  });
});
