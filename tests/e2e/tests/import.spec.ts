import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { axeCheck, signUpAndVerify } from '../fixtures/index.js';

// Not a real phrase — see tests/e2e/fixtures/index.ts's signUpAndVerify comment.
const PASSWORD = 'xk-e2e-Tr0ub4-fixture-2026';
const SAMPLE_CSV = fileURLToPath(new URL('../fixtures/sample-export.csv', import.meta.url));

function uniqueEmail(tag: string): string {
  return `e2e-${tag}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`;
}

test('import: map columns, preview, commit, re-import reports duplicates, undo', async ({
  page,
}) => {
  const email = uniqueEmail('import');
  await signUpAndVerify(page, email, PASSWORD);
  await expect(page).toHaveURL('/');

  await page.goto('/import');
  await axeCheck(page);

  // Step 1: upload the sample export (date,amount,currency,description,category — matches the
  // default column mapping the form starts with).
  await page.getByTestId('import-file-input').setInputFiles(SAMPLE_CSV);
  await page.getByRole('button', { name: /^next$/i }).click();

  // Step 2: mapping form already defaults to the sample's column names — just preview.
  await page.getByRole('button', { name: /^preview$/i }).click();

  // Step 3: preview table shows every row as ok (sample-export.csv has 5 clean rows).
  const table = page.getByTestId('import-preview-table');
  await expect(table).toBeVisible();
  await expect(table.locator('tbody tr')).toHaveCount(5);
  // ImportView.vue puts data-status on both the <tr> and its nested status badge <span> — scope
  // to rows only, or this matches 2 elements per row (10, not 5).
  await expect(table.locator('tbody tr[data-status="ok"]')).toHaveCount(5);
  await axeCheck(page);

  await page.getByRole('button', { name: /^commit import$/i }).click();

  // Step 4: summary shows 5 created, 0 duplicates, 0 errors.
  const summary = page.getByTestId('import-summary');
  await expect(summary).toContainText('Created 5');
  await expect(summary).toContainText('duplicates 0');
  await expect(summary).toContainText('errors 0');

  // The imported expenses now show up on the month view for their dates (September 2026).
  await page.goto('/');
  await expect(page.getByText('Coffee and pastry')).toBeVisible();

  // Re-importing the same file reports every row as a duplicate.
  await page.goto('/import');
  await page.getByTestId('import-file-input').setInputFiles(SAMPLE_CSV);
  await page.getByRole('button', { name: /^next$/i }).click();
  await page.getByRole('button', { name: /^preview$/i }).click();
  await expect(
    page.getByTestId('import-preview-table').locator('tbody tr[data-status="duplicate"]'),
  ).toHaveCount(5);

  // Undo the first import: its expenses are binned.
  await page.goto('/import');
  await page.getByTestId('import-file-input').setInputFiles(SAMPLE_CSV);
  await page.getByRole('button', { name: /^next$/i }).click();
  await page.getByRole('button', { name: /^preview$/i }).click();
  await page.getByRole('button', { name: /^commit import$/i }).click();
  await page.getByRole('button', { name: /^undo$/i }).click();
  await expect(page.getByText('Undone.')).toBeVisible();
});
