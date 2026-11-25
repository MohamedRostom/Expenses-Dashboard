import { execSync } from 'node:child_process';
import { expect, test, type Page } from '@playwright/test';
import { signUpAndVerify } from '../fixtures/index.js';

/**
 * ADR-0008 free colours (ci project): Settings > Appearance, behind `appearance.accent`.
 * The flag is on for each test user only, like accent.spec. Selectors: the three colour inputs
 * are found by their visible labels (Accent colour, Background colour, Selected menu item); each
 * has a button named "Reset <label lower-case>". The primary button is "Change email".
 */

const DB_URL = process.env['DATABASE_URL'] ?? 'postgres://desk:desk@localhost:5432/desk';
const PASSWORD = 'xk-e2e-Tr0ub4-fixture-2026';
const PICKED = '#e8c11a';
const TINT = '#2244aa';

async function signedIn(page: Page, tag: string, flag: 'on' | 'off' = 'on'): Promise<void> {
  const email = `free-colours-${tag}-${Date.now()}@example.com`;
  await signUpAndVerify(page, email, PASSWORD);
  execSync(`pnpm --filter @desk/db flags set "appearance.accent" --user "${email}" ${flag}`, {
    env: { ...process.env, DATABASE_URL: DB_URL },
    stdio: 'pipe',
  });
  await page.goto('/settings#sg-look');
  await page.waitForLoadState('networkidle');
}

const field = (page: Page, label: string) => page.getByLabel(label, { exact: true });
const saved = (page: Page) =>
  page.waitForResponse((r) => r.url().endsWith('/me') && r.request().method() === 'PATCH');
const html = (page: Page, prop: string) =>
  page.evaluate(
    (p) => document.documentElement.style.getPropertyValue(p).trim().toLowerCase(),
    prop,
  );
// Settings is tabbed, so "Change email" sits in a hidden panel here: includeHidden.
const primary = (page: Page) =>
  page.getByRole('button', { name: 'Change email', includeHidden: true }).evaluate((el) => {
    const s = getComputedStyle(el);
    return { bg: s.backgroundColor, fg: s.color };
  });

const channels = (rgb: string) => (rgb.match(/\d+(\.\d+)?/g) ?? []).slice(0, 3).map(Number);
const luminance = (rgb: string) => {
  const [r, g, b] = channels(rgb).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
};

test('picking an accent recolours the primary button, text stays readable; reset restores it', async ({
  page,
}) => {
  await signedIn(page, 'accent');
  const before = await primary(page);
  const done = saved(page);
  await field(page, 'Accent colour').fill(PICKED);
  await expect.poll(async () => (await primary(page)).bg).not.toBe(before.bg);
  await done;
  const after = await primary(page);
  expect(contrast(after.fg, after.bg)).toBeGreaterThanOrEqual(4.5);

  // Survives a reload (it is stored), then Reset brings the preset accent back.
  await page.reload();
  await expect.poll(async () => (await primary(page)).bg).toBe(after.bg);
  const reset = saved(page);
  await page.getByRole('button', { name: 'Reset accent colour' }).click();
  await reset;
  await expect.poll(async () => (await primary(page)).bg).toBe(before.bg);
});

test('picking a background colour sets --ground-tint on <html>; reset clears it', async ({
  page,
}) => {
  await signedIn(page, 'ground');
  expect(await html(page, '--ground-tint')).toBe('');
  const done = saved(page);
  await field(page, 'Background colour').fill(TINT);
  await expect.poll(() => html(page, '--ground-tint')).toBe(TINT);
  await done;

  const reset = saved(page);
  await page.getByRole('button', { name: 'Reset background colour' }).click();
  await reset;
  await expect.poll(() => html(page, '--ground-tint')).toBe('');
});

test('picking a menu colour sets --nav-colour to it and --nav-colour-fg to black or white', async ({
  page,
}) => {
  await signedIn(page, 'nav');
  expect(await html(page, '--nav-colour')).toBe('');
  const done = saved(page);
  await field(page, 'Selected menu item').fill(PICKED);
  await expect.poll(() => html(page, '--nav-colour')).toBe(PICKED);
  await done;
  expect(await html(page, '--nav-colour-fg')).toMatch(
    /^(#000(000)?|#fff(fff)?|rgb\(0,\s*0,\s*0\)|rgb\(255,\s*255,\s*255\))$/,
  );
});

// The flag is per user here (like accent.spec), so the global flag is never touched and stays off.
test('with appearance.accent off there are no free-colour controls and no --nav-colour', async ({
  page,
}) => {
  await signedIn(page, 'flag-off', 'off');
  await expect(page.getByRole('tablist', { name: 'Settings sections' })).toBeVisible();
  for (const label of ['Accent colour', 'Background colour', 'Selected menu item']) {
    await expect(field(page, label)).toHaveCount(0);
  }
  expect(await html(page, '--nav-colour')).toBe('');
  expect(await html(page, '--nav-colour-fg')).toBe('');
});

test("user B does not see user A's colours", async ({ browser }) => {
  const a = await browser.newPage();
  await signedIn(a, 'user-a');
  const done = saved(a);
  await field(a, 'Background colour').fill(TINT);
  await field(a, 'Selected menu item').fill(PICKED);
  await done;
  await expect.poll(() => html(a, '--ground-tint')).toBe(TINT);

  const b = await (await browser.newContext()).newPage();
  await signedIn(b, 'user-b');
  expect(await html(b, '--ground-tint')).toBe('');
  expect(await html(b, '--nav-colour')).toBe('');
  await a.context().close();
  await b.context().close();
});
