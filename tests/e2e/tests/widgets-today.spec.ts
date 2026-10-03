import { execSync } from 'node:child_process';
import { expect, test, type Page, type Route } from '@playwright/test';
import { signUpAndVerify } from '../fixtures/index.js';

// Not a real phrase, see tests/e2e/fixtures/index.ts's signUpAndVerify comment.
const PASSWORD = 'xk-e2e-Tr0ub4-fixture-2026';

const uniqueEmail = (tag: string) =>
  `e2e-${tag}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`;

/**
 * T063 (ci, slice E): the widget strip on the Today view. The widgets API is route-mocked with a
 * small stateful list (GET /widgets, PUT /widgets/order) so the strip is deterministic and
 * independent of the widgets.* flags; the real routes are covered by apps/api tests. Not run in
 * the session that wrote it (compose stack down). panels.today is on by default in ci and turned
 * off per user with the flags CLI, as connections.spec.ts does.
 */

const TYPES = {
  types: [
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

const pace = (id: string, position: number, spentMinor: number) => ({
  id,
  kind: 'spend_pace',
  position,
  settings: {},
  state: 'ready',
  asOf: new Date().toISOString(),
  figures: {
    spentMinor,
    budgetMinor: null,
    pct: null,
    daysLeft: 20,
    dailyToBudgetMinor: null,
    overBudget: false,
  },
});

/** Mocks the widgets API with an in-memory list; PUT /widgets/order reorders it. */
async function mockWidgets(page: Page): Promise<void> {
  let widgets = [pace('w1', 0, 1200), pace('w2', 1, 3400)];
  const body = () => ({ widgets, limit: 8, temperatureUnit: 'C' });
  await page.route('**/widgets/types', (route) => route.fulfill({ json: TYPES }));
  await page.route('**/widgets/order', async (route: Route) => {
    const { ids } = route.request().postDataJSON() as { ids: string[] };
    widgets = ids.map((id, position) => ({ ...widgets.find((w) => w.id === id)!, position }));
    await route.fulfill({ json: body() });
  });
  await page.route(/\/widgets$/, (route) =>
    route.request().method() === 'GET' ? route.fulfill({ json: body() }) : route.fallback(),
  );
}

/** The figure text of each widget in strip order. */
const order = (page: Page) => page.getByTestId('widget-strip').locator('article').allInnerTexts();

test('with panels.today on, /today and / show the same strip, and a reorder on / survives to /today', async ({
  page,
}) => {
  await mockWidgets(page);
  await signUpAndVerify(page, uniqueEmail('widgets-today'), PASSWORD);

  await page.goto('/today');
  const strip = page.getByTestId('widget-strip');
  await expect(strip.locator('article')).toHaveCount(2);
  const todayOrder = await order(page);
  expect(todayOrder[0]).toContain('12.00');
  expect(todayOrder[1]).toContain('34.00');

  // Strip sits after the calendar and inbox panels.
  const panels = page.locator('.panels');
  const panelsBox = (await panels.boundingBox())!;
  const stripBox = (await strip.boundingBox())!;
  expect(stripBox.y).toBeGreaterThanOrEqual(panelsBox.y + panelsBox.height - 1);

  await page.goto('/');
  await expect(strip.locator('article')).toHaveCount(2);
  expect(await order(page)).toEqual(todayOrder);

  // Reorder on / (move the first widget down), then reload /today.
  await strip
    .getByRole('button', { name: /spend pace menu/i })
    .first()
    .click();
  await strip.getByRole('button', { name: 'Move down' }).first().click();
  await expect(strip.locator('article').first()).toContainText('34.00');

  await page.goto('/today');
  await page.reload();
  await expect(strip.locator('article')).toHaveCount(2);
  const reordered = await order(page);
  expect(reordered[0]).toContain('34.00');
  expect(reordered[1]).toContain('12.00');
});

test('a failing /panels/today leaves the strip rendering figures while the panels show their own error', async ({
  page,
}) => {
  await mockWidgets(page);
  await page.route('**/panels/today', (route) =>
    route.request().method() === 'GET'
      ? route.fulfill({ status: 500, json: { error: { code: 'server_error' } } })
      : route.fallback(),
  );
  await signUpAndVerify(page, uniqueEmail('widgets-today-500'), PASSWORD);

  await page.goto('/today');
  const strip = page.getByTestId('widget-strip');
  await expect(strip.locator('article')).toHaveCount(2);
  await expect(strip).toContainText('12.00');
  // The panels carry their own error state (not the strip's); the strip shows no error copy.
  await expect(page.locator('.panels').getByRole('alert').first()).toBeVisible();
  await expect(strip.getByRole('alert')).toHaveCount(0);
});

test('with panels.today off, /today redirects to / and the strip on / keeps its widgets and order', async ({
  page,
}) => {
  const email = uniqueEmail('widgets-today-off');
  await mockWidgets(page);
  await signUpAndVerify(page, email, PASSWORD);
  execSync(`pnpm --filter @desk/db flags set panels.today --user "${email}" off`, {
    env: {
      ...process.env,
      DATABASE_URL: process.env['DATABASE_URL'] ?? 'postgres://desk:desk@localhost:5432/desk',
    },
  });

  await page.goto('/today');
  await expect(page).toHaveURL('/');
  const strip = page.getByTestId('widget-strip');
  await expect(strip.locator('article')).toHaveCount(2);
  const o = await order(page);
  expect(o[0]).toContain('12.00');
  expect(o[1]).toContain('34.00');
});
