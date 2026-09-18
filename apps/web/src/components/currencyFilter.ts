export interface Currency {
  code: string;
  name: string;
  exponent: number;
}

/** Pure filter so it's testable without mounting the component. */
export function filterCurrencies(currencies: Currency[], query: string): Currency[] {
  const q = query.trim().toLowerCase();
  if (!q) return currencies;
  return currencies.filter(
    (c) => c.code.toLowerCase().includes(q) || c.name.toLowerCase().includes(q),
  );
}
