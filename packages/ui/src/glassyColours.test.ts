import { describe, expect, it } from 'vitest';
import { contrastRatio } from './contrast.js';
import { backdropStops, glassOver, onColour, safeAccent } from './glassyColours.js';

// Any colour a person can pick, including the awkward ones.
const ANY = [
  '#ffffff',
  '#000000',
  '#ffff00',
  '#ff0000',
  '#808080',
  '#767676',
  '#0e3d2a',
  '#7fd1a8',
];

describe('free colours stay readable (ADR-0008 mock-up)', () => {
  it.each(ANY)('text on %s is black or white at AA', (c) => {
    expect(contrastRatio(onColour(c), c)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(ANY)('accent %s is nudged until bars show at 3:1 on any panel', (c) => {
    expect(contrastRatio(safeAccent(c, false), '#ffffff')).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(safeAccent(c, true), '#000000')).toBeGreaterThanOrEqual(3);
  });

  it('leaves an accent that already shows untouched', () => {
    expect(safeAccent('#0e3d2a', false)).toBe('#0e3d2a');
  });

  // The worst backdrop tint is black in light and white in dark: the cap bounds how far it goes.
  it('light: any backdrop tint keeps text AA on the ground and under glass', () => {
    const stop = backdropStops('#000000', false)[0]!;
    const panel = glassOver(stop, false);
    expect(contrastRatio('#14171b', stop)).toBeGreaterThanOrEqual(4.5); // greeting, on the ground
    expect(contrastRatio('#4b535b', panel)).toBeGreaterThanOrEqual(4.5); // muted
    expect(contrastRatio('#b00020', panel)).toBeGreaterThanOrEqual(4.5); // Cancel Red
  });

  it('dark: any backdrop tint keeps text AA on the ground and under glass', () => {
    const stop = backdropStops('#ffffff', true)[0]!;
    const panel = glassOver(stop, true);
    expect(contrastRatio('#f2f2ee', stop)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio('#a7adb3', panel)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio('#ff6b6b', panel)).toBeGreaterThanOrEqual(4.5);
  });
});
