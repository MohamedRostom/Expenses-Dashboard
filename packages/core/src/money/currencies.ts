/** ISO 4217 code, name and minor-unit exponent. Exponent drives parsing/formatting and rounding. */
export interface CurrencyInfo {
  readonly code: string;
  readonly name: string;
  readonly exponent: 0 | 2 | 3;
}

// A representative common subset of ISO 4217, not the full ~180-entry table — covers every
// exponent (0, 2, 3) and every currency named in the spec/data-model.
// ponytail: subset, not the full ISO list; add rows here if a real currency is missing.
export const CURRENCIES: readonly CurrencyInfo[] = [
  { code: 'GBP', name: 'Pound Sterling', exponent: 2 },
  { code: 'EUR', name: 'Euro', exponent: 2 },
  { code: 'USD', name: 'US Dollar', exponent: 2 },
  { code: 'EGP', name: 'Egyptian Pound', exponent: 2 },
  { code: 'JPY', name: 'Yen', exponent: 0 },
  { code: 'KWD', name: 'Kuwaiti Dinar', exponent: 3 },
  { code: 'AUD', name: 'Australian Dollar', exponent: 2 },
  { code: 'CAD', name: 'Canadian Dollar', exponent: 2 },
  { code: 'CHF', name: 'Swiss Franc', exponent: 2 },
  { code: 'CNY', name: 'Yuan Renminbi', exponent: 2 },
  { code: 'INR', name: 'Indian Rupee', exponent: 2 },
  { code: 'NZD', name: 'New Zealand Dollar', exponent: 2 },
  { code: 'SEK', name: 'Swedish Krona', exponent: 2 },
  { code: 'NOK', name: 'Norwegian Krone', exponent: 2 },
  { code: 'DKK', name: 'Danish Krone', exponent: 2 },
  { code: 'PLN', name: 'Zloty', exponent: 2 },
  { code: 'CZK', name: 'Czech Koruna', exponent: 2 },
  { code: 'HUF', name: 'Forint', exponent: 2 },
  { code: 'RON', name: 'Romanian Leu', exponent: 2 },
  { code: 'TRY', name: 'Turkish Lira', exponent: 2 },
  { code: 'ZAR', name: 'Rand', exponent: 2 },
  { code: 'AED', name: 'UAE Dirham', exponent: 2 },
  { code: 'SAR', name: 'Saudi Riyal', exponent: 2 },
  { code: 'SGD', name: 'Singapore Dollar', exponent: 2 },
  { code: 'HKD', name: 'Hong Kong Dollar', exponent: 2 },
  { code: 'THB', name: 'Baht', exponent: 2 },
  { code: 'MXN', name: 'Mexican Peso', exponent: 2 },
  { code: 'BRL', name: 'Brazilian Real', exponent: 2 },
  { code: 'ILS', name: 'New Israeli Sheqel', exponent: 2 },
  { code: 'KRW', name: 'Won', exponent: 0 },
  { code: 'VND', name: 'Dong', exponent: 0 },
  { code: 'ISK', name: 'Iceland Krona', exponent: 0 },
  { code: 'CLP', name: 'Chilean Peso', exponent: 0 },
  { code: 'BHD', name: 'Bahraini Dinar', exponent: 3 },
  { code: 'OMR', name: 'Rial Omani', exponent: 3 },
  { code: 'JOD', name: 'Jordanian Dinar', exponent: 3 },
  { code: 'TND', name: 'Tunisian Dinar', exponent: 3 },
];

const BY_CODE = new Map(CURRENCIES.map((c) => [c.code, c]));

export function getCurrency(code: string): CurrencyInfo {
  const info = BY_CODE.get(code);
  if (!info) throw new RangeError(`Unknown currency code: ${code}`);
  return info;
}

export function isCurrencyCode(code: string): boolean {
  return BY_CODE.has(code);
}
