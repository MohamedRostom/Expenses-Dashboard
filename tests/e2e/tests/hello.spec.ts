import { expect, test } from '@playwright/test';

test('shows a loading state while /healthz is in flight', async ({ page }) => {
  await page.route('**/healthz', async (route) => {
    await new Promise((r) => setTimeout(r, 1500));
    await route.continue();
  });
  await page.goto('/');
  await expect(page.locator('[aria-busy="true"]')).toBeVisible();
  await expect(page.getByTestId('health')).toBeVisible();
});

test('shows a specific error when /healthz fails', async ({ page }) => {
  await page.route('**/healthz', (route) => route.fulfill({ status: 503, body: 'down' }));
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText(
    'Could not reach the API: healthz returned 503',
  );
});

test('the Hello page loads and shows the API version from /healthz', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Hello from Desk' })).toBeVisible();
  await expect(page.getByTestId('health')).toContainText(/API \d+\.\d+\.\d+ at \S+/);
});
