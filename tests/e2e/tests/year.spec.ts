import { expect, test, type Page } from '@playwright/test';
import { axeCheck, signUpAndVerify } from '../fixtures/index.js';

// Not a real phrase — see tests/e2e/fixtures/index.ts's signUpAndVerify comment.
const PASSWORD = 'xk-e2e-Tr0ub4-fixture-2026';

function uniqueEmail(tag: string): string {
  return `e2e-${tag}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`;
}

// T100 / T010: year view and category drill-down. Functional checks run in the host `ci` project;
// the @visual twins render in the pinned Playwright image (FR-018, docs/runbooks/visual-snapshots.md),
// where the config-level maxDiffPixelRatio applies (it overrides spec 001 T100's per-call
// maxDiffPixels). Screenshots are viewport-sized; no psql() because the container has no Docker.
async function setDark(page: Page): Promise<void> {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.evaluate(() => {
    const doc = (
      globalThis as unknown as {
        document: { documentElement: { setAttribute(n: string, v: string): void } };
      }
    ).document;
    doc.documentElement.setAttribute('data-theme', 'dark');
  });
}

async function addExpense(page: Page, description: string, amount: string, category?: string) {
  await page.getByRole('button', { name: /add expense/i }).click();
  await page.getByLabel(/description/i).fill(description);
  await page.getByLabel(/^amount$/i).fill(amount);
  if (category) await page.getByLabel(/category/i).selectOption({ label: category });
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /^add expense$/i })
    .click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
}

async function openYear(page: Page, tag: string): Promise<void> {
  await signUpAndVerify(page, uniqueEmail(tag), PASSWORD);
  await expect(page).toHaveURL('/');
  await addExpense(page, 'Groceries run', '42');
  await expect(page.getByText('Groceries run')).toBeVisible();
  await page.goto('/year');
  await expect(page.locator('.desk-year-view-total')).toContainText('42');
}

async function openCategory(page: Page, tag: string): Promise<void> {
  await signUpAndVerify(page, uniqueEmail(tag), PASSWORD);
  await expect(page).toHaveURL('/');
  // CategoryView.vue shows an EmptyState instead of the table when every month has zero spend
  // (correct behaviour), so the table needs a Groceries expense first.
  await addExpense(page, 'Weekly shop', '25', 'Groceries');
  // The category id is not exposed in the list UI yet, so look it up via the API the page uses.
  const res = await page.request.get('/categories');
  const { categories } = (await res.json()) as { categories: { id: string; name: string }[] };
  const groceries = categories.find((c) => c.name === 'Groceries');
  expect(groceries).toBeDefined();
  await page.goto(`/settings/categories/${groceries!.id}`);
  await expect(page.getByRole('heading', { name: /category history/i })).toBeVisible();
  await expect(page.getByRole('table')).toBeVisible();
}

test('year view shows month bars and a working table fallback', async ({ page }) => {
  await openYear(page, 'year');
  await axeCheck(page);
  // Accessible table fallback (CLAUDE.md: "table view always available").
  await expect(page.getByRole('table', { name: /monthly totals/i })).toBeVisible();
});

test('year view @visual, light and dark', async ({ page }) => {
  await openYear(page, 'year-visual');
  await expect(page).toHaveScreenshot('year-view-light.png');
  await setDark(page);
  await expect(page).toHaveScreenshot('year-view-dark.png');
});

test('clicking a month bar drills into that month', async ({ page }) => {
  const email = uniqueEmail('year-drill');
  await signUpAndVerify(page, email, PASSWORD);
  await expect(page).toHaveURL('/');

  await page.getByRole('button', { name: /add expense/i }).click();
  await page.getByLabel(/description/i).fill('Rent payment');
  await page.getByLabel(/^amount$/i).fill('900');
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /^add expense$/i })
    .click();
  await expect(page.getByText('Rent payment')).toBeVisible();

  await page.goto('/year');
  const currentMonthLabel = new Date().toLocaleString('en-US', { month: 'short' });
  await page.getByRole('button', { name: new RegExp(currentMonthLabel) }).click();
  await expect(page).toHaveURL(/\/(\?month=.*)?$/);
});

test('category drill-down view lists spend by month', async ({ page }) => {
  await openCategory(page, 'category-drill');
  await axeCheck(page);
});

test('category drill-down view @visual, light and dark', async ({ page }) => {
  await openCategory(page, 'category-visual');
  await expect(page).toHaveScreenshot('category-view-light.png');
  await setDark(page);
  await expect(page).toHaveScreenshot('category-view-dark.png');
});
