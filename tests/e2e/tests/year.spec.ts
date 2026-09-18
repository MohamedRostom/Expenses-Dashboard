import { expect, test } from '@playwright/test';
import { axeCheck, signUpAndVerify } from '../fixtures/index.js';

const PASSWORD = 'correct horse battery staple';

function uniqueEmail(tag: string): string {
  return `e2e-${tag}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`;
}

// T100: year view and category drill-down, with visual snapshots in both themes.
// NOTE: this is the first toHaveScreenshot() spec in the repo — its baseline images do not
// exist yet. The first run against a live browser creates them (standard Playwright behaviour,
// not a gap); this spec has been typechecked and listed (`playwright test --list`) but not run
// live here, so no baselines were generated in this session.
test('year view shows month bars and a working table fallback, light and dark', async ({
  page,
}) => {
  const email = uniqueEmail('year');
  await signUpAndVerify(page, email, PASSWORD);
  await expect(page).toHaveURL('/');

  await page.getByRole('button', { name: /add expense/i }).click();
  await page.getByLabel(/description/i).fill('Groceries run');
  await page.getByLabel(/^amount$/i).fill('42');
  await page.getByRole('button', { name: /^add expense$/i }).click();
  await expect(page.getByText('Groceries run')).toBeVisible();

  await page.goto('/year');
  await axeCheck(page);

  const yearTotal = page.locator('.desk-year-view-total');
  await expect(yearTotal).toContainText('42');

  // Accessible table fallback (CLAUDE.md: "table view always available").
  await expect(page.getByRole('table', { name: /monthly totals/i })).toBeVisible();

  await expect(page).toHaveScreenshot('year-view-light.png');

  await page.emulateMedia({ colorScheme: 'dark' });
  await page.evaluate(() => {
    const doc = (
      globalThis as unknown as {
        document: { documentElement: { setAttribute(n: string, v: string): void } };
      }
    ).document;
    doc.documentElement.setAttribute('data-theme', 'dark');
  });
  await expect(page).toHaveScreenshot('year-view-dark.png');
});

test('clicking a month bar drills into that month', async ({ page }) => {
  const email = uniqueEmail('year-drill');
  await signUpAndVerify(page, email, PASSWORD);
  await expect(page).toHaveURL('/');

  await page.getByRole('button', { name: /add expense/i }).click();
  await page.getByLabel(/description/i).fill('Rent payment');
  await page.getByLabel(/^amount$/i).fill('900');
  await page.getByRole('button', { name: /^add expense$/i }).click();
  await expect(page.getByText('Rent payment')).toBeVisible();

  await page.goto('/year');
  const currentMonthLabel = new Date().toLocaleString('en-US', { month: 'short' });
  await page.getByRole('button', { name: new RegExp(currentMonthLabel) }).click();
  await expect(page).toHaveURL(/\/(\?month=.*)?$/);
});

test('category drill-down view lists spend by month, light and dark', async ({ page }) => {
  const email = uniqueEmail('category-drill');
  await signUpAndVerify(page, email, PASSWORD);
  await expect(page).toHaveURL('/');

  await page.goto('/categories');
  await expect(page.getByText('Groceries')).toBeVisible();

  // Navigate directly using the category id exposed via the edit dialog isn't available in the
  // list UI yet, so this drives the route directly with a known seeded category name lookup via
  // the API the page itself uses — acceptable for this drill-down smoke test.
  const res = await page.request.get('/categories');
  const { categories } = (await res.json()) as { categories: { id: string; name: string }[] };
  const groceries = categories.find((c) => c.name === 'Groceries');
  expect(groceries).toBeDefined();

  await page.goto(`/categories/${groceries!.id}`);
  await axeCheck(page);
  await expect(page.getByRole('heading', { name: /category history/i })).toBeVisible();
  await expect(page.getByRole('table')).toBeVisible();

  await expect(page).toHaveScreenshot('category-view-light.png');

  await page.emulateMedia({ colorScheme: 'dark' });
  await page.evaluate(() => {
    const doc = (
      globalThis as unknown as {
        document: { documentElement: { setAttribute(n: string, v: string): void } };
      }
    ).document;
    doc.documentElement.setAttribute('data-theme', 'dark');
  });
  await expect(page).toHaveScreenshot('category-view-dark.png');
});
