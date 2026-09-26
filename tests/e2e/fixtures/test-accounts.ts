// Real provider accounts for the e2e-local suite (spec 002: T030, T044, T067, T079).
// The filled-in YAML never enters git: locally it's `tests/e2e/test-accounts.local.yaml`
// (gitignored); in the pipeline e2e-local.yml writes it from the `E2E_TEST_ACCOUNTS_YAML` secret
// in the `local-secrets` environment and deletes it after the run. A provider that is missing,
// or still has blank placeholder fields, is simply absent — the specs that need it skip.
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'yaml';

export type OAuthAccount = { email: string; refreshToken: string };
export type StandardsAccount = {
  preset?: string;
  address: string;
  appPassword: string;
  imapHost?: string;
  imapPort?: number;
  caldavUrl?: string;
};
export type TestAccounts = {
  google?: OAuthAccount;
  microsoft?: OAuthAccount;
  standards: StandardsAccount[];
};

export const DEFAULT_ACCOUNTS_FILE = resolve(import.meta.dirname, '..', 'test-accounts.local.yaml');

const filled = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '';

function oauth(v: unknown): OAuthAccount | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const { email, refreshToken } = v as Record<string, unknown>;
  return filled(email) && filled(refreshToken) ? { email, refreshToken } : undefined;
}

function standards(v: unknown): StandardsAccount[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((e): StandardsAccount[] => {
    if (!e || typeof e !== 'object') return [];
    const r = e as Record<string, unknown>;
    if (!filled(r['address']) || !filled(r['appPassword'])) return [];
    return [
      {
        address: r['address'],
        appPassword: r['appPassword'],
        ...(filled(r['preset']) ? { preset: r['preset'] } : {}),
        ...(filled(r['imapHost']) ? { imapHost: r['imapHost'] } : {}),
        ...(typeof r['imapPort'] === 'number' ? { imapPort: r['imapPort'] } : {}),
        ...(filled(r['caldavUrl']) ? { caldavUrl: r['caldavUrl'] } : {}),
      },
    ];
  });
}

/** Reads the accounts file; a missing or empty file means "no accounts" (every such test skips). */
export function loadTestAccounts(
  file = process.env['E2E_TEST_ACCOUNTS_FILE'] ?? DEFAULT_ACCOUNTS_FILE,
): TestAccounts {
  if (!existsSync(file)) return { standards: [] };
  const doc: unknown = parse(readFileSync(file, 'utf8'));
  if (doc == null) return { standards: [] };
  if (typeof doc !== 'object' || Array.isArray(doc)) {
    throw new Error(`${file}: expected a mapping with google / microsoft / standards keys`);
  }
  const d = doc as Record<string, unknown>;
  const google = oauth(d['google']);
  const microsoft = oauth(d['microsoft']);
  return {
    ...(google ? { google } : {}),
    ...(microsoft ? { microsoft } : {}),
    standards: standards(d['standards']),
  };
}

/** Usage in a spec: `test.skip(!accounts.google, skipReason('google'))`. */
export const skipReason = (what: string): string =>
  `no ${what} test account configured (see tests/e2e/test-accounts.example.yaml)`;
