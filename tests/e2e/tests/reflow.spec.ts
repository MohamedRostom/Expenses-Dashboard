import { expect, test, type Page } from '@playwright/test';
import { csrfHeaders, signUpAndVerify } from '../fixtures/index.js';

/**
 * T022 / spec 006 US2, FR-010, SC-003, research R7: panels reflow by width. Every route at 360,
 * 768 and 1280 in both themes has no sideways scroll; the month view's panels sit in one column at
 * 360 and two at 768; content is never wider than 1160px. Runs in the `ci` project (no @tags).
 */

const PASSWORD = 'xk-e2e-Tr0ub4-fixture-2026';
const widths = [360, 768, 1280] as const;
const themes = ['light', 'dark'] as const;
const signedOut = [
  '/login',
  '/register',
  '/forgot',
  '/reset?token=expired',
  '/verify?token=expired',
];
const signedIn = [
  '/',
  '/add',
  '/today',
  '/year',
  '/import',
  '/bin',
  '/settings',
  '/settings/categories',
  '/settings/capture',
  '/settings/connectors',
  '/settings/connections',
];

async function assertFits(page: Page, label: string) {
  const m = await page.evaluate(() => {
    const d = document.documentElement;
    const main = document.querySelector('.board-grid'); // the 1160px cap is on the grid, not <main>
    return {
      scroll: d.scrollWidth,
      client: d.clientWidth,
      main: main ? main.getBoundingClientRect().width : 0,
    };
  });
  expect(m.scroll, `${label}: scrollWidth <= clientWidth`).toBeLessThanOrEqual(m.client);
  expect(m.main, `${label}: panel grid <= 1160px`).toBeLessThanOrEqual(1160);
}

async function sweep(page: Page, route: string) {
  for (const theme of themes) {
    await page.emulateMedia({ colorScheme: theme });
    for (const width of widths) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto(route);
      await page.waitForLoadState('networkidle');
      await assertFits(page, `${route} ${theme} ${width}`);
    }
  }
}

for (const route of signedOut) {
  test(`reflow: ${route} signed out has no sideways scroll at 360, 768, 1280`, async ({ page }) => {
    await sweep(page, route);
  });
}

for (const route of signedIn) {
  test(`reflow: ${route} signed in has no sideways scroll at 360, 768, 1280`, async ({ page }) => {
    await signUpAndVerify(
      page,
      `reflow-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`,
      PASSWORD,
    );
    await sweep(page, route);
  });
}

test('reflow: month view panels stack at 360 and 768, sit side by side at 1280, never wider than 1160px', async ({
  page,
}) => {
  const email = `reflow-month-${Date.now()}@example.com`;
  await signUpAndVerify(page, email, PASSWORD);
  const me = (await (await page.request.get('/me')).json()) as {
    user: { defaultCurrency: string };
  };
  const res = await page.request.post('/expenses', {
    headers: await csrfHeaders(page),
    data: {
      description: 'Lunch',
      amount: { minor: 1_250, currency: me.user.defaultCurrency },
      date: new Date().toISOString().slice(0, 10),
      categoryId: null,
      paidWith: 'card',
      kind: 'variable',
    },
  });
  expect(res.ok()).toBe(true);
  const long = await page.request.post('/expenses', {
    headers: await csrfHeaders(page),
    data: {
      description: 'Streaming subscription',
      amount: { minor: 1_500, currency: me.user.defaultCurrency },
      date: new Date().toISOString().slice(0, 10),
      categoryId: null,
      paidWith: 'card',
      kind: 'variable',
    },
  });
  expect(long.ok()).toBe(true);

  // Spec 006 T044: Categories and Entries are a wrapping flex row (380 + 460 px bases), not .board-grid.
  const layout = async (width: number) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    const entries = page.locator('[data-panel="entries"]');
    await expect(entries).toBeVisible();
    const categories = page.locator('[data-panel="categories"]');
    await expect(categories).toBeVisible();
    const [c, e, row] = await Promise.all([
      categories.boundingBox(),
      entries.boundingBox(),
      page.locator('.desk-month-view-columns').boundingBox(),
    ]);
    return { sideBySide: e!.y < c!.y + c!.height - 1, width: row!.width };
  };

  expect((await layout(360)).sideBySide, 'stacked at 360').toBe(false);
  expect((await layout(768)).sideBySide, 'stacked at 768').toBe(false);
  const wide = await layout(1280);
  expect(wide.sideBySide, 'side by side at 1280').toBe(true);
  expect(wide.width, 'row <= 1160px at 1280').toBeLessThanOrEqual(1160);

  // T048: at 1280 the item column takes the free width, so a 22-character name is not truncated.
  const name = page.locator('[data-panel="entries"] .desk-item-name', {
    hasText: 'Streaming subscription',
  });
  await expect(name).toBeVisible();
  expect(await name.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
});
