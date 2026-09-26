import { execSync } from 'node:child_process';
import { expect, test } from '@playwright/test';
import { signUpAndVerify, axeCheck } from '../fixtures/index.js';

/**
 * T010: Connections page tests (ci project)
 * - Lists providers based on flags
 * - Shows empty states for panels when no accounts are connected
 * - Verifies accessibility on both /today and /settings/connections
 * - Tests flag-gated access (panels.today off -> redirect to /)
 */

test.describe('Connections and Today pages @ci', () => {
  test('displays /settings/connections with providers list', async ({ page }) => {
    const email = `connections-test-${crypto.randomUUID()}@example.com`;
    await signUpAndVerify(page, email);
    await page.goto('/settings/connections');

    // Verify we're on the connections page
    await expect(page).toHaveURL('/settings/connections');

    // Providers are filtered by flags; all on in e2e-ci per T004
    await expect(page.getByRole('heading', { level: 2, name: 'Add a Provider' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 3, name: 'Google' })).toBeVisible();

    // Verify axe accessibility
    await axeCheck(page);
  });

  test('displays /today with empty panel states when no accounts are connected', async ({
    page,
  }) => {
    const email = `today-test-${crypto.randomUUID()}@example.com`;
    await signUpAndVerify(page, email);
    await page.goto('/today');

    // Verify we're on the today page
    await expect(page).toHaveURL('/today');

    // Both panels' no-accounts copy, which only renders once GET /panels/today has loaded
    // (not the error state a failed fetch would show)
    const calendarEmpty = page.getByText('No calendar accounts connected.', { exact: false });
    const inboxEmpty = page.getByText('No mail accounts connected.', { exact: false });
    await expect(calendarEmpty).toBeVisible();
    await expect(inboxEmpty).toBeVisible();

    // A hard reload of /today must serve the page, not the API's JSON
    await page.reload();
    await expect(calendarEmpty).toBeVisible();

    // Verify axe accessibility
    await axeCheck(page);
  });

  test('panels.today flag off: no nav entry and routes redirect to /', async ({ page }) => {
    const email = `flag-off-test-${crypto.randomUUID()}@example.com`;
    await signUpAndVerify(page, email);

    // Disable panels.today for this user via the flags CLI against the compose database.
    const dbUrl = process.env['DATABASE_URL'] ?? 'postgres://desk:desk@localhost:5432/desk';
    execSync(`pnpm --filter @desk/db flags set panels.today --user "${email}" off`, {
      env: { ...process.env, DATABASE_URL: dbUrl },
    });

    // Navigate to home and verify no "Today" nav entry
    await page.goto('/');
    const todayLink = page.getByRole('link', { name: /today/i });
    const todayLinkCount = await todayLink.count();
    expect(todayLinkCount).toBe(0);

    // Verify /today redirects to /
    await page.goto('/today');
    await expect(page).toHaveURL('/');

    // Verify /settings/connections redirects to /
    await page.goto('/settings/connections');
    await expect(page).toHaveURL('/');
  });
});
