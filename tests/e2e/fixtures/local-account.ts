import { expect, test as base, type APIRequestContext, type Page } from '@playwright/test';

// T037: staging allows 20 registrations per IP per hour (apps/api/src/routes/auth.ts,
// REGISTER_IP_LIMIT_PER_HOUR) and every @local test used to register its own account from the one
// desk-local runner IP. Now each worker registers ONE account (`sharedAccount`), tests sign in to
// it, and it is deleted when the worker ends. A test that changes account-level state (default
// currency, deletion, sign-up itself) uses `registerAccount` for its own and pays one registration.
// Playwright starts a fresh worker (so a fresh registration) after every failed test, and again for
// each retry, so registrations per full `--project=local` run =
//   workers + failures x (1 + retries) + 3 (the smoke tests that register their own).

export type Credentials = { email: string; password: string };

// Worker fixtures cannot read the test-scoped `baseURL`; keep this default in step with the
// `local` project in playwright.config.ts.
const BASE_URL = process.env['E2E_LOCAL_BASE_URL'] || 'https://ros-desk-staging.fly.dev';

/** apiFetch sends the __Host-desk_csrf cookie as X-CSRF-Token; APIRequestContext doesn't. */
export async function csrfHeaders(api: APIRequestContext): Promise<Record<string, string>> {
  const cookie = (await api.storageState()).cookies.find((c) => c.name === '__Host-desk_csrf');
  return cookie ? { 'X-CSRF-Token': cookie.value } : {};
}

export function newCredentials(label: string): Credentials {
  return {
    // Resend's test inbox: accepts mail without delivering to a person, `+label` keeps it unique.
    email: `delivered+${label}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}@resend.dev`,
    // Random per account — HibpBreachChecker rejects known-breached passwords at sign-up.
    password: `${label}-${crypto.randomUUID()}`,
  };
}

export async function login(api: APIRequestContext, credentials: Credentials): Promise<void> {
  // Any GET issues the __Host-desk_csrf cookie the POSTs below must echo.
  expect((await api.get('/healthz')).ok()).toBe(true);
  const res = await api.post('/auth/login', { data: credentials, headers: await csrfHeaders(api) });
  expect(res.ok()).toBe(true);
}

/** Registers (counts against the limit), signs `api` in and marks onboarding done. */
export async function registerAccount(
  api: APIRequestContext,
  credentials: Credentials,
  defaultCurrency = 'GBP',
): Promise<void> {
  expect((await api.get('/healthz')).ok()).toBe(true);
  const register = await api.post('/auth/register', {
    data: { ...credentials, defaultCurrency, timeZone: 'Europe/London' },
    headers: await csrfHeaders(api),
  });
  if (register.status() === 429) throw new RegistrationLimited();
  expect(register.status()).toBe(202);
  try {
    await login(api, credentials);
    const onboarded = await api.patch('/me', {
      data: { onboardingCompletedAt: new Date().toISOString() },
      headers: await csrfHeaders(api),
    });
    expect(onboarded.ok()).toBe(true);
  } catch (err) {
    // The account exists now; do not leave it behind on staging (best effort, then the real error).
    await deleteAccount(api, credentials);
    throw err;
  }
}

/** Staging's per-IP registration limit was hit (HTTP 429). */
export class RegistrationLimited extends Error {
  constructor() {
    super('registration rate limit (429)');
  }
}

/**
 * Best effort, never throws: an error here would replace the real failure in the report.
 * Anything left is locked after 7 days by login().
 */
export async function deleteAccount(api: APIRequestContext, { password }: Credentials) {
  try {
    await api.delete('/me', { data: { password }, headers: await csrfHeaders(api) });
  } catch {
    // context gone
  }
}

export const test = base.extend<
  { account: Credentials; signedInPage: Page },
  { sharedAccount: Credentials | { skipReason: string } }
>({
  sharedAccount: [
    async ({ playwright }, use) => {
      const api = await playwright.request.newContext({ baseURL: BASE_URL });
      const credentials = newCredentials('local');
      try {
        await registerAccount(api, credentials);
      } catch (err) {
        if (!(err instanceof RegistrationLimited)) throw err;
        // Dependent tests skip with the reason instead of failing on an environment limit.
        await use({
          skipReason: 'staging registration limit (429) hit; wait an hour or use another runner IP',
        });
        await api.dispose();
        return;
      }
      await use(credentials);
      await deleteAccount(api, credentials);
      await api.dispose();
    },
    { scope: 'worker' },
  ],

  /** The worker's account, signed in on this test's page. Tests must not change its settings. */
  account: async ({ page, sharedAccount }, use) => {
    if ('skipReason' in sharedAccount) {
      base.skip(true, sharedAccount.skipReason);
      return;
    }
    await login(page.request, sharedAccount);
    await use(sharedAccount);
  },

  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- depending on it is what signs in
  signedInPage: async ({ page, account }, use) => {
    await use(page);
  },
});
