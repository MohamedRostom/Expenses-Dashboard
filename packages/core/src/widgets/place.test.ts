import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { cacheKey, nearest, normaliseQuery, roundCoord } from './place.js';

const coord = fc.double({ min: -180, max: 180, noNaN: true });

describe('roundCoord', () => {
  it('is idempotent, at most 2 decimals, within 0.005', () => {
    fc.assert(
      fc.property(coord, (x) => {
        const r = roundCoord(x);
        expect(roundCoord(r)).toBe(r);
        expect(Number(r.toFixed(2))).toBe(r);
        expect(Math.abs(r - x)).toBeLessThanOrEqual(0.005 + 1e-9);
      }),
    );
  });
  it('rounds half away from zero and normalises -0', () => {
    expect(roundCoord(1.005)).toBe(1.01);
    expect(roundCoord(-1.005)).toBe(-1.01);
    expect(Object.is(roundCoord(-0), 0)).toBe(true);
    expect(Object.is(roundCoord(-0.001), 0)).toBe(true);
  });
});

describe('cacheKey', () => {
  it('is equal iff the rounded pairs are equal', () => {
    fc.assert(
      fc.property(coord, coord, coord, coord, (a, b, c, d) => {
        const same = roundCoord(a) === roundCoord(c) && roundCoord(b) === roundCoord(d);
        expect(cacheKey(a, b) === cacheKey(c, d)).toBe(same);
      }),
    );
  });
  it('formats with two decimals', () => {
    expect(cacheKey(53.481, -2.2399)).toBe('53.48,-2.24');
  });
});

describe('normaliseQuery', () => {
  it('trims, collapses whitespace, lowercases', () => {
    expect(normaliseQuery('  Man   CHESter ')).toBe('man chester');
  });
});

describe('nearest', () => {
  const c = [
    { lat: 53.48, lon: -2.24, n: 'a' },
    { lat: 53.5, lon: -2.24, n: 'b' },
  ];
  it('picks the closest within the radius', () => {
    expect(nearest(c, 53.499, -2.24, 0.05)?.n).toBe('b');
    expect(nearest(c, 53.48, -2.2, 0.05)?.n).toBe('a');
  });
  it('includes a candidate exactly on the radius', () => {
    expect(nearest([{ lat: 0.5, lon: 0 }], 0, 0, 0.5)).not.toBeNull();
  });
  it('is null when outside the radius or empty', () => {
    expect(nearest(c, 10, 10, 0.05)).toBeNull();
    expect(nearest([], 0, 0, 0.05)).toBeNull();
  });
});
