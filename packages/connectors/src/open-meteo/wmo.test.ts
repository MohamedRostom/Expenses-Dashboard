import { describe, expect, it } from 'vitest';
import { WEATHER_ICONS, wmo } from './wmo.js';

describe('wmo', () => {
  it('maps every integer 0..99 to a condition and a known icon', () => {
    for (let code = 0; code <= 99; code++) {
      const r = wmo(code);
      expect(r.condition.length).toBeGreaterThan(0);
      expect(WEATHER_ICONS).toContain(r.icon);
    }
  });

  it('spot checks', () => {
    expect(wmo(0)).toEqual({ condition: 'Clear sky', icon: 'sun' });
    expect(wmo(61).icon).toBe('rain');
    expect(wmo(95)).toEqual({ condition: 'Thunderstorm', icon: 'thunder' });
  });

  it('out-of-range or non-integer codes fall back', () => {
    expect(wmo(100)).toEqual({ condition: 'Unknown', icon: 'cloud' });
    expect(wmo(-1).condition).toBe('Unknown');
    expect(wmo(1.5).condition).toBe('Unknown');
  });
});
