import weekday from './fixtures/weekday.json' with { type: 'json' };
import weekendFallback from './fixtures/weekend-fallback.json' with { type: 'json' };
import unsupported from './fixtures/unsupported.json' with { type: 'json' };
import rangeEurGbp from './fixtures/range-eur-gbp-31d.json' with { type: 'json' };
import rangeShort from './fixtures/range-short.json' with { type: 'json' };
import rangeUnsupported from './fixtures/range-unsupported.json' with { type: 'json' };
import type { CurrencyCode, RangeOutcome, RateOutcome, RatesProvider } from './types.js';

type Fixture = {
  request: { date: string; from: string; to: string };
  response: { status: number; body: unknown };
};

type RangeFixture = {
  request: { base: string; quotes: string[] };
  response: { status: number; body: unknown };
};

const FIXTURES: Fixture[] = [weekday, weekendFallback, unsupported];
const RANGE_FIXTURES: RangeFixture[] = [rangeEurGbp, rangeShort, rangeUnsupported];

function key(date: string, from: string, to: string): string {
  return `${date}|${from}|${to}`;
}

/** Deterministic RatesProvider seeded from the recorded/fabricated fixtures, for tests and e2e-ci. */
export class FakeRates implements RatesProvider {
  private readonly byKey = new Map<string, Fixture>();

  private readonly ranges = new Map<string, RangeFixture>();
  private rangeFails = false;

  constructor(fixtures: Fixture[] = FIXTURES, rangeFixtures: RangeFixture[] = RANGE_FIXTURES) {
    for (const f of rangeFixtures) this.ranges.set(`${f.request.base}|${f.request.quotes}`, f);
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

  /** Test control: make range() throw like a 5xx / network failure. */
  failRange(on: boolean): void {
    this.rangeFails = on;
  }

  async range(
    from: Date,
    to: Date,
    base: CurrencyCode,
    quotes: CurrencyCode[],
  ): Promise<RangeOutcome> {
    if (this.rangeFails) throw new Error('FakeRates: range failed');
    const fixture = this.ranges.get(`${base}|${quotes}`);
    if (!fixture || fixture.response.status !== 200) return { unsupported: true };

    const lo = from.toISOString().slice(0, 10);
    const hi = to.toISOString().slice(0, 10);
    const rates = (fixture.response.body as { rates: Record<string, Record<string, number>> })
      .rates;
    return Object.entries(rates)
      .filter(([date]) => date >= lo && date <= hi)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([date, r]) => ({
        date,
        rates: Object.fromEntries(Object.entries(r).map(([k, v]) => [k, String(v)])),
      }));
  }
}
