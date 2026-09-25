import type { CurrencyCode, RateOutcome, RatesProvider } from './types.js';

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
}
