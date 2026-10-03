import { describe, expect, it } from 'vitest';
import { WEATHER_PRIVACY_TEXT } from './privacy-text.js';

describe('WEATHER_PRIVACY_TEXT (T048)', () => {
  it('has non-empty string fields', () => {
    for (const k of ['sent', 'deviceLocation', 'storage', 'attribution'] as const) {
      expect(typeof WEATHER_PRIVACY_TEXT[k]).toBe('string');
      expect(WEATHER_PRIVACY_TEXT[k].length).toBeGreaterThan(0);
    }
  });

  it('states what is sent, what is not, and how location is handled', () => {
    expect(WEATHER_PRIVACY_TEXT.sent).toContain('two-decimal');
    expect(WEATHER_PRIVACY_TEXT.sent).toContain('No account or personal data');
    expect(WEATHER_PRIVACY_TEXT.deviceLocation).toContain('once');
    expect(WEATHER_PRIVACY_TEXT.deviceLocation).toContain('rounded');
    expect(WEATHER_PRIVACY_TEXT.storage).toContain('never stored');
    expect(WEATHER_PRIVACY_TEXT.storage).toContain('approximate');
    expect(WEATHER_PRIVACY_TEXT.storage).toContain('always confirmed by you');
  });

  it('cites Open-Meteo.com under CC-BY 4.0', () => {
    expect(WEATHER_PRIVACY_TEXT.attribution).toContain('Open-Meteo.com');
    expect(WEATHER_PRIVACY_TEXT.attribution).toContain('CC-BY 4.0');
  });
});
