/// <reference lib="dom" />
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { csrfHeaders, signUpAndVerify } from '../fixtures/index.js';

// T050 (spec 004 US4): renders the real month view and add-expense sheet at 360 wide, in light and
// dark, into apps/landing/public/screenshots/ with a manifest.json that landing.spec.ts checks.
// Not a test of the app: it only runs through the `screenshots` project (update-snapshots.yml,
// docs/runbooks/visual-snapshots.md), against the compose stack, never in `ci`. The committed
// PNGs and manifest come from that run's artifact.
const OUT = fileURLToPath(new URL('../../../apps/landing/public/screenshots/', import.meta.url));
const PASSWORD = 'xk-e2e-Tr0ub4-fixture-2026';
const GENERATED_BY = 'screenshots.spec.ts';

type Shot = { src: string; screen: 'month' | 'add'; theme: 'light' | 'dark' };
const written: Shot[] = [];

test.describe.configure({ mode: 'serial' });

test('@screenshots render the month view and the add-expense sheet', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await signUpAndVerify(page, `screenshots-${Date.now()}@example.com`, PASSWORD);

  // Seed through HTTP in the user's own default currency, so every amount counts in the tiles.
  const headers = await csrfHeaders(page);
  const me = (await (await page.request.get('/me')).json()) as {
    user: { defaultCurrency: string };
  };
  const currency = me.user.defaultCurrency;
  const { categories } = (await (await page.request.get('/categories')).json()) as {
    categories: { id: string; name: string }[];
  };
  const wanted = ['Rent', 'Groceries', 'Eating out', 'Transport'];
  const picked = wanted.map((n) => categories.find((c) => c.name === n)).filter((c) => !!c);
  const use = picked.length === wanted.length ? picked : categories.slice(0, 4);
  const budgets = [90_000, 30_000, 12_000, 9_000];
  for (const [i, c] of use.entries()) {
    const res = await page.request.patch(`/categories/${c!.id}`, {
      headers,
      data: { budgetMinor: budgets[i] },
    });
    expect(res.ok()).toBe(true);
  }
  const month = new Date().toISOString().slice(0, 7);
  const rows: [string, number, number, string][] = [
    ['Rent', 90_000, 0, '01'],
    ['Weekly shop', 6_480, 1, '03'],
    ['Lunch', 1_150, 2, '04'],
    ['Weekly shop', 7_215, 1, '10'],
    ['Train pass', 4_800, 3, '02'],
    ['Dinner out', 5_460, 2, '08'],
  ];
  for (const [description, minor, cat, day] of rows) {
    const res = await page.request.post('/expenses', {
      headers,
      data: {
        description,
        amount: { minor, currency },
        date: `${month}-${day}`,
        categoryId: use[cat]!.id,
        paidWith: 'card',
        kind: description === 'Rent' ? 'fixed' : 'variable',
      },
    });
    expect(res.ok()).toBe(true);
  }

  mkdirSync(OUT, { recursive: true });
  for (const theme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: theme });
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByText('Weekly shop').first()).toBeVisible();
    await page.screenshot({ path: `${OUT}month-${theme}.png`, animations: 'disabled' });
    written.push({ src: `/screenshots/month-${theme}.png`, screen: 'month', theme });

    await page.getByRole('button', { name: /add expense/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.screenshot({ path: `${OUT}add-${theme}.png`, animations: 'disabled' });
    written.push({ src: `/screenshots/add-${theme}.png`, screen: 'add', theme });
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeHidden();
  }

  writeFileSync(
    `${OUT}manifest.json`,
    JSON.stringify(
      { files: written.map((s) => ({ ...s, width: 360, height: 800, generatedBy: GENERATED_BY })) },
      null,
      2,
    ) + '\n',
  );
});
