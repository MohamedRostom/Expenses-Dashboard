import { expect, test } from '@playwright/test';
import { axeCheck, signUpAndVerify } from '../fixtures/index.js';

// Not a real phrase — see tests/e2e/fixtures/index.ts's signUpAndVerify comment.
const PASSWORD = 'xk-e2e-Tr0ub4-fixture-2026';

function uniqueEmail(tag: string): string {
  return `e2e-${tag}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`;
}

test('first sign-in shows the onboarding guide: currency, first expense, optional Notion', async ({
  page,
}) => {
  const email = uniqueEmail('onboard');
  await signUpAndVerify(page, email, PASSWORD);

  // A brand-new user has no onboardingCompletedAt — the router guard sends them to /onboarding
  // instead of the month view.
  await expect(page).toHaveURL(/\/onboarding/);
  await axeCheck(page);

  await expect(page.getByRole('heading', { name: /default currency/i })).toBeVisible();
  await page.getByRole('button', { name: /^next$/i }).click();

  await expect(page.getByRole('heading', { name: /first expense/i })).toBeVisible();
  await axeCheck(page);
  await page.getByRole('button', { name: /^next$/i }).click();

  await expect(page.getByRole('heading', { name: /connect notion/i })).toBeVisible();
  await axeCheck(page);
  await page.getByRole('button', { name: /^finish$/i }).click();

  await expect(page).toHaveURL('/');
});

test('skip at any step marks onboarding done and does not return on next visit', async ({
  page,
}) => {
  const email = uniqueEmail('onboard-skip');
  await signUpAndVerify(page, email, PASSWORD);
  await expect(page).toHaveURL(/\/onboarding/);

  await page.getByRole('button', { name: /^skip$/i }).click();
  await expect(page).toHaveURL('/');

  // Resume: reloading no longer sends the user back through onboarding.
  await page.reload();
  await expect(page).toHaveURL('/');
});
