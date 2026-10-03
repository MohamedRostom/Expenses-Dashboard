export type CurrencyCode = string;

export type RateResult = { rate: string; rateDate: string; source: string };
export type RateOutcome = RateResult | { unsupported: true };

/** research.md R6: query a currency pair for a date, get back the rate actually used
 * (frankfurter itself walks back to the closest prior published date) or `unsupported`. */
export interface RatesProvider {
  rate(date: string, from: CurrencyCode, to: CurrencyCode): Promise<RateOutcome>;
  /** research.md R2: published dates in [from, to] (weekends/holidays absent), rates as decimal
   * strings. `unsupported` for an unknown currency; throws on 5xx or network failure. */
  range(from: Date, to: Date, base: CurrencyCode, quotes: CurrencyCode[]): Promise<RangeOutcome>;
}

export type RangeRow = { date: string; rates: Record<string, string> };
export type RangeOutcome = RangeRow[] | { unsupported: true };

export function isUnsupported(
  outcome: RateOutcome | RangeOutcome,
): outcome is { unsupported: true } {
  return !Array.isArray(outcome) && 'unsupported' in outcome;
}
