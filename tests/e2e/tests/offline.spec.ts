import { expect, test } from '@playwright/test';
import { axeCheck, signUpAndVerify } from '../fixtures/index.js';

// Not a real phrase — see tests/e2e/fixtures/index.ts's signUpAndVerify comment.
const PASSWORD = 'xk-e2e-Tr0ub4-fixture-2026';

function uniqueEmail(tag: string): string {
  return `e2e-${tag}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`;
}

test('add an expense while offline, queued row shows pending, syncs once back online', async ({
  page,
  context,
}) => {
  const email = uniqueEmail('offline');
  await signUpAndVerify(page, email, PASSWORD);
  await expect(page).toHaveURL('/');
  await axeCheck(page);

  await context.setOffline(true);

  await page.getByRole('button', { name: /add expense/i }).click();
  await page.getByLabel(/description/i).fill('Offline coffee');
  await page.getByLabel(/^amount$/i).fill('4.50');
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /^add expense$/i })
    .click();

  // Optimistically shown with a pending marker, and the header pending count reflects it —
  // still offline, so it must not have reached the server.
  await expect(page.getByText('Offline coffee')).toBeVisible();
  await expect(page.getByTestId('pending-count')).toContainText('1 pending');
  await expect(page.getByTestId('pending-row')).toBeVisible();

  await context.setOffline(false);

  // flush() fires on the `online` event — the queued row disappears from the pending list
  // and reappears as a normal synced entry (single row, not duplicated).
  await expect(page.getByTestId('pending-count')).not.toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('Offline coffee')).toHaveCount(1);
});
