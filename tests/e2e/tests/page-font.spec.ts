import { execSync } from 'node:child_process';
import { expect, test, type Page } from '@playwright/test';
import { signUpAndVerify } from '../fixtures/index.js';

/**
 * Page font (ci project): Settings > Appearance > Page font, behind `appearance.accent` (on per
 * test user, like free-colours.spec). The choice replaces the word and the figure font everywhere,
 * widgets included, since both read --font-sans / --font-mono.
 */

const DB_URL = process.env['DATABASE_URL'] ?? 'postgres://desk:desk@localhost:5432/desk';
const PASSWORD = 'xk-e2e-Tr0ub4-fixture-2026';

async function signedIn(page: Page, tag: string): Promise<void> {
  const email = `page-font-${tag}-${Date.now()}@example.com`;
  await signUpAndVerify(page, email, PASSWORD);
  execSync(`pnpm --filter @desk/db flags set "appearance.accent" --user "${email}" on`, {
    env: { ...process.env, DATABASE_URL: DB_URL },
    stdio: 'pipe',
  });
  await page.goto('/settings#sg-look');
  await page.waitForLoadState('networkidle');
}

const fonts = (page: Page) =>
  page.evaluate(() => ({
    body: getComputedStyle(document.body).fontFamily,
    figures: getComputedStyle(document.documentElement).getPropertyValue('--font-mono').trim(),
  }));

test('picking Serif sets words and figures in a serif font, kept after a reload; System restores', async ({
  page,
}) => {
  await signedIn(page, 'serif');
  const before = await fonts(page);
  expect(before.body).not.toMatch(/Georgia/);

  const group = page.getByRole('radiogroup', { name: 'Page font' });
  const saved = page.waitForResponse(
    (r) => r.url().endsWith('/me') && r.request().method() === 'PATCH',
  );
  await group.getByLabel('Serif').check();
  await expect.poll(async () => (await fonts(page)).body).toMatch(/Georgia/);
  await saved;
  expect((await fonts(page)).figures).toMatch(/Georgia/);

  await page.reload();
  await expect.poll(async () => (await fonts(page)).body).toMatch(/Georgia/);

  await page.getByRole('radiogroup', { name: 'Page font' }).getByLabel('System').check();
  await expect.poll(async () => (await fonts(page)).body).toBe(before.body);
  expect((await fonts(page)).figures).toBe(before.figures);
});
