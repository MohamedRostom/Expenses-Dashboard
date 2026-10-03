// Per-kind widget settings validation (data-model.md "widgets", research R12). Pure, no zod.
export const WIDGET_KINDS = [
  'currency',
  'weather',
  'sunrise',
  'spend_pace',
  'fixed_costs',
] as const;
export type WidgetKind = (typeof WIDGET_KINDS)[number];
export const WIDGET_LIMIT = 8;
export const CURRENCY_CAP = 6;

export interface SettingsContext {
  defaultCurrency: string;
  /** Codes the rates source can convert. */
  convertible: ReadonlySet<string>;
  /** Codes already stored on this widget; exempt from the "not the default" rule (R12). */
  previous: readonly string[];
  /** The widget's place_id; required for weather and sunrise. */
  placeId?: string | null;
}

export interface SettingsIssue {
  path: string;
  message: string;
}

export interface SettingsDescriptor {
  fields: { name: string; type: 'currency-codes'; min: number; max: number }[];
  requiresPlace: boolean;
}

export function settingsDescriptor(kind: WidgetKind): SettingsDescriptor {
  return {
    fields:
      kind === 'currency'
        ? [{ name: 'currencies', type: 'currency-codes', min: 1, max: CURRENCY_CAP }]
        : [],
    requiresPlace: kind === 'weather' || kind === 'sunrise',
  };
}

export function validateSettings(
  kind: WidgetKind,
  settings: unknown,
  ctx: SettingsContext,
): SettingsIssue[] {
  if (typeof settings !== 'object' || settings === null || Array.isArray(settings)) {
    return [{ path: '', message: 'settings must be an object' }];
  }
  const allowed = kind === 'currency' ? ['currencies'] : [];
  const issues: SettingsIssue[] = Object.keys(settings)
    .filter((k) => !allowed.includes(k))
    .map((k) => ({ path: k, message: `unknown setting "${k}"` }));

  if (kind === 'currency') {
    const codes = (settings as { currencies?: unknown }).currencies;
    const path = 'currencies';
    if (!Array.isArray(codes) || codes.some((c) => typeof c !== 'string')) {
      issues.push({ path, message: 'currencies must be an array of currency codes' });
    } else {
      if (codes.length < 1 || codes.length > CURRENCY_CAP) {
        issues.push({ path, message: `choose between 1 and ${CURRENCY_CAP} currencies` });
      }
      const seen = new Set<string>();
      for (const code of codes as string[]) {
        if (seen.has(code)) issues.push({ path, message: `${code} is listed twice` });
        else if (!ctx.convertible.has(code))
          issues.push({ path, message: `${code} cannot be converted` });
        else if (code === ctx.defaultCurrency && !ctx.previous.includes(code)) {
          issues.push({ path, message: `${code} is your default currency` });
        }
        seen.add(code);
      }
    }
  } else if ((kind === 'weather' || kind === 'sunrise') && !ctx.placeId) {
    issues.push({ path: 'place_id', message: `${kind} needs a place` });
  }
  return issues;
}
