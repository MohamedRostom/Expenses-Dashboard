import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { fingerprint } from './fingerprint.js';

describe('fingerprint', () => {
  it('is a 64-char hex SHA-256 digest', async () => {
    const fp = await fingerprint('2026-09-01', 1250, 'GBP', 'Coffee and pastry');
    expect(fp).toMatch(/^[0-9a-f]{64}$/);
  });

  it('normalises case, surrounding whitespace and punctuation before hashing', async () => {
    const a = await fingerprint('2026-09-01', 1250, 'GBP', 'Coffee, and pastry!');
    const b = await fingerprint('2026-09-01', 1250, 'GBP', '  coffee and pastry  ');
    expect(a).toBe(b);
  });

  it('collapses internal whitespace runs', async () => {
    const a = await fingerprint('2026-09-01', 1250, 'GBP', 'Coffee   and\tpastry');
    const b = await fingerprint('2026-09-01', 1250, 'GBP', 'Coffee and pastry');
    expect(a).toBe(b);
  });

  it('differs when date, amount, currency or description differ', async () => {
    const base = await fingerprint('2026-09-01', 1250, 'GBP', 'Coffee');
    expect(await fingerprint('2026-09-02', 1250, 'GBP', 'Coffee')).not.toBe(base);
    expect(await fingerprint('2026-09-01', 1251, 'GBP', 'Coffee')).not.toBe(base);
    expect(await fingerprint('2026-09-01', 1250, 'USD', 'Coffee')).not.toBe(base);
    expect(await fingerprint('2026-09-01', 1250, 'GBP', 'Tea')).not.toBe(base);
  });

  it('property: the same row always yields the same fingerprint', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.date({ min: new Date('2000-01-01'), max: new Date('2030-01-01'), noInvalidDate: true }),
        fc.integer({ min: -1_000_000, max: 1_000_000 }),
        fc.constantFrom('GBP', 'USD', 'EUR'),
        fc.string(),
        async (date, amount, currency, description) => {
          const isoDate = date.toISOString().slice(0, 10);
          const a = await fingerprint(isoDate, amount, currency, description);
          const b = await fingerprint(isoDate, amount, currency, description);
          expect(a).toBe(b);
        },
      ),
    );
  });
});
