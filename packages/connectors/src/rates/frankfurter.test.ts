import { describe, expect, it, vi } from 'vitest';
import weekday from './fixtures/weekday.json' with { type: 'json' };
import weekendFallback from './fixtures/weekend-fallback.json' with { type: 'json' };
import unsupported from './fixtures/unsupported.json' with { type: 'json' };
import { FrankfurterRates } from './frankfurter.js';
import { FakeRates } from './fake.js';
import type { RatesProvider } from './types.js';

type Fixture = {
  request: { date: string; from: string; to: string };
  response: { status: number; body: unknown };
};

function fetchFixture(fixture: Fixture): typeof fetch {
  return vi.fn(
    async () =>
      new Response(JSON.stringify(fixture.response.body), { status: fixture.response.status }),
  ) as unknown as typeof fetch;
}

describe.each<[string, (fixture: Fixture) => RatesProvider]>([
  ['FrankfurterRates', (fixture) => new FrankfurterRates(fetchFixture(fixture))],
  // FakeRates ignores the fixture arg — it's already seeded from all three fixtures.
  ['FakeRates', () => new FakeRates()],
])('%s', (_name, makeProvider) => {
  it('weekday: returns the rate for the requested date', async () => {
    const provider = makeProvider(weekday);

    const result = await provider.rate(
      weekday.request.date,
      weekday.request.from,
      weekday.request.to,
    );

    expect(result).toEqual({
      rate: String(weekday.response.body.rates.EUR),
      rateDate: weekday.response.body.date,
      source: 'frankfurter',
    });
  });

  it('weekend: falls back to the nearest prior published date, reported in rateDate', async () => {
    const provider = makeProvider(weekendFallback);

    const result = await provider.rate(
      weekendFallback.request.date,
      weekendFallback.request.from,
      weekendFallback.request.to,
    );

    expect(result).toEqual({
      rate: String(weekendFallback.response.body.rates.EUR),
      rateDate: weekendFallback.response.body.date,
      source: 'frankfurter',
    });
    expect((result as { rateDate: string }).rateDate).not.toBe(weekendFallback.request.date);
  });

  it('unsupported: an unsupported currency pair returns the unsupported marker', async () => {
    const provider = makeProvider(unsupported);

    const result = await provider.rate(
      unsupported.request.date,
      unsupported.request.from,
      unsupported.request.to,
    );

    expect(result).toEqual({ unsupported: true });
  });
});
