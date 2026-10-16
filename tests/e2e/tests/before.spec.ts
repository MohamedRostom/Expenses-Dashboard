// One-off for spec 004 T027, run by hand against the compose stack (never in CI: @manual is
// excluded from ci/pixel-7/iphone-14 and only the `manual` project runs it):
//   pnpm --filter @desk/e2e exec playwright test before.spec.ts --project manual
// Captures "before" screenshots of the shipped screens (month view, add-expense sheet, settings)
// at 360x800 and 1280x800, light and dark. Output is committed under docs/design/before/.
import { fileURLToPath } from 'node:url';
import { test, type Page } from '@playwright/test';
import { signUpAndVerify } from '../fixtures/index.js';

const themes = ['light', 'dark'] as const;
const viewports = [
  { name: 'mobile', width: 360, height: 800 },
  { name: 'desktop', width: 1280, height: 800 },
] as const;

const shot = (page: Page, screen: string, theme: string, vp: string) =>
  page.screenshot({
    path: fileURLToPath(
      new URL(`../../../docs/design/before/${screen}-${theme}-${vp}.png`, import.meta.url),
    ),
    fullPage: true,
  });

async function openAddSheet(page: Page) {
  // The month view keeps the dialog's own submit ("Add expense") in the DOM; the header one is first.
  await page
    .getByRole('button', { name: /add expense/i })
    .first()
    .click();
  await page.getByLabel(/description/i).waitFor();
}

test('@manual capture before screenshots', async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  await signUpAndVerify(page, `e2e-before-${Date.now()}@example.test`);

  for (const [note, amount] of [
    ['Weekly shop', '54.20'],
    ['Train ticket', '18.50'],
    ['Lunch', '9.80'],
  ] as const) {
    await openAddSheet(page);
    await page.getByLabel(/description/i).fill(note);
    await page.getByLabel(/^amount$/i).fill(amount);
    await page
      .getByRole('dialog')
      .getByRole('button', { name: /^add expense$/i })
      .click();
    await page.getByText(note).waitFor();
  }

  for (const theme of themes) {
    await page.emulateMedia({ colorScheme: theme });
    for (const vp of viewports) {
      await page.setViewportSize(vp);
      await page.goto('/');
      await page.getByText('Weekly shop').waitFor();
      await shot(page, 'month-view', theme, vp.name);

      await openAddSheet(page);
      await shot(page, 'add-expense', theme, vp.name);

      await page.goto('/settings');
      await page.waitForLoadState('networkidle');
      await shot(page, 'settings', theme, vp.name);
    }
  }
});
