import { expect, test, type Locator, type Page } from '@playwright/test';
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

// T031: the Settings section index sticks beside the panels from 1024 up (lost in the US2 reflow).
test('reflow: settings section index is a sticky column at 1280, a row at 360', async ({
  page,
}) => {
  await signUpAndVerify(page, `reflow-index-${Date.now()}@example.com`, PASSWORD);
  const index = page.locator('.desk-settings-index');
  const probe = () =>
    Promise.all([
      index.evaluate((el) => getComputedStyle(el).position),
      index.boundingBox(),
      page.locator('.desk-settings-sections').boundingBox(),
    ]);
  await page.setViewportSize({ width: 1280, height: 600 });
  await page.goto('/settings');
  const [pos, i, s] = await probe();
  expect(pos).toBe('sticky');
  expect(s!.x, 'panels sit right of the index').toBeGreaterThanOrEqual(i!.x + i!.width);
  await page.mouse.wheel(0, 800);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  // top is --space-4 (16px) while stuck; a non-sticky index would have scrolled far above 0.
  await expect
    .poll(async () => {
      const y = (await index.boundingBox())!.y;
      return y >= 0 && y <= 32;
    })
    .toBe(true);
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/settings');
  expect((await probe())[0]).toBe('static');
});

/** Left edge of the element's text (its content, not its padding box). */
const textEdge = (loc: Locator) =>
  loc.first().evaluate((el) => {
    const r = document.createRange();
    r.selectNodeContents(el);
    return r.getBoundingClientRect().x;
  });

/** Distance from a panel's glass edge to its label text. */
const labelInset = (panel: Locator) =>
  panel
    .locator('.desk-panel-frame-heading')
    .first()
    .evaluate((el) => {
      const r = document.createRange();
      r.selectNodeContents(el);
      return (
        r.getBoundingClientRect().x -
        el.closest('.desk-panel-frame-flap')!.getBoundingClientRect().x
      );
    });

/** Adds an expense; `withCategory` files it under the account's first seeded category and returns its name. */
async function addExpense(page: Page, description: string, withCategory: boolean | string = false) {
  let categoryId: string | null = null;
  let categoryName = '';
  if (typeof withCategory === 'string') {
    const made = await page.request.post('/categories', {
      headers: await csrfHeaders(page),
      data: { name: withCategory, colour: '#3a6ea5', budgetMinor: 10_000 },
    });
    expect(made.ok()).toBe(true);
    ({ id: categoryId, name: categoryName } = (
      (await made.json()) as {
        category: { id: string; name: string };
      }
    ).category);
  } else if (withCategory) {
    const cats = (await (await page.request.get('/categories')).json()) as {
      categories: { id: string; name: string }[];
    };
    ({ id: categoryId, name: categoryName } = cats.categories[0]!);
  }
  const me = (await (await page.request.get('/me')).json()) as {
    user: { defaultCurrency: string };
  };
  const res = await page.request.post('/expenses', {
    headers: await csrfHeaders(page),
    data: {
      description,
      amount: { minor: 1_250, currency: me.user.defaultCurrency },
      date: new Date().toISOString().slice(0, 10),
      categoryId,
      paidWith: 'card',
      kind: 'variable',
    },
  });
  expect(res.ok()).toBe(true);
  return categoryName;
}

// T049: every panel label keeps one inset, and a direct-child table lines up with it from 768.
test('reflow: panel labels share one inset; Entries label meets its first column', async ({
  page,
}) => {
  await signUpAndVerify(page, `reflow-align-${Date.now()}@example.com`, PASSWORD);
  await addExpense(page, 'Lunch', true);
  for (const width of [768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    const entries = page.locator('[data-panel="entries"]');
    const cats = page.locator('[data-panel="categories"]');
    await expect(entries.locator('tbody tr').first()).toBeVisible();
    // Bars tab (the default): the first bar starts on the label's inset, as on the board.
    const bar = cats.locator('.desk-category-bars-svg').first();
    await expect(bar).toBeVisible();
    expect(
      Math.abs(
        (await bar.boundingBox())!.x - (await textEdge(cats.locator('.desk-panel-frame-heading'))),
      ),
      `Categories bars vs label at ${width}`,
    ).toBeLessThanOrEqual(1);
    await cats.getByRole('tab', { name: /table/i }).click();
    await expect(cats.locator('table')).toBeVisible();
    expect(
      Math.abs((await labelInset(entries)) - (await labelInset(cats))),
      `Entries vs Categories (Table tab) labels at ${width}`,
    ).toBeLessThanOrEqual(1);
    const label = await textEdge(entries.locator('.desk-panel-frame-heading'));
    const cell = await textEdge(entries.locator('tbody tr > :first-child'));
    expect(Math.abs(label - cell), `label vs first cell at ${width}`).toBeLessThanOrEqual(1);
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/settings');
  const sections = page.locator('.desk-settings-section');
  await expect(sections.first()).toBeVisible();
  const insets = await sections.evaluateAll((els) =>
    els.map((el) => {
      const h = el.querySelector('.desk-panel-frame-heading')!;
      const r = document.createRange();
      r.selectNodeContents(h);
      return (
        r.getBoundingClientRect().x -
        el.querySelector('.desk-panel-frame-flap')!.getBoundingClientRect().x
      );
    }),
  );
  expect(insets.length).toBeGreaterThan(3);
  expect(
    Math.max(...insets) - Math.min(...insets),
    'Settings labels (Sessions vs Time zone)',
  ).toBeLessThanOrEqual(1);
});

// T049: at phone width the date moves under the item name so the item column can read.
test('reflow: Entries item column is at least 8rem at 360 with the date in its subline', async ({
  page,
}) => {
  await signUpAndVerify(page, `reflow-item-${Date.now()}@example.com`, PASSWORD);
  const category = await addExpense(
    page,
    'Busy day lunch with Ann',
    'Professional membership fees',
  );
  await page.setViewportSize({ width: 360, height: 900 });
  await page.goto('/');
  const entries = page.locator('[data-panel="entries"]');
  const item = entries.locator('tbody tr > td:nth-child(2)').first();
  await expect(item).toBeVisible();
  expect((await item.boundingBox())!.width, 'item column width').toBeGreaterThanOrEqual(128);
  await expect(entries.locator('thead th', { hasText: 'Date' })).toBeHidden();
  await expect(item.locator('.desk-item-date')).toBeVisible();
  // The date has its own line, so the category keeps the full subline width.
  const cat = item.locator('.desk-item-cat');
  // A two-line name wraps instead of ending in an ellipsis: nothing is cut sideways or below.
  expect(
    await cat.evaluate(
      (el) => el.scrollWidth <= el.clientWidth && el.scrollHeight <= el.clientHeight,
    ),
    'category not truncated',
  ).toBe(true);
  expect((await cat.textContent())!.trim()).toBe(category);
  expect(
    await item.locator('.desk-item-date').evaluate((el) => getComputedStyle(el).display),
    'date on its own line',
  ).toBe('block');
  expect((await cat.textContent())!).toContain(category);
  // Sessions subline at 360: the whole "Last seen" stamp is readable, without the current year.
  await page.goto('/settings');
  const seen = page.locator('#st-sessions .desk-settings-seen-inline').first();
  await expect(seen).toBeVisible();
  expect(
    await seen.evaluate(
      (el) => el.scrollWidth <= el.clientWidth && el.scrollHeight <= el.clientHeight,
    ),
    'last seen not cut',
  ).toBe(true);
  expect(await seen.textContent()).not.toContain(String(new Date().getFullYear()));
  await page.goto('/');
  await page.setViewportSize({ width: 768, height: 900 });
  await expect(entries.locator('thead th', { hasText: 'Date' })).toBeVisible();
  await expect(item.locator('.desk-item-date')).toBeHidden();
});

// T049: at 1024 the Sessions table and the profile email fit without clipping, and the currency
// field is named once visibly (its label is the accessible name only).
test('reflow: settings at 1024 and 1280 keeps Sessions on one line and names currency once', async ({
  page,
}) => {
  await signUpAndVerify(page, `reflow-1024-${Date.now()}@example.com`, PASSWORD);
  const sessions = page.locator('#st-sessions');
  for (const width of [1024, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/settings');
    await assertFits(page, `settings ${width}`);
    await expect(sessions.locator('tbody tr').first()).toBeVisible();
    // The ellipsis lives on the inner name span, not the cell, so measure the span.
    const clipped = await sessions
      .locator('.desk-item-name')
      .evaluateAll((els) =>
        els
          .filter((el) => el.scrollWidth > el.clientWidth)
          .map((el) => `${el.textContent?.trim()}|${el.scrollWidth}>${el.clientWidth}`),
      );
    expect(clipped, `clipped device names at ${width}`).toEqual([]);
    expect(
      (await sessions.locator('.desk-item-name').first().boundingBox())!.width,
    ).toBeGreaterThanOrEqual(120);
  }
  await page.setViewportSize({ width: 1024, height: 900 });
  await page.goto('/settings');
  await expect(sessions.locator('tbody tr').first()).toBeVisible();
  const current = sessions.getByText('This session');
  expect((await current.boundingBox())!.height, 'one line').toBeLessThan(24);
  const email = page.locator('#st-profile .desk-settings-value');
  expect(await email.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  const label = page.locator('#st-currency .desk-field-label');
  expect((await label.boundingBox())!.width).toBeLessThanOrEqual(1);
  await expect(page.getByRole('combobox', { name: /default currency/i })).toBeVisible();
});
