import { describe, it, expect } from 'vitest';
import {
  runCurrencyChange,
  BATCH_SIZE,
  type RowSource,
  type ConvertibleRow,
} from '../src/jobs/currency-change.js';

// T043: proves the batching/progress/idempotency shape against a fake in-memory RowSource,
// since expenses/categories (the real data source) don't exist yet (Phase 2 US2).

function fakeSource(rows: ConvertibleRow[]): { source: RowSource; converted: ConvertibleRow[] } {
  const converted: ConvertibleRow[] = [];
  const source: RowSource = {
    async countTotal() {
      return rows.length;
    },
    async fetchBatch(_userId, offset, limit) {
      return rows.slice(offset, offset + limit);
    },
    async applyConversion(row) {
      converted.push(row);
    },
  };
  return { source, converted };
}

describe('runCurrencyChange', () => {
  it('converts every row and reports progress per batch', async () => {
    const rows: ConvertibleRow[] = Array.from({ length: BATCH_SIZE + 10 }, (_, i) => ({
      id: `row-${i}`,
      amountMinor: 100,
      currency: 'GBP',
    }));
    const { source, converted } = fakeSource(rows);
    const progress: Array<[number, number | undefined]> = [];

    await runCurrencyChange(
      { userId: 'u1', fromCurrency: 'GBP', toCurrency: 'EUR', changeDate: '2026-09-18' },
      source,
      async () => ({ rate: '1.1' }),
      { updateProgress: async (done, total) => void progress.push([done, total]) },
    );

    expect(converted).toHaveLength(rows.length);
    expect(progress[0]).toEqual([0, rows.length]);
    expect(progress.at(-1)).toEqual([rows.length, rows.length]);
    // more than one progress write => it really did batch, not one giant pass
    expect(progress.length).toBeGreaterThan(2);
  });

  it('skips a row whose rate is unsupported, leaving it for rates.retry', async () => {
    const rows: ConvertibleRow[] = [{ id: 'row-1', amountMinor: 100, currency: 'GBP' }];
    const { source, converted } = fakeSource(rows);

    await runCurrencyChange(
      { userId: 'u1', fromCurrency: 'GBP', toCurrency: 'EUR', changeDate: '2026-09-18' },
      source,
      async () => ({ unsupported: true }),
      { updateProgress: async () => {} },
    );

    expect(converted).toHaveLength(0);
  });

  it('is a no-op against zero rows', async () => {
    const { source, converted } = fakeSource([]);
    await runCurrencyChange(
      { userId: 'u1', fromCurrency: 'GBP', toCurrency: 'EUR', changeDate: '2026-09-18' },
      source,
      async () => ({ rate: '1' }),
      { updateProgress: async () => {} },
    );
    expect(converted).toHaveLength(0);
  });
});
