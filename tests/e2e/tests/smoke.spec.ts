import { expect, test, type Page } from '@playwright/test';

// T111 @local: post-deploy smoke, run by deploy-fly.yml against the real staging URL (and by
// e2e-local on `desk-local`; never blocks a PR — see playwright.config.ts's `local` project).
// Self-contained full CRUD round trip on a fresh account, so it needs no seeded user and no
// mail access: unverified accounts may sign in for their first 7 days (FR-001), and the account
// is deleted at the end (or in `finally` if a step fails) so staging doesn't accumulate users.

// Resend's test inbox: accepts mail without delivering to a person, `+label` keeps it unique.
const email = `delivered+smoke-${Date.now()}@resend.dev`;
// Random per run — HibpBreachChecker rejects known-breached passwords at sign-up.
const PASSWORD = `smoke-${crypto.randomUUID()}`;
// Remote target: every request crosses to the database region and the first may wake a
// suspended Neon compute, so assertions get more than the 5s default.
const REMOTE = { timeout: 15_000 };

/** apiFetch sends the __Host-desk_csrf cookie as X-CSRF-Token; page.request doesn't. */
async function csrfHeaders(page: Page): Promise<Record<string, string>> {
  const cookie = (await page.context().cookies()).find((c) => c.name === '__Host-desk_csrf');
  return cookie ? { 'X-CSRF-Token': cookie.value } : {};
}

/** CurrencyPicker only emits on clicking a suggestion (populated from GET /currencies). */
async function pickCurrency(page: Page, label: RegExp, code: string): Promise<void> {
  await page.getByLabel(label).fill(code);
  await page.getByText(new RegExp(`^${code} —`)).click();
}

function spentTile(page: Page) {
  return page.locator('.desk-tile', { hasText: 'Spent' }).locator('.desk-tile-value');
}

test('post-deploy smoke: sign up, expense CRUD, currency change, delete account @local', async ({
  page,
  baseURL,
  request,
}) => {
  // Playwright's default is 30s per test; on staging (~1.3s per request, and the currency
  // re-derive job waits up to 30s for Fly's runner) the round trip needs a few minutes.
  test.setTimeout(180_000);
  // MonthView's delete uses window.confirm(); Playwright cancels native dialogs by default.
  page.on('dialog', (d) => d.accept());
  let accountDeleted = false;

  try {
    const healthRes = await request.get(`${baseURL}/healthz`);
    expect(healthRes.ok()).toBe(true);
    const health = await healthRes.json();
    expect(health.status).toBe('ok');
    expect(['ok', 'degraded']).toContain(health.db);

    // Create account, then sign in without verifying the email.
    await page.goto('/register');
    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/password/i).fill(PASSWORD);
    await page.getByRole('button', { name: /sign up|register|create account/i }).click();
    await page.goto('/login');
    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/password/i).fill(PASSWORD);
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page).toHaveURL(/\/onboarding/, REMOTE);
    await page.getByRole('button', { name: /^skip$/i }).click();
    await expect(page).not.toHaveURL(/\/onboarding/, REMOTE);

    await page.goto('/settings');
    await expect(page.getByText('Unverified', { exact: true })).toBeVisible(REMOTE);
    const me = await (await page.request.get('/me')).json();
    const fromCurrency: string = me.user.defaultCurrency;
    const toCurrency = fromCurrency === 'EUR' ? 'GBP' : 'EUR';

    // Create an expense in a foreign currency; the Spent tile converts it with live rates.
    await page.goto('/');
    const description = `Smoke ${Date.now()}`;
    await page.getByRole('button', { name: /add expense/i }).click();
    await page.getByLabel(/description/i).fill(description);
    await page.getByLabel(/^amount$/i).fill('10');
    await pickCurrency(page, /currency/i, 'USD');
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: /^add expense$/i }).click();
    await dialog.waitFor({ state: 'hidden', ...REMOTE });
    const row = (desc: string) => page.getByRole('row', { name: new RegExp(desc) });
    await expect(row(description)).toBeVisible(REMOTE);
    await expect(row(description).locator('td').nth(3)).toContainText(/USD\s*$/);
    await expect(spentTile(page)).toContainText(new RegExp(`${fromCurrency}\\s*$`), REMOTE);

    // Update it.
    const edited = `${description} edited`;
    await row(description).getByRole('button', { name: /edit/i }).click();
    await page.getByLabel(/description/i).fill(edited);
    await page.getByLabel(/^amount$/i).fill('12.50');
    await page.getByRole('button', { name: /^save$/i }).click();
    await expect(row(edited)).toBeVisible(REMOTE);
    await expect(row(edited).locator('td').nth(3)).toContainText(/12\.50/);

    // Change the default currency: a background job re-derives every expense (the in-process
    // runner polls every 30s on Fly), then the month total is shown in the new currency.
    await page.goto('/settings');
    await pickCurrency(page, /default currency/i, toCurrency);
    await expect(page.getByText('Currency updated.')).toBeVisible({ timeout: 90_000 });
    await page.goto('/');
    await expect(spentTile(page)).toContainText(new RegExp(`${toCurrency}\\s*$`), REMOTE);

    // Delete the expense — assert the row, not the text: the undo banner repeats it for 6s.
    await row(edited)
      .getByRole('button', { name: /delete/i })
      .click();
    await expect(row(edited)).toHaveCount(0, REMOTE);

    // Delete the account (no Settings UI for it yet), then prove it is really gone.
    const deleteRes = await page.request.delete('/me', {
      data: { password: PASSWORD },
      headers: await csrfHeaders(page),
    });
    expect(deleteRes.status()).toBe(204);
    accountDeleted = true;
    await page.goto('/login');
    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/password/i).fill(PASSWORD);
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page.getByText(/wrong email or password/i)).toBeVisible(REMOTE);
  } finally {
    // A failed run must not leave its account behind on staging (it signed in, so housekeeping
    // would only lock it, never purge it).
    // Best effort, and never throws: after a timeout the browser context is already closed,
    // and an error here would replace the real failure in the report.
    if (!accountDeleted) {
      try {
        await page.request.delete('/me', {
          data: { password: PASSWORD },
          headers: await csrfHeaders(page),
        });
      } catch {
        // context gone — the unverified account is locked after 7 days by login()
      }
    }
  }
});
