import { monthKey } from './month-key.js';

describe('monthKey', () => {
  it('formats a date as YYYY-MM', () => {
    expect(monthKey(new Date('2026-09-16T20:00:00Z'))).toBe('2026-09');
  });

  it('uses the UTC day so a month boundary is not crossed by local time', () => {
    expect(monthKey(new Date('2026-01-31T23:30:00Z'))).toBe('2026-01');
    expect(monthKey(new Date('2026-02-01T00:00:00Z'))).toBe('2026-02');
  });

  it('rejects invalid dates', () => {
    expect(() => monthKey(new Date('nope'))).toThrow(RangeError);
  });
});
