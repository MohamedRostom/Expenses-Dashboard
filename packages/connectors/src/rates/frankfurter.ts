import type { CurrencyCode, RangeOutcome, RateOutcome, RatesProvider } from './types.js';

type FrankfurterBody = {
  amount: number;
  base: string;
  date: string;
  rates: Record<string, number>;
};

// frankfurter.app now 301-redirects every request to this host (moved after ADR-0005 was
// written); hitting it directly skips a cross-domain redirect hop that some networks won't
// follow, which is what was surfacing as `rate_unavailable` for every non-same-currency lookup.
const BASE_URL = 'https://api.frankfurter.dev/v1';

/**
 * Thin HTTP client over frankfurter.app. A single call already returns the fallback date
 * (frankfurter itself walks back to the closest prior published business day and reports it
 * in the top-level `date` field — see research.md R6), so there is no retry loop here: one
 * request either comes back with the pair or 404s, and a 404 or a missing `to` key in `rates`
 * both mean `unsupported`. The same-currency shortcut (rate "1") is the cache wrapper's job
 * (apps/api/src/services/rates.ts), not this client's.
 */
export class FrankfurterRates implements RatesProvider {
  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  async rate(date: string, from: CurrencyCode, to: CurrencyCode): Promise<RateOutcome> {
    const url = `${BASE_URL}/${date}?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
    // No timeout here previously — a hung connection would block the expense create/patch
    // request (or the currency-change/rates.warm job) indefinitely.
    let res: Response;
    try {
      res = await this.fetchImpl(url, { signal: AbortSignal.timeout(5000) });
    } catch {
      return { unsupported: true };
    }
    if (!res.ok) return { unsupported: true };

    const body = (await res.json()) as FrankfurterBody;
    const rate = body.rates[to];
    if (rate === undefined) return { unsupported: true };

    return { rate: String(rate), rateDate: body.date, source: 'frankfurter' };
  }

  async range(
    from: Date,
    to: Date,
    base: CurrencyCode,
    quotes: CurrencyCode[],
  ): Promise<RangeOutcome> {
    const day = (d: Date) => d.toISOString().slice(0, 10);
    const url = `${BASE_URL}/${day(from)}..${day(to)}?from=${encodeURIComponent(base)}&to=${quotes.map(encodeURIComponent).join(',')}`;
    // Network failure and 5xx throw (a source error, unlike rate(): the backfill job retries).
    const res = await this.fetchImpl(url, { signal: AbortSignal.timeout(10000) });
    if (res.status === 404 || res.status === 422) return { unsupported: true };
    if (!res.ok)
      throw Object.assign(new Error(`frankfurter range failed: ${res.status}`), {
        status: res.status,
      });

    const body = (await res.json()) as { rates: Record<string, Record<string, number>> };
    // ponytail: String(number) is the shortest round-trip repr; fine for ECB's <=6 decimals.
    return Object.entries(body.rates)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([date, r]) => ({
        date,
        rates: Object.fromEntries(Object.entries(r).map(([k, v]) => [k, String(v)])),
      }));
  }
}
