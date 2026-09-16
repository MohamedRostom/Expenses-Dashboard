import { expect, test } from '@playwright/test';

test('the Hello page loads and shows the API version from /healthz', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Hello from Desk' })).toBeVisible();
  await expect(page.getByTestId('health')).toContainText(/API \d+\.\d+\.\d+ at \S+/);
});
