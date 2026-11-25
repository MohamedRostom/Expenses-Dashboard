import { execSync } from 'node:child_process';
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

  // ADR-0008: from 1024 Entries sits beside a column holding chart, forecast and Category budgets; one column below.
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
    // Side by side = Entries ends left of where Categories starts while they share vertical space
    // (ADR-0008: Entries sits beside a column of chart, forecast and Category budgets from 1024).
    const beside =
      e!.x + e!.width <= c!.x + 1 && e!.y < c!.y + c!.height && c!.y < e!.y + e!.height;
    return { sideBySide: beside, width: row!.width };
  };

  expect((await layout(360)).sideBySide, 'stacked at 360').toBe(false);
  expect((await layout(768)).sideBySide, 'stacked at 768').toBe(false);
  const wide = await layout(1280);
  expect(wide.sideBySide, 'side by side at 1280').toBe(true);
  expect(wide.width, 'row <= 1160px at 1280').toBeLessThanOrEqual(1160);

  // T048, reworded for ADR-0008: Entries now sits beside the chart (about 615px wide), where a
  // 22-character name plus its checkbox needs more than the item column has. It may end in an
  // ellipsis, but never silently: the full name is its title.
  const name = page.locator('[data-panel="entries"] .desk-item-name', {
    hasText: 'Streaming subscription',
  });
  await expect(name).toBeVisible();
  await expect(name).toHaveAttribute('title', 'Streaming subscription');
});

// Phase 5: the month view keeps the page gutters the top bar and Settings keep, so no tile or the
// Add expense button touches the viewport edge, and a pending-rate lamp never covers the date.
test('reflow: month content sits inside the top bar gutters and the row lamp clears the date text', async ({
  page,
}) => {
  await signUpAndVerify(page, `reflow-gutter-${Date.now()}@example.com`, PASSWORD);
  const me = (await (await page.request.get('/me')).json()) as {
    user: { defaultCurrency: string };
  };
  const res = await page.request.post('/expenses', {
    headers: await csrfHeaders(page),
    data: {
      description: 'Abroad',
      amount: { minor: 1_250, currency: me.user.defaultCurrency === 'EUR' ? 'GBP' : 'EUR' },
      date: new Date().toISOString().slice(0, 10),
      categoryId: null,
      paidWith: 'card',
      kind: 'variable',
    },
  });
  expect(res.ok()).toBe(true);

  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await expect(page.locator('[data-panel="entries"]')).toBeVisible();
    const m = await page.evaluate(() => {
      const right = (el: Element) => el.getBoundingClientRect().right;
      const left = (el: Element) => el.getBoundingClientRect().left;
      const bar = document.querySelector('[data-testid="top-bar"]')!;
      const tiles = [...document.querySelectorAll('.desk-month-view .desk-tile')];
      const add = [...document.querySelectorAll('#top-bar-actions button')].find((b) =>
        /add expense/i.test(b.textContent ?? ''),
      )!;
      const lamp = document.querySelector('.desk-row-lamp');
      const text = lamp?.nextSibling;
      let textLeft = Infinity;
      if (text && text.nodeType === Node.TEXT_NODE) {
        const r = document.createRange();
        r.selectNodeContents(text);
        textLeft = r.getBoundingClientRect().left;
      }
      return {
        barLeft: left(bar),
        barRight: right(bar),
        tilesRight: Math.max(...tiles.map(right)),
        addRight: right(add),
        lampRight: lamp ? right(lamp) : null,
        textLeft,
        vw: document.documentElement.clientWidth,
      };
    });
    expect(m.tilesRight, `last tile right edge at ${width}`).toBeLessThanOrEqual(m.barRight + 1);
    expect(m.addRight, `Add expense right edge at ${width}`).toBeLessThanOrEqual(m.barRight + 1);
    expect(m.tilesRight, `tiles clear the viewport edge at ${width}`).toBeLessThanOrEqual(
      m.vw - 16,
    );
    expect(m.barLeft, `top bar gutter at ${width}`).toBeGreaterThanOrEqual(16);
    if (width >= 768) {
      expect(m.lampRight, 'a pending-rate lamp is shown').not.toBeNull();
      expect(m.lampRight!, `lamp ends before the date text at ${width}`).toBeLessThanOrEqual(
        m.textLeft,
      );
    }
  }
});

// Settings is tabbed (four tabs, one visible panel) at every width; the old sticky index is gone.
test('reflow: settings tablist is visible at 360 and 1280 with four tabs and one visible panel', async ({
  page,
}) => {
  await signUpAndVerify(page, `reflow-index-${Date.now()}@example.com`, PASSWORD);
  for (const width of [360, 1280]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/settings');
    await expect(page.getByRole('tablist', { name: 'Settings sections' })).toBeVisible();
    await expect(page.getByRole('tab')).toHaveCount(4);
    await expect(page.locator('[role="tabpanel"]:visible')).toHaveCount(1);
    await assertFits(page, `settings tabs ${width}`);
  }
});

/** Opens a Settings tab by its visible name. */
const openTab = (page: Page, name: string) => page.getByRole('tab', { name, exact: true }).click();

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
  // A budgeted category: unbudgeted ones sit in a closed group, so the bars would be hidden.
  await addExpense(page, 'Lunch', 'Lunch budget');
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
  // Settings is tabbed: collect the visible sections of every tab (hidden panels measure 0).
  const insets: number[] = [];
  for (const tab of ['account', 'preferences', 'look', 'data']) {
    await page.goto(`/settings#sg-${tab}`);
    const sections = page.locator('.desk-settings-section:visible');
    await expect(sections.first()).toBeVisible();
    insets.push(
      ...(await sections.evaluateAll((els) =>
        els.map((el) => {
          const h = el.querySelector('.desk-panel-frame-heading')!;
          const r = document.createRange();
          r.selectNodeContents(h);
          return (
            r.getBoundingClientRect().x -
            el.querySelector('.desk-panel-frame-flap')!.getBoundingClientRect().x
          );
        }),
      )),
    );
  }
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
  // Date and category share one meta line, the category cut with an ellipsis (its title is the full
  // name), so a row stays short instead of growing a line per wrapped word.
  const cat = item.locator('.desk-item-cat');
  const date = item.locator('.desk-item-date');
  await expect(cat).toHaveAttribute('title', category);
  expect(await cat.evaluate((el) => getComputedStyle(el).textOverflow), 'ellipsis').toBe(
    'ellipsis',
  );
  const [dateBox, catBox] = [await date.boundingBox(), await cat.boundingBox()];
  expect(Math.abs(dateBox!.y - catBox!.y), 'date and category share a line').toBeLessThanOrEqual(2);
  expect(catBox!.height, 'one line').toBeLessThanOrEqual(24);
  const row = (await item.locator('xpath=ancestor::tr').boundingBox())!;
  expect(row.height, 'row height at 360').toBeLessThanOrEqual(80);
  // Sessions subline at 360: the whole "Last seen" stamp is readable, without the current year.
  await page.goto('/settings#st-sessions');
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
    await page.goto('/settings#st-sessions');
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
  await page.goto('/settings#st-sessions');
  await expect(sessions.locator('tbody tr').first()).toBeVisible();
  const current = sessions.getByText('This session');
  expect((await current.boundingBox())!.height, 'one line').toBeLessThan(24);
  const email = page.locator('#st-profile .desk-settings-value');
  expect(await email.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  await openTab(page, 'Preferences');
  const label = page.locator('#st-currency .desk-field-label');
  expect((await label.boundingBox())!.width).toBeLessThanOrEqual(1);
  await expect(page.getByRole('combobox', { name: /default currency/i })).toBeVisible();
});

/**
 * Settings fills its width: within every group, cards in a row share one height and the row ends
 * at the group's right edge (no hole, no ragged short card); at 360 the cards are one column.
 * Run with the appearance flags off and on, since they add and remove a card.
 */
const DB_URL = process.env['DATABASE_URL'] ?? 'postgres://desk:desk@localhost:5432/desk';
for (const flags of [false, true]) {
  test(`reflow: settings cards fill their rows at 360, 1280 and 1920 (appearance flags ${flags ? 'on' : 'off'})`, async ({
    page,
  }) => {
    const email = `reflow-settings-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
    await signUpAndVerify(page, email, PASSWORD);
    if (flags) {
      for (const flag of ['appearance.motion', 'appearance.accent']) {
        execSync(`pnpm --filter @desk/db flags set "${flag}" --user "${email}" on`, {
          env: { ...process.env, DATABASE_URL: DB_URL },
          stdio: 'pipe',
        });
      }
    }
    for (const width of [360, 1280, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/settings');
      await page.waitForLoadState('networkidle');
      await expect(page.locator('#st-sessions')).toBeVisible();
      // The panels are tabs: open each one, measure its grid while it is the visible panel.
      const measure = () =>
        page.evaluate(() => {
          const rect = (el: Element) => {
            const r = el.getBoundingClientRect();
            return { top: r.top, left: r.left, right: r.right, height: r.height };
          };
          const rowsOf = (container: Element, items: Element[]) => {
            const rows: ReturnType<typeof rect>[][] = [];
            for (const r of items.map(rect)) {
              const row = rows.find((x) => Math.abs(x[0]!.top - r.top) <= 1);
              if (row) row.push(r);
              else rows.push([r]);
            }
            return { box: rect(container), rows };
          };
          const grids = [
            ...document.querySelectorAll(
              '[role="tabpanel"]:not([style*="display: none"]) .desk-settings-group-grid',
            ),
          ].map((g) => rowsOf(g, [...g.children]));
          const tools = document.querySelector('.desk-settings-tools-list')!;
          return {
            grids,
            tools: rowsOf(tools, [...tools.children]),
            scroll: document.documentElement.scrollWidth,
            client: document.documentElement.clientWidth,
            cards: [
              ...document.querySelectorAll(
                '[role="tabpanel"]:not([style*="display: none"]) .desk-settings-group-grid > *',
              ),
            ].length,
          };
        });
      const parts = [];
      for (const tab of ['Account', 'Preferences', 'Look and feel', 'Your data']) {
        await openTab(page, tab);
        parts.push(await measure());
      }
      const m = {
        grids: parts.flatMap((p) => p.grids),
        tools: parts[0]!.tools,
        scroll: Math.max(...parts.map((p) => p.scroll)),
        client: parts[0]!.client,
        cards: parts.reduce((n, p) => n + p.cards, 0),
      };
      expect(m.scroll, `${width}: no sideways scroll`).toBeLessThanOrEqual(m.client);
      expect(m.cards, `${width}: card count`).toBe(flags ? 10 : 9);
      for (const g of [...m.grids, m.tools]) {
        for (const row of g.rows) {
          const last = row.reduce((a, b) => (b.right > a.right ? b : a));
          expect(
            Math.abs(last.right - g.box.right),
            `${width}: row reaches the right edge`,
          ).toBeLessThanOrEqual(1);
          for (const c of row) {
            expect(
              Math.abs(c.height - row[0]!.height),
              `${width}: equal heights in a row`,
            ).toBeLessThanOrEqual(1);
          }
        }
        if (width === 360) {
          expect(
            g.rows.every((r) => r.length === 1),
            '360: one column',
          ).toBe(true);
        }
      }
      if (width >= 1280) {
        // Account is two wide cards. The short-card groups (Preferences, Your data) sit two across
        // with the last card full width, and three across from 1440 once the sidebar leaves room.
        const short = width >= 1440 ? [3] : [2, 1];
        expect(m.grids.map((g) => g.rows.map((r) => r.length))).toEqual(
          flags ? [[1, 1], short, [1, 1], short] : [[1, 1], short, [1], short],
        );
        expect(m.grids[0]!.box.right - m.grids[0]!.box.left).toBeGreaterThan(
          width >= 1440 ? 900 : 700,
        );
      }
    }
  });
}

// The hero figure with a six-digit remaining must neither wrap mid-figure nor leave its tile at 360.
test('reflow: a six-digit remaining stays on one line inside the hero tile at 360', async ({
  page,
}) => {
  await signUpAndVerify(page, `reflow-hero-${Date.now()}@example.com`, PASSWORD);
  await addExpense(page, 'Lunch', 'Big budget');
  const cats = (await (await page.request.get('/categories')).json()) as {
    categories: { id: string; name: string }[];
  };
  const big = cats.categories.find((c) => c.name === 'Big budget')!;
  const patched = await page.request.patch(`/categories/${big.id}`, {
    headers: await csrfHeaders(page),
    data: { budgetMinor: 98_765_432 },
  });
  expect(patched.ok()).toBe(true);
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/');
  const figure = page.locator('[data-tile-primary="figure"]');
  await expect(figure).toContainText('987,');
  const m = await figure.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const tile = el.closest('[data-tile]')!.getBoundingClientRect();
    const range = document.createRange();
    range.selectNodeContents(el);
    // One client rect per line box of text: more than one means the figure wrapped.
    const tops = new Set([...range.getClientRects()].map((q) => Math.round(q.top)));
    return {
      lines: tops.size,
      inside: r.left >= tile.left && r.right <= tile.right,
      fits: el.scrollWidth <= el.clientWidth,
    };
  });
  expect(m.lines, 'one line').toBe(1);
  expect(m.inside, 'inside the tile').toBe(true);
  expect(m.fits, 'no overflow').toBe(true);
});
