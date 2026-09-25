import { describe, expect, it } from 'vitest';
import { parseRow, type ColumnMapping } from './parse-row.js';

const baseMapping: ColumnMapping = {
  date: 'date',
  amount: 'amount',
  currency: 'currency',
  description: 'description',
  dateFormat: 'YYYY-MM-DD',
  decimalSeparator: '.',
};

describe('parseRow', () => {
  it('parses an ISO date row', () => {
    const result = parseRow(
      { date: '2026-09-01', amount: '12.50', currency: 'GBP', description: 'Coffee' },
      baseMapping,
    );
    expect(result).toEqual({
      ok: true,
      row: { date: '2026-09-01', amountMinor: 1250, currency: 'GBP', description: 'Coffee' },
    });
  });

  it('parses DD/MM/YYYY dates', () => {
    const result = parseRow(
      { date: '25/12/2026', amount: '5.00', currency: 'GBP', description: 'x' },
      { ...baseMapping, dateFormat: 'DD/MM/YYYY' },
    );
    expect(result).toEqual({ ok: true, row: expect.objectContaining({ date: '2026-12-25' }) });
  });

  it('parses MM/DD/YYYY dates', () => {
    const result = parseRow(
      { date: '12/25/2026', amount: '5.00', currency: 'GBP', description: 'x' },
      { ...baseMapping, dateFormat: 'MM/DD/YYYY' },
    );
    expect(result).toEqual({ ok: true, row: expect.objectContaining({ date: '2026-12-25' }) });
  });

  it('rejects an invalid calendar date', () => {
    const result = parseRow(
      { date: '31/02/2026', amount: '5.00', currency: 'GBP', description: 'x' },
      { ...baseMapping, dateFormat: 'DD/MM/YYYY' },
    );
    expect(result).toEqual({ ok: false, error: 'invalid_date' });
  });

  it('parses comma decimal separator', () => {
    const result = parseRow(
      { date: '2026-09-01', amount: '1.234,56', currency: 'GBP', description: 'x' },
      { ...baseMapping, decimalSeparator: ',' },
    );
    expect(result).toEqual({ ok: true, row: expect.objectContaining({ amountMinor: 123456 }) });
  });

  it('rejects too many decimal places for the currency exponent', () => {
    const result = parseRow(
      { date: '2026-09-01', amount: '12.505', currency: 'GBP', description: 'x' },
      baseMapping,
    );
    expect(result).toEqual({ ok: false, error: 'invalid_amount' });
  });

  it('rejects an unknown currency code', () => {
    const result = parseRow(
      { date: '2026-09-01', amount: '12.50', currency: 'ZZZ', description: 'x' },
      baseMapping,
    );
    expect(result).toEqual({ ok: false, error: 'unknown_currency' });
  });

  it('rejects a zero amount', () => {
    const result = parseRow(
      { date: '2026-09-01', amount: '0.00', currency: 'GBP', description: 'x' },
      baseMapping,
    );
    expect(result).toEqual({ ok: false, error: 'zero_amount' });
  });

  it('rejects a missing description', () => {
    const result = parseRow(
      { date: '2026-09-01', amount: '12.50', currency: 'GBP', description: '' },
      baseMapping,
    );
    expect(result).toEqual({ ok: false, error: 'missing_description' });
  });

  it('picks up categoryHint and externalId when mapped', () => {
    const result = parseRow(
      {
        date: '2026-09-01',
        amount: '12.50',
        currency: 'GBP',
        description: 'Coffee',
        category: 'Eating out',
        rowId: 'abc-123',
      },
      { ...baseMapping, category: 'category', id: 'rowId' },
    );
    expect(result).toEqual({
      ok: true,
      row: expect.objectContaining({ categoryHint: 'Eating out', externalId: 'abc-123' }),
    });
  });
});
