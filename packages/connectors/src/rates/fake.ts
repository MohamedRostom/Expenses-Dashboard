import weekday from './fixtures/weekday.json' with { type: 'json' };
import weekendFallback from './fixtures/weekend-fallback.json' with { type: 'json' };
import unsupported from './fixtures/unsupported.json' with { type: 'json' };
import type { CurrencyCode, RateOutcome, RatesProvider } from './types.js';

type Fixture = {
  request: { date: string; from: string; to: string };
  response: { status: number; body: unknown };
};

const FIXTURES: Fixture[] = [weekday, weekendFallback, unsupported];

function key(date: string, from: string, to: string): string {
  return `${date}|${from}|${to}`;
}

/** Deterministic RatesProvider seeded from the recorded/fabricated fixtures, for tests and e2e-ci. */
export class FakeRates implements RatesProvider {
  private readonly byKey = new Map<string, Fixture>();

  constructor(fixtures: Fixture[] = FIXTURES) {
    for (const f of fixtures) {
      this.byKey.set(key(f.request.date, f.request.from, f.request.to), f);
    }
  }

  async rate(date: string, from: CurrencyCode, to: CurrencyCode): Promise<RateOutcome> {
    const fixture = this.byKey.get(key(date, from, to));
    if (!fixture || fixture.response.status !== 200) return { unsupported: true };

    const body = fixture.response.body as { date?: string; rates?: Record<string, number> };
    const rate = body.rates?.[to];
    if (rate === undefined || body.date === undefined) return { unsupported: true };

    return { rate: String(rate), rateDate: body.date, source: 'frankfurter' };
  }
}
