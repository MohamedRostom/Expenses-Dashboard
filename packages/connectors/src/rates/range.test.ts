import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import eurGbp from './fixtures/range-eur-gbp-31d.json' with { type: 'json' };
import short from './fixtures/range-short.json' with { type: 'json' };
import unsupported from './fixtures/range-unsupported.json' with { type: 'json' };
import { FrankfurterRates } from './frankfurter.js';
import { FakeRates } from './fake.js';
import { isUnsupported, type RatesProvider } from './types.js';

type RangeFixture = {
  request: { from: string; to: string; base: string; quotes: string[] };
  response: { status: number; body: unknown };
};

const fiveXx = readFileSync(new URL('./fixtures/range-5xx.txt', import.meta.url), 'utf8');

function stub(status: number, body: string): typeof fetch {
  return vi.fn(async () => new Response(body, { status })) as unknown as typeof fetch;
}
function fixtureStub(f: RangeFixture) {
  return stub(f.response.status, JSON.stringify(f.response.body));
}
async function run(p: RatesProvider, f: RangeFixture) {
  const { from, to, base, quotes } = f.request;
  return p.range(new Date(from), new Date(to), base, quotes);
}

describe('range: real client vs fake over the same fixtures', () => {
  it.each([eurGbp, short])('returns identical decimal-string output', async (f) => {
    const real = await run(new FrankfurterRates(fixtureStub(f)), f);
    const fake = await run(new FakeRates(), f);
    expect(real).toEqual(fake);
    expect(Array.isArray(real)).toBe(true);
    const rows = real as { date: string; rates: Record<string, string> }[];
    expect(rows.length).toBe(Object.keys(f.response.body.rates).length);
    for (const r of rows) {
      for (const v of Object.values(r.rates)) expect(typeof v).toBe('string');
      const dow = new Date(r.date).getUTCDay();
      expect([0, 6]).not.toContain(dow); // weekend dates absent
    }
  });

  it('31-day fixture has weekend gaps; short fixture has 12 dates', async () => {
    expect(Object.keys(eurGbp.response.body.rates).length).toBeLessThan(31);
    expect(Object.keys(short.response.body.rates)).toHaveLength(12);
  });

  it('calls the .dev host with from..to and base/quotes', async () => {
    const fetchImpl = fixtureStub(eurGbp);
    await run(new FrankfurterRates(fetchImpl), eurGbp);
    const url = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string;
    expect(url).toBe('https://api.frankfurter.dev/v1/2026-08-31..2026-09-30?from=EUR&to=GBP');
    expect(url).not.toContain('frankfurter.app');
  });

  it('unsupported for an unknown code', async () => {
    const real = await run(new FrankfurterRates(fixtureStub(unsupported)), unsupported);
    const fake = await run(new FakeRates(), unsupported);
    expect(isUnsupported(real as never)).toBe(true);
    expect(fake).toEqual(real);
  });

  it('throws a source error on 5xx and on network failure; fake failRange mirrors it', async () => {
    await expect(run(new FrankfurterRates(stub(503, fiveXx)), eurGbp)).rejects.toThrow();
    const down = vi.fn(async () => {
      throw new TypeError('network');
    }) as unknown as typeof fetch;
    await expect(run(new FrankfurterRates(down), eurGbp)).rejects.toThrow();
    const fake = new FakeRates();
    fake.failRange(true);
    await expect(run(fake, eurGbp)).rejects.toThrow();
    fake.failRange(false);
    await expect(run(fake, eurGbp)).resolves.toBeDefined();
  });
});
