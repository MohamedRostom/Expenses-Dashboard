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
