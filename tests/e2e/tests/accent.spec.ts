import { execSync } from 'node:child_process';
import { expect, test, type Page } from '@playwright/test';
import { axeCheck, csrfHeaders, signUpAndVerify } from '../fixtures/index.js';

/**
 * T056 (spec 004 US5, FR-019): the accent picker in Settings, behind `appearance.accent`.
 *
 * The flag is switched on for the test user only (`pnpm flags set ... --user`), so nothing global
 * changes and nothing needs restoring. The @visual snapshot cannot call pnpm/docker (it runs in the
 * pinned image), so it answers GET /flags itself.
 */

const DB_URL = process.env['DATABASE_URL'] ?? 'postgres://desk:desk@localhost:5432/desk';
const PASSWORD = 'xk-e2e-Tr0ub4-fixture-2026';
const PRESETS = [
  { id: 'signal-green', name: 'Signal Green' },
  { id: 'concourse-blue', name: 'Concourse Blue' },
  { id: 'platform-teal', name: 'Platform Teal' },
  { id: 'violet', name: 'Violet' },
  { id: 'slate', name: 'Slate' },
  { id: 'plum', name: 'Plum' },
];

const uniqueEmail = (tag: string) => `accent-${tag}-${Date.now()}@example.com`;

function setUserFlag(email: string, state: 'on' | 'off'): void {
  execSync(`pnpm --filter @desk/db flags set "appearance.accent" --user "${email}" ${state}`, {
    env: { ...process.env, DATABASE_URL: DB_URL },
    stdio: 'pipe',
  });
}

async function signedInWithFlag(page: Page, tag: string, on = true): Promise<string> {
  const email = uniqueEmail(tag);
  await signUpAndVerify(page, email, PASSWORD);
  if (on) setUserFlag(email, 'on');
  await page.goto('/settings');
  await page.waitForLoadState('networkidle');
  return email;
}

const accentOf = (page: Page) => page.evaluate(() => document.documentElement.dataset['accent']);
const group = (page: Page) => page.getByRole('radiogroup', { name: 'Accent colour' });
const bg = (page: Page, name: string) =>
  page
    .getByRole('button', { name, exact: true })
    .evaluate((el) => getComputedStyle(el).backgroundColor);

test('with the flag off the accent group is absent and data-accent is not set', async ({
  page,
}) => {
  await signedInWithFlag(page, 'off', false);
  await expect(page.getByRole('heading', { name: 'Theme' })).toBeVisible();
  await expect(group(page)).toHaveCount(0);
  expect(await accentOf(page)).toBeUndefined();
});

test('the group lists every preset by name; choosing one recolours the primary button live', async ({
  page,
}) => {
  await signedInWithFlag(page, 'pick');
  await expect(group(page)).toBeVisible();
  for (const p of PRESETS)
    await expect(group(page).getByLabel(p.name, { exact: true })).toBeVisible();

  const before = await bg(page, 'Change email');
  await group(page).getByLabel('Concourse Blue', { exact: true }).check();
  await expect.poll(() => accentOf(page)).toBe('concourse-blue');
  expect(await bg(page, 'Change email')).not.toBe(before);

  // The month view (client-side navigation, no reload) wears the same accent.
  const settingsAccentBg = await bg(page, 'Change email');
  await page.getByRole('link', { name: 'Month', exact: true }).click();
  await expect(page).toHaveURL('/');
  await expect.poll(() => accentOf(page)).toBe('concourse-blue');
  expect(await bg(page, 'Add expense')).toBe(settingsAccentBg);
  // The choice is stored: it survives a reload.
  await page.reload();
  await expect.poll(() => accentOf(page)).toBe('concourse-blue');
});

test('choosing signal-green removes data-accent', async ({ page }) => {
  await signedInWithFlag(page, 'green');
  await group(page).getByLabel('Plum', { exact: true }).check();
  await expect.poll(() => accentOf(page)).toBe('plum');
  await group(page).getByLabel('Signal Green', { exact: true }).check();
  await expect.poll(() => accentOf(page)).toBeUndefined();
});

test('a second browser context signed in as the same user gets the accent on first load', async ({
  page,
  browser,
}) => {
  const email = await signedInWithFlag(page, 'second');
  await group(page).getByLabel('Violet', { exact: true }).check();
  await expect.poll(() => accentOf(page)).toBe('violet');

  const context2 = await browser.newContext();
  const page2 = await context2.newPage();
  await page2.goto('/login');
  await page2.getByLabel(/email/i).fill(email);
  await page2.getByLabel(/password/i).fill(PASSWORD);
  await page2.getByRole('button', { name: /sign in/i }).click();
  await expect(page2).toHaveURL('/');
  await expect.poll(() => accentOf(page2)).toBe('violet');
  await context2.close();
});

test('arrow keys move the selection', async ({ page }) => {
  await signedInWithFlag(page, 'keys');
  await group(page).getByLabel('Signal Green', { exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(group(page).getByLabel('Concourse Blue', { exact: true })).toBeChecked();
  await expect.poll(() => accentOf(page)).toBe('concourse-blue');
  await page.keyboard.press('ArrowRight');
  await expect(group(page).getByLabel('Platform Teal', { exact: true })).toBeChecked();
});

test('a failed save reverts the choice', async ({ page }) => {
  await signedInWithFlag(page, 'revert');
  await page.route('**/me', (route) =>
    route.request().method() === 'PATCH'
      ? route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: { code: 'internal', message: 'Could not save' } }),
        })
      : route.fallback(),
  );
  await group(page).getByLabel('Plum', { exact: true }).click();
  await expect(page.getByText('Could not save')).toBeVisible();
  await expect.poll(() => accentOf(page)).toBeUndefined();
  await expect(group(page).getByLabel('Signal Green', { exact: true })).toBeChecked();
});

test('axe is clean on / and /settings for every preset in light and dark', async ({ page }) => {
  test.setTimeout(240_000);
  await signedInWithFlag(page, 'axe');
  for (const preset of PRESETS) {
    const res = await page.request.patch('/me', {
      headers: await csrfHeaders(page),
      data: { accent: preset.id },
    });
    expect(res.ok()).toBe(true);
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      for (const path of ['/', '/settings']) {
        await page.goto(path);
        await page.waitForLoadState('networkidle');
        if (preset.id !== 'signal-green') expect(await accentOf(page)).toBe(preset.id);
        await axeCheck(page);
      }
    }
  }
});

// The @visual snapshot: no psql/docker, so the flag comes from a mocked GET /flags.
for (const vp of [360, 1280]) {
  for (const scheme of ['light', 'dark'] as const) {
    test(`@visual accent group ${scheme} ${vp}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.setViewportSize({ width: vp, height: 800 });
      await signUpAndVerify(
        page,
        `accent-visual-${vp}-${scheme}-${Date.now()}@example.com`,
        PASSWORD,
      );
      await page.route('**/flags', async (route) => {
        const res = await route.fetch();
        const body = (await res.json()) as { flags: Record<string, boolean> };
        await route.fulfill({
          response: res,
          json: { flags: { ...body.flags, 'appearance.accent': true } },
        });
      });
      await page.goto('/settings');
      await page.waitForLoadState('networkidle');
      const g = group(page);
      await g.scrollIntoViewIfNeeded();
      await expect(g).toHaveScreenshot(`accent-group-${scheme}-${vp}.png`);
    });
  }
}
