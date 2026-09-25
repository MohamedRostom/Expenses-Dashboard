export type CurrencyCode = string;

export type RateResult = { rate: string; rateDate: string; source: string };
export type RateOutcome = RateResult | { unsupported: true };

/** research.md R6: query a currency pair for a date, get back the rate actually used
 * (frankfurter itself walks back to the closest prior published date) or `unsupported`. */
export interface RatesProvider {
  rate(date: string, from: CurrencyCode, to: CurrencyCode): Promise<RateOutcome>;
}

export function isUnsupported(outcome: RateOutcome): outcome is { unsupported: true } {
  return 'unsupported' in outcome;
}
