import { expect, test as base, type Page } from '@playwright/test';

// T111 @local: post-deploy smoke, run by deploy-fly.yml against the real staging URL (and by
// e2e-local on `desk-local`; never blocks a PR — see playwright.config.ts's `local` project).
// Each test is atomic: it gets its own fresh account (no seeded user, no mail access —
// unverified accounts may sign in for their first 7 days, FR-001), arranges any data it needs
// through the API, exercises exactly one concern through the UI, and the fixture deletes the
// account afterwards so staging doesn't accumulate users.
// ponytail: one account per test counts against the register limit of 20 per IP per hour
// (routes/auth.ts); fine for one smoke per deploy, share an account per worker if runs get denser.

// Remote target: every request crosses to the database region and the first may wake a
// suspended Neon compute, so assertions get more than the 5s default.
const REMOTE = { timeout: 15_000 };
// Pinned so the currency test always knows which way it switches.
const DEFAULT_CURRENCY = 'GBP';

type Credentials = { email: string; password: string };

const test = base.extend<{ credentials: Credentials; account: Credentials; signedInPage: Page }>({
  /** Unique, unregistered credentials; whatever account ends up using them is deleted after. */
  credentials: async ({ page }, use) => {
    const credentials = {
      // Resend's test inbox: accepts mail without delivering to a person, `+label` keeps it unique.
      email: `delivered+smoke-${Date.now()}-${crypto.randomUUID().slice(0, 8)}@resend.dev`,
      // Random per test — HibpBreachChecker rejects known-breached passwords at sign-up.
      password: `smoke-${crypto.randomUUID()}`,
    };
    await use(credentials);
    // Best effort, and never throws: the test may have deleted the account itself, or never
    // signed in, or timed out with the context already closed — an error here would replace the
    // real failure in the report. Anything left is locked after 7 days by login().
    try {
      await page.request.delete('/me', {
        data: { password: credentials.password },
        headers: await csrfHeaders(page),
      });
    } catch {
      // context gone
    }
  },

  /** A signed-in, onboarded account, created through the API rather than the UI. */
  account: async ({ page, credentials }, use) => {
    // Any GET issues the __Host-desk_csrf cookie the POSTs below must echo.
    expect((await page.request.get('/healthz')).ok()).toBe(true);
    const register = await page.request.post('/auth/register', {
      data: { ...credentials, defaultCurrency: DEFAULT_CURRENCY, timeZone: 'Europe/London' },
      headers: await csrfHeaders(page),
    });
    expect(register.status()).toBe(202);
    const login = await page.request.post('/auth/login', {
      data: credentials,
      headers: await csrfHeaders(page),
    });
    expect(login.ok()).toBe(true);
    const onboarded = await page.request.patch('/me', {
      data: { onboardingCompletedAt: new Date().toISOString() },
      headers: await csrfHeaders(page),
    });
    expect(onboarded.ok()).toBe(true);
    await use(credentials);
  },

  /** The page, signed in as a fresh `account`, for tests that only need a signed-in user. */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- depending on it is what signs in
  signedInPage: async ({ page, account }, use) => {
    await use(page);
  },
});

/** apiFetch sends the __Host-desk_csrf cookie as X-CSRF-Token; page.request doesn't. */
async function csrfHeaders(page: Page): Promise<Record<string, string>> {
  const cookie = (await page.context().cookies()).find((c) => c.name === '__Host-desk_csrf');
  return cookie ? { 'X-CSRF-Token': cookie.value } : {};
}

/** Arrange step: an expense of 10.00 USD dated today, created via the API. */
async function createExpense(page: Page, description: string): Promise<void> {
  const res = await page.request.post('/expenses', {
    data: {
      description,
      amount: { minor: 1000, currency: 'USD' },
      date: new Date().toISOString().slice(0, 10),
      categoryId: null,
      paidWith: 'card',
      kind: 'variable',
    },
    headers: await csrfHeaders(page),
  });
  expect(res.status()).toBe(201);
}

/** CurrencyPicker only emits on clicking a suggestion (populated from GET /currencies). */
async function pickCurrency(page: Page, label: RegExp, code: string): Promise<void> {
  await page.getByLabel(label).fill(code);
  await page.getByText(new RegExp(`^${code} —`)).click();
}

function row(page: Page, description: string) {
  return page.getByRole('row', { name: new RegExp(description) });
}

function spentTile(page: Page) {
  return page.locator('.desk-tile', { hasText: 'Spent' }).locator('.desk-tile-value');
}

async function signIn(page: Page, { email, password }: Credentials): Promise<void> {
  await page.goto('/login');
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole('button', { name: /sign in/i }).click();
}

test.describe('post-deploy smoke @local', () => {
  // Playwright's default is 30s; on staging each request is ~1.3s and the fixture makes four.
  test.describe.configure({ timeout: 60_000 });

  test('health endpoint reports the app and database up', async ({ request }) => {
    const res = await request.get('/healthz');
    expect(res.ok()).toBe(true);
    const health = await res.json();
    expect(health.status).toBe('ok');
    expect(['ok', 'degraded']).toContain(health.db);
  });

  test('a new user can sign up and sign in before verifying their email', async ({
    page,
    credentials,
  }) => {
    await page.goto('/register');
    await page.getByLabel(/email/i).fill(credentials.email);
    await page.getByLabel(/password/i).fill(credentials.password);
    await Promise.all([
      page.waitForResponse((r) => r.url().endsWith('/auth/register') && r.status() === 202),
      page.getByRole('button', { name: /sign up|register|create account/i }).click(),
    ]);

    await signIn(page, credentials);
    await expect(page).toHaveURL(/\/onboarding/, REMOTE);
    await page.getByRole('button', { name: /^skip$/i }).click();
    await expect(page).not.toHaveURL(/\/onboarding/, REMOTE);

    await page.goto('/settings');
    await expect(page.getByText('Unverified', { exact: true })).toBeVisible(REMOTE);
  });

  test('adding a foreign-currency expense converts it into the default currency', async ({
    signedInPage: page,
  }) => {
    const description = `Smoke add ${Date.now()}`;
    await page.goto('/');
    await page.getByRole('button', { name: /add expense/i }).click();
    await page.getByLabel(/description/i).fill(description);
    await page.getByLabel(/^amount$/i).fill('10');
    await pickCurrency(page, /currency/i, 'USD');
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: /^add expense$/i }).click();
    await dialog.waitFor({ state: 'hidden', ...REMOTE });

    await expect(row(page, description)).toBeVisible(REMOTE);
    await expect(row(page, description).locator('td').nth(3)).toContainText(/USD\s*$/);
    await expect(spentTile(page)).toContainText(new RegExp(`${DEFAULT_CURRENCY}\\s*$`), REMOTE);
  });

  test('editing an expense saves the new description and amount', async ({
    signedInPage: page,
  }) => {
    const description = `Smoke edit ${Date.now()}`;
    await createExpense(page, description);
    const edited = `${description} edited`;

    await page.goto('/');
    await row(page, description).getByRole('button', { name: /edit/i }).click();
    await page.getByLabel(/description/i).fill(edited);
    await page.getByLabel(/^amount$/i).fill('12.50');
    await page.getByRole('button', { name: /^save$/i }).click();

    await expect(row(page, edited)).toBeVisible(REMOTE);
    await expect(row(page, edited).locator('td').nth(3)).toContainText(/12\.50/);
  });

  test('deleting an expense removes it from the month', async ({ signedInPage: page }) => {
    const description = `Smoke delete ${Date.now()}`;
    await createExpense(page, description);
    // MonthView's delete uses window.confirm(); Playwright cancels native dialogs by default.
    page.on('dialog', (d) => d.accept());

    await page.goto('/');
    await row(page, description)
      .getByRole('button', { name: /delete/i })
      .click();

    // Assert the row, not the text: the undo banner repeats it for 6s.
    await expect(row(page, description)).toHaveCount(0, REMOTE);
  });

  test('changing the default currency re-derives the month total', async ({
    signedInPage: page,
  }) => {
    // The re-derive job waits up to 30s for Fly's in-process runner.
    test.setTimeout(150_000);
    await createExpense(page, `Smoke currency ${Date.now()}`);
    const toCurrency = 'EUR';

    await page.goto('/settings');
    await pickCurrency(page, /default currency/i, toCurrency);
    await expect(page.getByText('Currency updated.')).toBeVisible({ timeout: 90_000 });

    await page.goto('/');
    await expect(spentTile(page)).toContainText(new RegExp(`${toCurrency}\\s*$`), REMOTE);
  });

  test('a deleted account can no longer sign in', async ({ page, account }) => {
    // No Settings UI for account deletion yet, so the API is the action under test.
    const res = await page.request.delete('/me', {
      data: { password: account.password },
      headers: await csrfHeaders(page),
    });
    expect(res.status()).toBe(204);

    await page.context().clearCookies();
    await signIn(page, account);
    await expect(page.getByText(/wrong email or password/i)).toBeVisible(REMOTE);
  });
});
