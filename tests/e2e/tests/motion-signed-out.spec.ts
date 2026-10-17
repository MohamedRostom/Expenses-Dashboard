import { execSync } from 'node:child_process';
import { expect, test, type Page } from '@playwright/test';
import { csrfHeaders, signUpAndVerify } from '../fixtures/index.js';

/**
 * T026 (spec 006 US5, FR-021): sign-in, sign-up and reset show Particles in the default tint when
 * the public flag is on and a still ground when it is off; a signed-out page never shows a
 * previous user's choice; each form sits on a centred `.surface` panel. `GET /flags/public` is
 * mocked so the global flag is never touched. The landing page is covered at build time by
 * apps/landing/src/landing.build.test.ts (the flag is baked in), here only its `.surface` panels.
 */

const PAGES = ['/login', '/register', '/reset?token=x'];
const LANDING_URL = process.env['E2E_LANDING_URL'] ?? 'http://localhost:5174';
const DB_URL = process.env['DATABASE_URL'] ?? 'postgres://desk:desk@localhost:5432/desk';
const MINT = '#7fd1a8';

async function setPublicFlag(page: Page, on: boolean): Promise<void> {
  await page.route('**/flags/public', (route) =>
    route.fulfill({ json: { flags: { 'appearance.motion': on } } }),
  );
}

const html = (page: Page) =>
  page.evaluate(() => ({
    motion: document.documentElement.dataset['motion'],
    tint: document.documentElement.style.getPropertyValue('--motion-tint'),
  }));

for (const path of PAGES) {
  test.describe(path, () => {
    test('flag on: Particles in the default tint, form on a centred .surface panel', async ({
      page,
    }) => {
      await setPublicFlag(page, true);
      await page.goto(path);
      await expect.poll(async () => (await html(page)).motion).toBe('particles');
      expect((await html(page)).tint).toBe(MINT);
      await expect(page.getByTestId('background-motion')).toBeAttached();

      const panel = page.locator('main.surface');
      await expect(panel.locator('form')).toBeVisible();
      const box = (await panel.boundingBox())!;
      const viewport = page.viewportSize()!;
      expect(box.width).toBeLessThanOrEqual(28 * 16 + 1);
      expect(Math.abs(box.x + box.width / 2 - viewport.width / 2)).toBeLessThan(2);
    });

    test('flag off: a still ground', async ({ page }) => {
      await setPublicFlag(page, false);
      await page.goto(path);
      await expect(page.locator('main.surface form')).toBeVisible();
      await expect.poll(async () => (await html(page)).motion).toBe('none');
    });

    test('reflows at 360 without horizontal scroll', async ({ page }) => {
      await page.setViewportSize({ width: 360, height: 740 });
      await setPublicFlag(page, true);
      await page.goto(path);
      await expect(page.locator('main.surface')).toBeVisible();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      );
      expect(overflow).toBe(false);
    });
  });
}

test('landing sections sit on .surface panels', async ({ page }) => {
  await page.goto(LANDING_URL);
  for (const cls of ['hero', 'steps', 'screenshots']) {
    await expect(page.locator(`section.${cls}.surface`)).toHaveCount(1);
  }
  await page.goto(`${LANDING_URL}/privacy`);
  await expect(page.locator('main.surface')).toBeVisible();
});

test("never shows the last user's choice", async ({ page }) => {
  const email = `motion-signed-out-${Date.now()}@example.com`;
  await signUpAndVerify(page, email, 'xk-e2e-Tr0ub4-fixture-2026');
  execSync(`pnpm --filter @desk/db flags set "appearance.motion" --user "${email}" on`, {
    env: { ...process.env, DATABASE_URL: DB_URL },
    stdio: 'pipe',
  });
  const saved = await page.request.patch('/me', {
    headers: await csrfHeaders(page),
    data: { motionPreset: 'grid' },
  });
  expect(saved.ok()).toBe(true);
  await page.goto('/');
  await expect.poll(async () => (await html(page)).motion).toBe('grid');
  const out = await page.request.post('/auth/logout', { headers: await csrfHeaders(page) });
  expect(out.status()).toBe(204);
  await setPublicFlag(page, true);
  await page.goto('/login');
  await expect.poll(async () => (await html(page)).motion).toBe('particles');
  expect((await html(page)).tint).toBe(MINT);
});
