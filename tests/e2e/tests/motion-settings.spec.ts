import { execSync } from 'node:child_process';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { axeCheck, signUpAndVerify } from '../fixtures/index.js';

/**
 * T019 (spec 006 US1, FR-001..FR-008, FR-022, FR-023): Settings › Appearance, behind
 * `appearance.motion`. The flag is switched on for the test user only (`pnpm flags set --user`),
 * so nothing global changes and nothing needs restoring.
 */

const DB_URL = process.env['DATABASE_URL'] ?? 'postgres://desk:desk@localhost:5432/desk';
const PASSWORD = 'xk-e2e-Tr0ub4-fixture-2026';
const uniqueEmail = (tag: string) => `motion-${tag}-${Date.now()}@example.com`;

function setUserFlag(email: string): void {
  execSync(`pnpm --filter @desk/db flags set "appearance.motion" --user "${email}" on`, {
    env: { ...process.env, DATABASE_URL: DB_URL },
    stdio: 'pipe',
  });
}

async function signedIn(page: Page, tag: string): Promise<string> {
  const email = uniqueEmail(tag);
  await signUpAndVerify(page, email, PASSWORD);
  setUserFlag(email);
  await page.goto('/settings');
  await page.waitForLoadState('networkidle');
  return email;
}

async function signIn(browser: Browser, email: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto('/login');
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(PASSWORD);
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).toHaveURL('/');
  return page;
}

const motionOf = (page: Page) => page.evaluate(() => document.documentElement.dataset['motion']);
const presets = (page: Page) => page.getByRole('radiogroup', { name: 'Background motion' });
const preset = (page: Page, name: string) => presets(page).getByRole('radio', { name });
/** Resolves once the debounced save (R9) has reached the server. */
const saved = (page: Page) =>
  page.waitForResponse((r) => r.url().endsWith('/me') && r.request().method() === 'PATCH');

test('with the flag off the picker is absent', async ({ page }) => {
  await signUpAndVerify(page, uniqueEmail('off'), PASSWORD);
  await page.goto('/settings');
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('heading', { name: 'Theme' })).toBeVisible();
  await expect(presets(page)).toHaveCount(0);
});

test('a new user starts on Particles; Board grid survives a reload and a fresh context', async ({
  page,
  browser,
}) => {
  const email = await signedIn(page, 'grid');
  await expect(preset(page, 'Particles')).toBeChecked();
  expect(await motionOf(page)).toBe('particles');

  const done = saved(page);
  await preset(page, 'Board grid').check();
  await expect.poll(() => motionOf(page)).toBe('grid'); // previews before the save lands
  await done;

  await page.reload();
  await expect.poll(() => motionOf(page)).toBe('grid');
  await expect(preset(page, 'Board grid')).toBeChecked();

  const other = await signIn(browser, email);
  await expect.poll(() => motionOf(other)).toBe('grid');
  await other.context().close();
});

test('last save wins across contexts (Grain then Aurora drift)', async ({ page, browser }) => {
  const email = await signedIn(page, 'last');
  await preset(page, 'Grain').check();
  await preset(page, 'Aurora drift').check();
  await saved(page);
  const other = await signIn(browser, email);
  await expect.poll(() => motionOf(other)).toBe('aurora');
  await other.context().close();
});

test('user A and user B each see only their own preset', async ({ page, browser }) => {
  const emailA = await signedIn(page, 'iso-a');
  await preset(page, 'Grain').check();
  await saved(page);

  const pageB = await (await browser.newContext()).newPage();
  await signedIn(pageB, 'iso-b');
  await expect(preset(pageB, 'Particles')).toBeChecked();
  expect(await motionOf(pageB)).toBe('particles');
  await pageB.context().close();

  const a2 = await signIn(browser, emailA);
  await expect.poll(() => motionOf(a2)).toBe('grain');
  await a2.context().close();
});

test('the colour row shows in light, hides in dark; the switches persist', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await signedIn(page, 'switches');
  await expect(page.getByRole('radiogroup', { name: 'Motion colour' })).toBeVisible();
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.reload();
  await expect(page.getByRole('radiogroup', { name: 'Motion colour' })).toHaveCount(0);
  await page.emulateMedia({ colorScheme: 'light' });

  await page.reload();
  const panels = page.getByRole('switch', { name: 'Translucent panels' });
  const pause = page.getByRole('switch', { name: 'Pause background motion' });
  await expect(panels).toHaveAttribute('aria-checked', 'true');
  await expect(pause).toHaveAttribute('aria-checked', 'false');

  const done = saved(page);
  await panels.click();
  await pause.click();
  await done;
  await page.reload();
  await expect(panels).toHaveAttribute('aria-checked', 'false');
  await expect(pause).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('html')).toHaveAttribute('data-panels', 'solid');
  await expect(page.locator('html')).toHaveAttribute('data-motion-paused', '');
});

test('axe is clean on Settings with the picker, in light and dark', async ({ page }) => {
  await signedIn(page, 'axe');
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');
    await expect(presets(page)).toBeVisible();
    await axeCheck(page);
  }
});
