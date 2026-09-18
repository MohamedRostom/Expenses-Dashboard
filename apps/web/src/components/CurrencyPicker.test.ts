import { describe, expect, it } from 'vitest';
import { filterCurrencies } from './currencyFilter.js';

const currencies = [
  { code: 'USD', name: 'US Dollar', exponent: 2 },
  { code: 'GBP', name: 'British Pound', exponent: 2 },
  { code: 'JPY', name: 'Japanese Yen', exponent: 0 },
];

describe('filterCurrencies', () => {
  it('returns everything for an empty query', () => {
    expect(filterCurrencies(currencies, '')).toHaveLength(3);
  });

  it('matches by code, case-insensitively', () => {
    expect(filterCurrencies(currencies, 'gbp')).toEqual([currencies[1]]);
  });

  it('matches by name substring', () => {
    expect(filterCurrencies(currencies, 'yen')).toEqual([currencies[2]]);
  });

  it('returns no matches for an unrelated query', () => {
    expect(filterCurrencies(currencies, 'zzz')).toEqual([]);
  });
});
