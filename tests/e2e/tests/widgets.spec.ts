import { expect, test, type Page, type Route } from '@playwright/test';
import { axeCheck, signUpAndVerify } from '../fixtures/index.js';

// Not a real phrase, see tests/e2e/fixtures/index.ts's signUpAndVerify comment.
const PASSWORD = 'xk-e2e-Tr0ub4-fixture-2026';

function uniqueEmail(tag: string): string {
  return `e2e-${tag}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`;
}

/**
 * T011 (ci, foundational): the widget strip on the month view. The widgets API answers are
 * route-mocked so the states under test (empty, loading, unavailable, slow) are deterministic and
 * independent of the widgets.* flags; the real routes are covered by apps/api/test/widgets.test.ts.
 * Not run in the session that wrote it: the API routes land in a parallel batch.
 */

const TYPES = {
  types: [
    {
      kind: 'currency',
      name: 'Currency',
      description: 'Exchange rates against your default currency.',
      enabled: true,
      needsPlace: false,
      settingsSchema: {},
    },
    {
      kind: 'spend_pace',
      name: 'Spend pace',
      description: 'How this month is going against your budget.',
      enabled: true,
      needsPlace: false,
      settingsSchema: {},
    },
  ],
};

const widget = (state: string, over: Record<string, unknown> = {}) => ({
  id: 'w1',
  kind: 'spend_pace',
  position: 0,
  settings: {},
  state,
  asOf: new Date().toISOString(),
  ...over,
});

const list = (widgets: unknown[]) => ({ widgets, limit: 8, temperatureUnit: 'C' });

async function mockWidgets(
  page: Page,
  handler: (route: Route) => Promise<void> | void,
): Promise<void> {
  await page.route('**/widgets/types', (route) => route.fulfill({ json: TYPES }));
  await page.route(/\/widgets$/, (route) =>
    route.request().method() === 'GET' ? handler(route) : route.continue(),
  );
}

async function addExpense(page: Page, description: string): Promise<void> {
  await page.getByRole('button', { name: /add expense/i }).click();
  await page.getByLabel(/description/i).fill(description);
  await page.getByLabel(/^amount$/i).fill('12');
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /^add expense$/i })
    .click();
  await expect(page.getByText(description)).toBeVisible();
}

test('the month view renders its expenses before the strip appears', async ({ page }) => {
  await mockWidgets(page, async (route) => {
    await new Promise((r) => setTimeout(r, 1500));
    await route.fulfill({ json: list([]) });
  });
  await signUpAndVerify(page, uniqueEmail('widgets-order'), PASSWORD);
  await expect(page).toHaveURL('/');
  await addExpense(page, 'Strip order');
  await page.reload();

  await expect(page.getByText('Strip order')).toBeVisible();
  await expect(page.getByText('No widgets yet')).toBeHidden();
  await expect(page.getByText('No widgets yet')).toBeVisible({ timeout: 10_000 });
});

test('with no widgets the strip explains widgets and offers the enabled kinds', async ({
  page,
}) => {
  await mockWidgets(page, (route) => route.fulfill({ json: list([]) }));
  await signUpAndVerify(page, uniqueEmail('widgets-empty'), PASSWORD);
  await addExpense(page, 'Empty strip');

  const strip = page.getByTestId('widget-strip');
  await expect(strip.getByText(/widgets show small, read-only figures/i)).toBeVisible();
  await expect(strip.getByText(/Currency, Spend pace/)).toBeVisible();
  await axeCheck(page);
});

test('add widget lists each kind with a description and a preview', async ({ page }) => {
  await mockWidgets(page, (route) => route.fulfill({ json: list([]) }));
  await signUpAndVerify(page, uniqueEmail('widgets-add'), PASSWORD);
  await addExpense(page, 'Add sheet');

  await page.getByTestId('add-widget').click();
  const dialog = page.getByRole('dialog', { name: /add widget/i });
  for (const t of TYPES.types) {
    await expect(dialog.getByText(t.name, { exact: true })).toBeVisible();
    await expect(dialog.getByText(t.description)).toBeVisible();
  }
  await expect(dialog.getByLabel('Example')).toHaveCount(TYPES.types.length);
});

test('a widget with no figures holds a fixed-height frame and nothing below moves', async ({
  page,
}) => {
  let calls = 0;
  await mockWidgets(page, (route) => {
    calls += 1;
    return route.fulfill({
      json: list([
        calls === 1
          ? widget('empty')
          : widget('ready', {
              figures: {
                spentMinor: 1200,
                budgetMinor: null,
                pct: null,
                daysLeft: 20,
                dailyToBudgetMinor: null,
                overBudget: false,
              },
            }),
      ]),
    });
  });
  await signUpAndVerify(page, uniqueEmail('widgets-shift'), PASSWORD);
  await addExpense(page, 'No shift');

  const frame = page.getByTestId('widget-frame');
  await expect(frame).toBeVisible();
  const table = page.locator('.desk-entries-table');
  const before = { frame: await frame.boundingBox(), table: await table.boundingBox() };

  // The store reloads when the tab becomes visible again.
  await page.evaluate("document.dispatchEvent(new Event('visibilitychange'))");
  await expect(frame).toHaveAttribute('data-state', 'ready');
  const after = { frame: await frame.boundingBox(), table: await table.boundingBox() };

  expect(after.frame?.height).toBe(before.frame?.height);
  expect(after.table?.y).toBe(before.table?.y);
});

for (const [name, size] of [
  ['mobile', { width: 360, height: 740 }],
  ['desktop', { width: 1280, height: 800 }],
] as const) {
  test(`axe: loading and unavailable states at ${name} width`, async ({ page }) => {
    await page.setViewportSize(size);
    await mockWidgets(page, (route) =>
      route.fulfill({
        json: list([
          widget('empty', { id: 'w1' }),
          widget('unavailable', { id: 'w2', kind: 'currency' }),
        ]),
      }),
    );
    await signUpAndVerify(page, uniqueEmail(`widgets-axe-${name}`), PASSWORD);
    await addExpense(page, 'Axe frames');

    await expect(page.getByTestId('widget-frame')).toHaveCount(2);
    await expect(page.getByText(/unavailable right now/i)).toBeVisible();
    await axeCheck(page);
  });
}

/**
 * T026 (ci, currency, US1). Every answer is route-mocked (/widgets, /widgets/types, /currencies),
 * so these prove what the strip renders for the payloads the API contract allows, not the live
 * rates: rate maths, the Friday fallback, default-currency re-derivation and the failing range
 * endpoint are asserted against the real routes in apps/api/test/widgets.test.ts. There is no
 * freezeClock fixture yet, so the Saturday case mocks the Friday rateDate the server would send.
 * Written, not run, in the session that wrote it.
 */
const CODES = ['GBP', 'EUR', 'USD', 'JPY', 'CHF', 'CAD', 'AUD', 'NZD'];
const CURRENCIES = {
  currencies: CODES.map((code) => ({ code, name: `${code} name`, exponent: 2 })),
};

const eurRow = {
  code: 'EUR',
  rate: 1.1634,
  rateDate: '2026-10-02',
  prevChange: { pct: 0.4, direction: 'up' },
  monthChange: { pct: 1.2, direction: 'down', since: '2026-09-02' },
};

const currencyWidget = (rows: unknown[], over: Record<string, unknown> = {}) =>
  widget('ready', {
    kind: 'currency',
    settings: { currencies: rows.map((r) => (r as { code: string }).code) },
    figures: { rows },
    ...over,
  });

async function openCurrencyScene(
  page: Page,
  tag: string,
  widgets: () => unknown[],
  size = { width: 1280, height: 800 },
): Promise<void> {
  await page.setViewportSize(size);
  await page.route('**/currencies', (route) => route.fulfill({ json: CURRENCIES }));
  await mockWidgets(page, (route) => route.fulfill({ json: list(widgets()) }));
  await signUpAndVerify(page, uniqueEmail(tag), PASSWORD);
  await addExpense(page, `Currency ${tag}`);
}

test('adding a currency widget shows rate, date and both changes with direction', async ({
  page,
}) => {
  let widgets: unknown[] = [];
  await page.route('**/widgets', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    widgets = [currencyWidget([eurRow])];
    return route.fulfill({ status: 201, json: { widget: widgets[0] } });
  });
  await openCurrencyScene(page, 'cur-add', () => widgets);

  await page.getByTestId('add-widget').click();
  await page
    .getByRole('dialog', { name: /add widget/i })
    .getByRole('listitem')
    .filter({ hasText: 'Currency' })
    .getByRole('button', { name: 'Add' })
    .click();

  const frame = page.getByTestId('widget-frame');
  await expect(frame).toContainText('EUR', { timeout: 1000 });
  await expect(frame).toContainText('1.1634');
  await expect(frame).toContainText('2026-10-02');
  await expect(frame).toContainText('up 0.4%');
  await expect(frame).toContainText('down 1.2%');
  await expect(frame).toContainText('since 2026-09-02');
});

test('on a weekend the widget names the Friday the rate is from', async ({ page }) => {
  await openCurrencyScene(page, 'cur-sat', () => [
    currencyWidget([{ ...eurRow, rateDate: '2026-10-02' }]), // 2 Oct 2026 is a Friday
  ]);
  await expect(page.getByTestId('widget-frame')).toContainText('2026-10-02');
});

test('the default currency row has no figures', async ({ page }) => {
  await openCurrencyScene(page, 'cur-default', () => [
    currencyWidget([
      { code: 'EUR', isDefault: true },
      { ...eurRow, code: 'USD' },
    ]),
  ]);
  const frame = page.getByTestId('widget-frame');
  await expect(frame.getByText('your default currency')).toBeVisible();
  await expect(frame.getByText('EUR').locator('..')).not.toContainText(/\d\.\d/);
});

test('a failing range endpoint reads "not available yet" with no error banner', async ({
  page,
}) => {
  await openCurrencyScene(page, 'cur-pending', () => [
    currencyWidget([{ ...eurRow, prevChange: null, monthChange: null, changesPending: true }]),
  ]);
  const frame = page.getByTestId('widget-frame');
  await expect(frame.getByText('not available yet')).toHaveCount(2);
  await expect(frame.getByRole('alert')).toHaveCount(0);
  await expect(frame).toHaveAttribute('data-state', 'ready');
});

test('settings refuse the default currency and a seventh code with a message', async ({ page }) => {
  const six = ['EUR', 'USD', 'JPY', 'CHF', 'CAD', 'AUD'];
  await page.route(/\/widgets\/w1$/, (route) => route.fulfill({ json: { widget: {} } }));
  await openCurrencyScene(page, 'cur-cap', () => [
    currencyWidget(six.map((code) => ({ ...eurRow, code }))),
  ]);
  await page.getByRole('button', { name: /currency menu/i }).click();
  await page.getByRole('button', { name: 'Settings' }).click();

  const dialog = page.getByRole('dialog', { name: /widget settings/i });
  await expect(dialog.getByLabel(/^GBP/)).toBeDisabled();
  await expect(dialog.getByLabel(/^NZD/)).toBeDisabled();
  await expect(dialog.getByText(/up to six currencies/i)).toBeVisible();
  await expect(dialog.getByRole('button', { name: /add a second currency widget/i })).toBeVisible();
});

for (const [name, size] of [
  ['mobile', { width: 360, height: 740 }],
  ['desktop', { width: 1280, height: 800 }],
] as const) {
  for (const [state, over] of [
    ['ready', {}],
    ['stale', { state: 'stale', cause: 'source_unreachable' }],
    ['error', { state: 'error', cause: 'rate_unavailable', figures: undefined }],
  ] as const) {
    test(`axe: currency ${state} at ${name} width`, async ({ page }) => {
      await openCurrencyScene(
        page,
        `cur-axe-${state}-${name}`,
        () => [currencyWidget([eurRow], over)],
        size,
      );
      await expect(page.getByTestId('widget-frame')).toHaveAttribute('data-state', state);
      await axeCheck(page);
    });
  }
}
