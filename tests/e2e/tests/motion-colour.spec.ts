import { execSync } from 'node:child_process';
import { expect, test, type Page } from '@playwright/test';
import { axeCheck, signUpAndVerify } from '../fixtures/index.js';

/**
 * T024 (spec 006 US3): the motion colour. Light uses the saved tint (`--motion-tint`, inline on
 * html); dark hides the row and uses the fixed dark tint. `appearance.motion` is on for the test
 * user only, like motion-settings.spec.
 */

const DB_URL = process.env['DATABASE_URL'] ?? 'postgres://desk:desk@localhost:5432/desk';
const PASSWORD = 'xk-e2e-Tr0ub4-fixture-2026';
const CORAL = '#ff9fb2';
const DARK_TINT = '#7fd1a8';

async function signedIn(page: Page, tag: string): Promise<void> {
  const email = `motion-colour-${tag}-${Date.now()}@example.com`;
  await signUpAndVerify(page, email, PASSWORD);
  execSync(`pnpm --filter @desk/db flags set "appearance.motion" --user "${email}" on`, {
    env: { ...process.env, DATABASE_URL: DB_URL },
    stdio: 'pipe',
  });
  await page.goto('/settings');
  await page.waitForLoadState('networkidle');
}

const tint = (page: Page) =>
  page.evaluate(() =>
    document.documentElement.style.getPropertyValue('--motion-tint').trim().toLowerCase(),
  );
const colours = (page: Page) => page.getByRole('radiogroup', { name: 'Motion colour' });
const saved = (page: Page) =>
  page.waitForResponse((r) => r.url().endsWith('/me') && r.request().method() === 'PATCH');

test('Coral tints the layer in light; dark hides the row and uses the dark tint; light restores Coral', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await signedIn(page, 'coral');
  const done = saved(page);
  await colours(page).getByRole('radio', { name: 'Coral' }).check();
  await expect.poll(() => tint(page)).toBe(CORAL);
  await done;

  await page.emulateMedia({ colorScheme: 'dark' });
  await page.reload();
  await expect(colours(page)).toHaveCount(0);
  await expect.poll(() => tint(page)).toBe(DARK_TINT);

  await page.emulateMedia({ colorScheme: 'light' });
  await page.reload();
  await expect.poll(() => tint(page)).toBe(CORAL);
  await expect(colours(page).getByRole('radio', { name: 'Coral' })).toBeChecked();
});

test('a custom colour persists across a reload', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await signedIn(page, 'custom');
  const done = saved(page);
  await colours(page).getByLabel('Custom colour').fill('#123456');
  await expect.poll(() => tint(page)).toBe('#123456');
  await done;

  await page.reload();
  await expect.poll(() => tint(page)).toBe('#123456');
  await expect(colours(page).getByLabel('Custom colour')).toHaveValue('#123456');
});

test('axe is clean over the lightest and darkest custom colour', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await signedIn(page, 'axe');
  for (const hex of ['#ffffff', '#000000']) {
    await colours(page).getByLabel('Custom colour').fill(hex);
    await expect.poll(() => tint(page)).toBe(hex);
    await axeCheck(page);
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await axeCheck(page);
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');
  }
});
