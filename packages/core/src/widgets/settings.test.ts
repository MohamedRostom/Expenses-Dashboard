import { describe, expect, it } from 'vitest';
import {
  CURRENCY_CAP,
  WIDGET_KINDS,
  WIDGET_LIMIT,
  settingsDescriptor,
  validateSettings,
} from './settings.js';

const convertible = new Set(['USD', 'EUR', 'JPY', 'CAD', 'AUD', 'CHF', 'SEK', 'GBP']);
const ctx = { defaultCurrency: 'GBP', convertible, previous: [] as string[], placeId: 'p1' };
const cur = (currencies: unknown, c = ctx) => validateSettings('currency', { currencies }, c);

describe('constants', () => {
  it('has the limits and kinds', () => {
    expect(WIDGET_LIMIT).toBe(8);
    expect(CURRENCY_CAP).toBe(6);
    expect([...WIDGET_KINDS]).toEqual([
      'currency',
      'weather',
      'sunrise',
      'spend_pace',
      'fixed_costs',
    ]);
  });
});

describe('currency settings', () => {
  it('accepts 1 to 6 convertible codes', () => {
    expect(cur(['USD'])).toEqual([]);
    expect(cur(['USD', 'EUR', 'JPY', 'CAD', 'AUD', 'CHF'])).toEqual([]);
  });
  it('refuses zero and seven codes', () => {
    expect(cur([])).not.toEqual([]);
    expect(cur(['USD', 'EUR', 'JPY', 'CAD', 'AUD', 'CHF', 'SEK'])).not.toEqual([]);
  });
  it('refuses an unknown code, naming it', () => {
    const issues = cur(['USD', 'XYZ']);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.message).toContain('XYZ');
  });
  it('refuses the default currency when being added, naming it', () => {
    const issues = cur(['GBP']);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.message).toContain('GBP');
  });
  it('accepts a previous code that is now the default', () => {
    expect(cur(['GBP', 'USD'], { ...ctx, previous: ['GBP'] })).toEqual([]);
  });
  it('refuses duplicates, naming the code', () => {
    const issues = cur(['USD', 'USD']);
    expect(issues[0]!.message).toContain('USD');
  });
  it('refuses a non-array or unknown keys', () => {
    expect(cur('USD')).not.toEqual([]);
    expect(validateSettings('currency', { currencies: ['USD'], x: 1 }, ctx)).not.toEqual([]);
  });
});

describe('other kinds', () => {
  it.each(['weather', 'sunrise'] as const)('%s needs {} and a place id', (k) => {
    expect(validateSettings(k, {}, ctx)).toEqual([]);
    expect(validateSettings(k, {}, { ...ctx, placeId: null })).toEqual([
      { path: 'place_id', message: expect.any(String) },
    ]);
    expect(validateSettings(k, {}, { ...ctx, placeId: '' })).toHaveLength(1);
    expect(validateSettings(k, { a: 1 }, ctx)).not.toEqual([]);
  });
  it.each(['spend_pace', 'fixed_costs'] as const)('%s accepts {} only', (k) => {
    expect(validateSettings(k, {}, { ...ctx, placeId: null })).toEqual([]);
    expect(validateSettings(k, { a: 1 }, ctx)).not.toEqual([]);
  });
});

describe('settingsDescriptor', () => {
  it('describes currency fields and empty others', () => {
    expect(settingsDescriptor('currency').fields[0]).toMatchObject({ name: 'currencies', max: 6 });
    expect(settingsDescriptor('spend_pace').fields).toEqual([]);
  });
});
