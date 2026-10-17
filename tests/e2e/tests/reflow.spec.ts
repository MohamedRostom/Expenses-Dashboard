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

test('reflow: month view panels are one column at 360 and two at 768, never wider than 1160px', async ({
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

  const columns = async (width: number) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await expect(page.locator('[data-panel="entries"]')).toBeVisible();
    return page
      .locator('.board-grid')
      .first()
      .evaluate((el) => ({
        cols: getComputedStyle(el).gridTemplateColumns.split(' ').length,
        width: el.getBoundingClientRect().width,
      }));
  };

  expect((await columns(360)).cols, 'one column at 360').toBe(1);
  expect((await columns(768)).cols, 'two columns at 768').toBe(2);
  expect((await columns(1280)).width, 'grid <= 1160px at 1280').toBeLessThanOrEqual(1160);
});
