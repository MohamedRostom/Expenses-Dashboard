import { execSync } from 'node:child_process';
import { expect, test, type Page } from '@playwright/test';
import { csrfHeaders, signUpAndVerify } from '../fixtures/index.js';

/**
 * T025 (spec 006 US4, FR-009, FR-013, FR-024, FR-025, SC-005): the background layer respects the
 * person and the device. `appearance.motion` is switched on for the test user only, like accent.spec.
 *
 * Hiding a page: Playwright cannot hide a tab, so the test overrides `document.visibilityState`
 * and dispatches `visibilitychange`, which is exactly what App.vue listens to.
 */

const DB_URL = process.env['DATABASE_URL'] ?? 'postgres://desk:desk@localhost:5432/desk';
const PASSWORD = 'xk-e2e-Tr0ub4-fixture-2026';
const PRESETS = ['aurora', 'grid', 'particles', 'grain'];
const LAYER = '[data-testid="background-motion"]';

async function signedIn(page: Page, tag: string, motionPreset = 'aurora'): Promise<void> {
  const email = `motion-a11y-${tag}-${Date.now()}@example.com`;
  await signUpAndVerify(page, email, PASSWORD);
  execSync(`pnpm --filter @desk/db flags set "appearance.motion" --user "${email}" on`, {
    env: { ...process.env, DATABASE_URL: DB_URL },
    stdio: 'pipe',
  });
  await setPrefs(page, { motionPreset });
}

async function setPrefs(page: Page, data: Record<string, unknown>): Promise<void> {
  const res = await page.request.patch('/me', { headers: await csrfHeaders(page), data });
  expect(res.ok()).toBe(true);
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await expect(page.locator(LAYER)).toHaveCount(1);
}

const html = (page: Page, attr: string) =>
  page.evaluate((a) => document.documentElement.getAttribute(a), attr);

/** Alpha of a computed colour: rgb()/rgba() and `color(... / a)` forms. */
const alphaOf = (c: string): number => {
  const slash = /\/\s*([\d.]+)(%?)\s*\)$/.exec(c);
  if (slash) return Number(slash[1]) / (slash[2] ? 100 : 1);
  const rgba = /^rgba\(.*,\s*([\d.]+)\)$/.exec(c);
  return rgba ? Number(rgba[1]) : 1;
};
const surfaceBg = (page: Page) =>
  page
    .locator('.surface')
    .first()
    .evaluate((el) => getComputedStyle(el).backgroundColor);
const surfaceBlur = (page: Page) =>
  page
    .locator('.surface')
    .first()
    .evaluate((el) => getComputedStyle(el).backdropFilter);

async function emulate(page: Page, features: { name: string; value: string }[]): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setEmulatedMedia', { features });
}

const animationNames = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('[data-testid="background-motion"] *')].map(
      (e) => getComputedStyle(e).animationName,
    ),
  );

test('reduced motion: two screenshots 3 s apart are identical for every preset (SC-005)', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await signedIn(page, 'still');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const preset of PRESETS) {
    await setPrefs(page, { motionPreset: preset });
    expect(await html(page, 'data-motion')).toBe(preset);
    const a = await page.screenshot();
    await page.waitForTimeout(3000);
    const b = await page.screenshot();
    expect(b.equals(a), `${preset} moved under reduced motion`).toBe(true);
  }
});

test('a hidden page pauses the layer', async ({ page }) => {
  await signedIn(page, 'hidden');
  const blob = page.locator('.desk-motion__blob').first();
  expect(await html(page, 'data-motion-paused')).toBeNull();
  expect(await blob.evaluate((e) => getComputedStyle(e).animationPlayState)).toBe('running');
  const hide = (state: 'hidden' | 'visible') =>
    page.evaluate((s) => {
      Object.defineProperty(document, 'visibilityState', { value: s, configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    }, state);
  await hide('hidden');
  await expect.poll(() => html(page, 'data-motion-paused')).toBe('');
  expect(await blob.evaluate((e) => getComputedStyle(e).animationPlayState)).toBe('paused');
  await hide('visible');
  await expect.poll(() => html(page, 'data-motion-paused')).toBeNull();
});

test('the layer ignores the pointer, stays fixed while scrolling, and is absent in print', async ({
  page,
}) => {
  await signedIn(page, 'layer');
  const layer = page.locator(LAYER);
  expect(await layer.evaluate((e) => getComputedStyle(e).pointerEvents)).toBe('none');
  expect(await layer.evaluate((e) => getComputedStyle(e).position)).toBe('fixed');

  await page.evaluate(() => {
    const tall = document.createElement('div');
    tall.style.height = '4000px';
    document.body.appendChild(tall);
  });
  const before = await layer.evaluate((e) => JSON.stringify(e.getBoundingClientRect()));
  await page.evaluate(() => window.scrollTo(0, 2000));
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  expect(await layer.evaluate((e) => JSON.stringify(e.getBoundingClientRect()))).toBe(before);

  await page.emulateMedia({ media: 'print' });
  expect(await layer.evaluate((e) => getComputedStyle(e).display)).toBe('none');
});

test('a panel, not the layer, receives the pointer at its centre (FR-013)', async ({ page }) => {
  await signedIn(page, 'hit');
  const panel = page.locator('.surface').first();
  await panel.scrollIntoViewIfNeeded();
  const hit = await panel.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return {
      inPanel: !!top && el.contains(top),
      inLayer: !!top?.closest('[data-testid="background-motion"]'),
    };
  });
  expect(hit).toEqual({ inPanel: true, inLayer: false });
});

test('prefers-reduced-data: the layer is still', async ({ page }) => {
  await signedIn(page, 'data');
  expect((await animationNames(page)).some((n) => n !== 'none')).toBe(true);
  await emulate(page, [{ name: 'prefers-reduced-data', value: 'reduce' }]);
  expect((await animationNames(page)).every((n) => n === 'none')).toBe(true);
});

test('forced colours: the layer is not displayed and panels are opaque', async ({ browser }) => {
  const context = await browser.newContext({ forcedColors: 'active' });
  const page = await context.newPage();
  await signedIn(page, 'forced');
  expect(await page.locator(LAYER).evaluate((e) => getComputedStyle(e).display)).toBe('none');
  expect(alphaOf(await surfaceBg(page))).toBe(1);
  expect(await surfaceBlur(page)).toBe('none');
  await context.close();
});

test('prefers-reduced-transparency: panels are opaque while the saved switch still reads on (FR-024, FR-025)', async ({
  page,
}) => {
  await signedIn(page, 'transparency');
  expect(alphaOf(await surfaceBg(page))).toBeLessThan(1);
  await emulate(page, [{ name: 'prefers-reduced-transparency', value: 'reduce' }]);
  expect(alphaOf(await surfaceBg(page))).toBe(1);
  expect(await surfaceBlur(page)).toBe('none');
  await page.goto('/settings');
  await expect(page.getByRole('switch', { name: 'Translucent panels' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
});

test('the header has no backdrop-filter and an opaque background (FR-009)', async ({ page }) => {
  await signedIn(page, 'header');
  const header = page.locator('header.desk-header');
  expect(await header.evaluate((e) => getComputedStyle(e).backdropFilter)).toBe('none');
  expect(alphaOf(await header.evaluate((e) => getComputedStyle(e).backgroundColor))).toBe(1);
});
