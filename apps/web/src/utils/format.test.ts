import { describe, expect, it } from 'vitest';
import { formatDate, formatMoney } from './format.js';

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
