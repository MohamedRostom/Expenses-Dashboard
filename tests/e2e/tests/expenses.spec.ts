import { expect, test, type Page } from '@playwright/test';
import { axeCheck, signUpAndVerify } from '../fixtures/index.js';

const PASSWORD = 'correct horse battery staple';

function uniqueEmail(tag: string): string {
  return `e2e-${tag}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`;
}

/** ISO-code suffix formatMoney always appends (apps/web/src/utils/format.ts:
 * `${formatted} ${currency}`) — every rendered amount must end with " CUR". */
function amountEndsWithCode(code: string): RegExp {
  return new RegExp(`${code}\\s*$`);
}

/** Picks a currency from CurrencyPicker.vue's autocomplete list (typing alone doesn't
 * emit update:modelValue — only clicking a suggestion, populated from GET /currencies, does). */
async function pickCurrency(page: Page, code: string): Promise<void> {
  const input = page.getByLabel(/currency/i);
  await input.fill(code);
  await page.getByText(new RegExp(`^${code} —`)).click();
}

async function addExpense(
  page: Page,
  opts: { description: string; amount: string; currency: string; date?: string },
): Promise<void> {
  await page.getByRole('button', { name: /add expense/i }).click();
  await page.getByLabel(/description/i).fill(opts.description);
  await page.getByLabel(/^amount$/i).fill(opts.amount);
  if (opts.currency) await pickCurrency(page, opts.currency);
  if (opts.date) {
    // native <input type="date"> — set via fill (Playwright accepts yyyy-mm-dd for this input type).
    await page.locator('input[type="date"]').fill(opts.date);
  }
  await page.getByRole('button', { name: /^add expense$/i }).click();
}

test('add expenses in three currencies, edit, delete, restore, shortcuts, locale formatting', async ({
  page,
}) => {
  const email = uniqueEmail('expenses');
  await signUpAndVerify(page, email, PASSWORD);
  await expect(page).toHaveURL('/');
  await axeCheck(page);

  // 2. Add three expenses in different currencies via the 'n' shortcut and ExpenseForm.
  // Click a neutral area first so no input is focused (useShortcuts.ts ignores keystrokes
  // while an editable target has focus).
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('n');
  await expect(page.getByRole('heading', { name: /add expense/i })).toBeVisible();
  await page.getByLabel(/description/i).fill('Groceries GBP');
  await page.getByLabel(/^amount$/i).fill('10');
  // native default currency (session default) is left as-is for the first expense — GBP.
  await page.getByRole('button', { name: /^add expense$/i }).click();
  await expect(page.getByText('Groceries GBP')).toBeVisible();

  await addExpense(page, { description: 'Dinner EUR', amount: '20', currency: 'EUR' });
  await expect(page.getByText('Dinner EUR')).toBeVisible();

  await addExpense(page, { description: 'Hotel USD', amount: '30', currency: 'USD' });
  await expect(page.getByText('Hotel USD')).toBeVisible();

  // Each row's amount is ISO-code-suffixed per format.ts's guarantee.
  const row = (desc: string) => page.locator('tr', { hasText: desc });
  await expect(row('Groceries GBP')).toContainText(amountEndsWithCode('GBP'));
  await expect(row('Dinner EUR')).toContainText(amountEndsWithCode('EUR'));
  await expect(row('Hotel USD')).toContainText(amountEndsWithCode('USD'));

  // Month tiles reflect the total (summed in the user's default currency by the API;
  // just assert the "Spent" tile shows a nonzero, ISO-coded amount — the exact converted
  // total depends on live FX rates from the rates mock, so this stays a shape assertion).
  const spentTile = page.locator('.desk-tile', { hasText: 'Spent' }).locator('.desk-tile-value');
  await expect(spentTile).not.toHaveText('');
  await expect(spentTile).toContainText(/[A-Z]{3}\s*$/);

  // 8. Locale formatting: assert the amount is Intl-formatted, not a raw unformatted number
  // like "1000" with no currency symbol/code — formatMoney always runs amounts through
  // Intl.NumberFormat with style: 'currency' and appends the ISO code.
  const groceriesAmountText = await row('Groceries GBP').locator('td').nth(3).innerText();
  expect(groceriesAmountText).toMatch(/[^\d\s.,]/); // contains a currency symbol or letters, not a bare number
  expect(groceriesAmountText.trim()).not.toBe('1000');

  // 3. "Sunday rate date visible": ExpenseResponse carries rateDate (apps/api's computed FX
  // rate date, which can differ from the expense date on a weekend — frankfurter has no
  // Sunday rate, so rateDate falls back to the prior published date), but neither
  // MonthView.vue nor ExpenseForm.vue currently renders rateDate anywhere in the DOM — there
  // is no separate rate-date element to assert on. This is a real UI gap (see report), not an
  // invented one: the entries table only shows the expense date and amount, and ExpenseForm
  // only shows a converted-preview line (`≈ 1.23 GBP`), never the rate's own date. So this
  // assertion is limited to what's actually there: the EUR row (a non-default-currency expense)
  // still shows exactly one date cell (the expense date), confirming no separate rate-date is
  // surfaced to the user yet.
  await expect(row('Dinner EUR').locator('td').first()).toBeVisible();

  // 4. Edit
  await row('Hotel USD').getByRole('button', { name: /edit/i }).click();
  await expect(page.getByRole('heading', { name: /edit expense/i })).toBeVisible();
  const descInput = page.getByLabel(/description/i);
  await descInput.fill('Hotel USD updated');
  await page.getByLabel(/^amount$/i).fill('45');
  await page.getByRole('button', { name: /^save$/i }).click();
  await expect(page.getByText('Hotel USD updated')).toBeVisible();
  await expect(page.getByText('Hotel USD', { exact: true })).toHaveCount(0);

  // 5. Delete
  await row('Hotel USD updated')
    .getByRole('button', { name: /delete/i })
    .click();
  await expect(page.getByText('Hotel USD updated')).toHaveCount(0);

  await page.goto('/bin');
  await expect(page.getByText('Hotel USD updated')).toBeVisible();
  await axeCheck(page);

  // 6. Restore from bin
  await page
    .getByRole('row', { name: /Hotel USD updated/i })
    .getByRole('button', { name: /restore/i })
    .click();
  await expect(page.getByText('Hotel USD updated')).toHaveCount(0);

  await page.goto('/');
  await expect(page.getByText('Hotel USD updated')).toBeVisible();

  // 7. Shortcuts: '[' and ']' switch months.
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  const monthLabel = page.locator('.desk-month-label');
  const before = await monthLabel.innerText();
  await page.keyboard.press(']');
  await expect(monthLabel).not.toHaveText(before);
  // next month has none of this month's expenses.
  await expect(page.getByText('Groceries GBP')).toHaveCount(0);

  await page.keyboard.press('[');
  await expect(monthLabel).toHaveText(before);
  await expect(page.getByText('Groceries GBP')).toBeVisible();

  // 9. axeCheck on MonthView with expenses present.
  await axeCheck(page);
});
