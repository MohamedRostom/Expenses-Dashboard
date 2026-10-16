import { execSync } from 'node:child_process';
import { expect, test, type Page } from '@playwright/test';
import { csrfHeaders, signUpAndVerify } from '../fixtures/index.js';

/**
 * T029 (spec 006 US6): `appearance.motion` off means no appearance controls and a still ground,
 * while panels stay translucent; turning it on applies a user's saved preset. The flag is
 * per-user (`pnpm flags set --user`), so nothing global changes.
 */

const DB_URL = process.env['DATABASE_URL'] ?? 'postgres://desk:desk@localhost:5432/desk';
const PASSWORD = 'xk-e2e-Tr0ub4-fixture-2026';

function setFlag(email: string, state: 'on' | 'off'): void {
  execSync(`pnpm --filter @desk/db flags set "appearance.motion" --user "${email}" ${state}`, {
    env: { ...process.env, DATABASE_URL: DB_URL },
    stdio: 'pipe',
  });
}

const motionOf = (page: Page) => page.evaluate(() => document.documentElement.dataset['motion']);

test('flag off: no controls, a still ground, translucent panels; flag on restores a saved Grain', async ({
  page,
}) => {
  const email = `motion-flag-${Date.now()}@example.com`;
  await signUpAndVerify(page, email, PASSWORD);

  // Save Grain while the flag is on.
  setFlag(email, 'on');
  const res = await page.request.patch('/me', {
    headers: await csrfHeaders(page),
    data: { motionPreset: 'grain' },
  });
  expect(res.ok()).toBe(true);
  await page.goto('/');
  await expect.poll(() => motionOf(page)).toBe('grain');

  // Flag off: the saved choice is kept but not applied.
  setFlag(email, 'off');
  await page.goto('/settings');
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('heading', { name: 'Theme' })).toBeVisible();
  await expect(page.getByRole('radiogroup', { name: 'Background motion' })).toHaveCount(0);
  await expect.poll(() => motionOf(page)).toBe('none');
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  const blur = await page
    .locator('.surface')
    .first()
    .evaluate((el) => getComputedStyle(el).backdropFilter);
  expect(blur).not.toBe('none');

  // Flag on again: the saved preset applies.
  setFlag(email, 'on');
  await page.reload();
  await expect.poll(() => motionOf(page)).toBe('grain');
});
