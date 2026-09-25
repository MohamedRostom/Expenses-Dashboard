import { describe, expect, it } from 'vitest';
import { describeDevice, formatDate, formatMoney } from './format.js';

describe('formatMoney', () => {
  it('formats GBP (exponent 2) with ISO code appended', () => {
    expect(formatMoney(1234, 'GBP', 'en-GB')).toBe('£12.34 GBP');
  });

  it('formats JPY (exponent 0, no decimals)', () => {
    expect(formatMoney(1234, 'JPY', 'en-GB')).toBe('JP¥1,234 JPY');
  });

  it('formats KWD (exponent 3)', () => {
    const result = formatMoney(1234, 'KWD', 'en-GB');
    expect(result).toMatch(/1\.234/);
    expect(result.endsWith('KWD')).toBe(true);
  });
});

describe('formatDate', () => {
  it('formats an ISO date string', () => {
    expect(formatDate('2026-09-18', 'en-GB')).toBe('18 Sept 2026');
  });
});

describe('describeDevice', () => {
  it('names Chrome on Windows', () => {
    const ua =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';
    expect(describeDevice(ua)).toBe('Chrome on Windows');
  });

  it('names Safari on iOS, not confused with the Chrome/Safari overlap', () => {
    const ua =
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
    expect(describeDevice(ua)).toBe('Safari on iOS');
  });

  it('names Firefox on Linux', () => {
    expect(
      describeDevice('Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0'),
    ).toBe('Firefox on Linux');
  });

  it('falls back to "Unknown device" for a missing user agent', () => {
    expect(describeDevice(null)).toBe('Unknown device');
  });

  it('falls back to "Unknown device" for an unrecognised user agent', () => {
    expect(describeDevice('curl/8.4.0')).toBe('Unknown device');
  });
});
