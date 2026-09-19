import { expect, test } from '@playwright/test';

// Stale scaffold from before routing/auth existed — `/` requires auth now (router.ts) and
// redirects an unauthenticated visitor to /login, so the old "Hello from Desk" placeholder
// page and its /healthz-loading-state assertions test a page nothing serves any more.
// @mobile: the pixel-7/iphone-14 Playwright projects filter on this tag and previously matched
// zero specs, so they silently "passed" without running anything.
test.describe('unauthenticated visit to / @mobile', () => {
  test('redirects to /login, which renders the sign-in form', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/login(\?.*)?$/);
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByLabel(/password/i)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
  });

  test('remembers the intended route through login', async ({ page }) => {
    await page.goto('/settings');
    await expect(page).toHaveURL(/\/login\?redirect=%2Fsettings/);
  });
});
