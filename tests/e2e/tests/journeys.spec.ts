import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { signUpAndVerify } from '../fixtures/index.js';
import { startJourney, type JourneyCounts } from '../fixtures/journey.js';

// Spec 004 FR-010 / research R13: the five core journeys, keyboard-only, counted through
// startJourney. Counts may only go down against fixtures/journey-baseline.json; JOURNEY_RECORD=1
// rewrites that file instead (Slice A0, before any token change).
const BASELINE_PATH = fileURLToPath(new URL('../fixtures/journey-baseline.json', import.meta.url));
const RECORD = process.env['JOURNEY_RECORD'] === '1';
const KEYS = [
  'sign-in',
  'add-expense-foreign',
  'change-month',
  'edit-budget',
  'open-settings',
] as const;
type Key = (typeof KEYS)[number];

// Not a real phrase — see tests/e2e/fixtures/index.ts's signUpAndVerify comment.
const PASSWORD = 'xk-e2e-Tr0ub4-fixture-2026';

// One worker, in order: record mode read-modify-writes a single shared file.
test.describe.configure({ mode: 'serial' });

// Fixed length (Date.now() is 13 digits) so typed-character counts are stable between runs.
const uniqueEmail = () => `j${Date.now()}@e2e.test`;

function readBaseline(): Partial<Record<Key, JourneyCounts>> {
  return existsSync(BASELINE_PATH) ? JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) : {};
}

function finish(key: Key, counts: JourneyCounts): void {
  expect(counts.taps, 'keyboard-only: no taps').toBe(0);
  if (RECORD) {
    const next = { ...readBaseline(), [key]: counts };
    const ordered = Object.fromEntries(KEYS.filter((k) => next[k]).map((k) => [k, next[k]]));
    writeFileSync(BASELINE_PATH, `${JSON.stringify(ordered, null, 2)}\n`);
    return;
  }
  const baseline = readBaseline()[key];
  if (!baseline) {
    throw new Error(
      `journey-baseline.json has no "${key}" entry — record it with JOURNEY_RECORD=1 (spec 004 R13)`,
    );
  }
  expect(counts.taps).toBeLessThanOrEqual(baseline.taps);
  expect(counts.keystrokes).toBeLessThanOrEqual(baseline.keystrokes);
  expect(counts.screens).toBeLessThanOrEqual(baseline.screens);
}

/** The focused element must show an outline or box-shadow (the :focus-visible ring). */
async function expectFocusRing(page: Page): Promise<void> {
  // A string, not a callback: this project's tsconfig has no DOM lib.
  const ring = await page.evaluate<string>(`(() => {
    const el = document.activeElement;
    if (!el || el === document.body) return 'nothing focused';
    // Chromium draws a native date input's focus as a highlighted segment inside it; the input
    // itself computes outline: none, so there is no outline/box-shadow to read.
    if (el instanceof HTMLInputElement && el.type === 'date') return 'ok';
    const s = getComputedStyle(el);
    const outline = s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0;
    return outline || s.boxShadow !== 'none'
      ? 'ok'
      : 'no ring on ' + el.outerHTML.slice(0, 120) + ' (outline ' + s.outlineStyle + ' ' + s.outlineWidth + ')';
  })()`);
  expect(ring, 'visible focus indicator').toBe('ok');
}

/** Presses Tab (or Shift+Tab) until `target` has focus, checking the ring at every stop. */
async function focusWith(p: Page, target: Locator, key = 'Tab'): Promise<void> {
  const focused = () => target.evaluate((el) => el.matches(':focus'));
  for (let i = 0; i < 60 && !(await focused()); i++) {
    await p.keyboard.press(key);
    await expectFocusRing(p);
  }
  expect(await focused(), `${key} reaches the target`).toBe(true);
}

/** Fresh signed-in home: goto resets the focus start point to the document. */
async function signedInHome(page: Page): Promise<void> {
  await signUpAndVerify(page, uniqueEmail(), PASSWORD);
  await page.goto('/');
  await page.waitForLoadState('networkidle');
}

test('sign-in', async ({ page }) => {
  const email = uniqueEmail();
  await signUpAndVerify(page, email, PASSWORD);
  await page.context().clearCookies();
  await page.goto('/login');

  const j = startJourney(page);
  const p = j.page;
  await focusWith(p, page.getByLabel('Email'));
  await p.keyboard.type(email);
  await focusWith(p, page.getByLabel('Password', { exact: true }));
  await p.keyboard.type(PASSWORD);
  await focusWith(p, page.getByRole('button', { name: 'Sign in' }));
  await p.keyboard.press('Enter');
  await expect(page).toHaveURL('/');
  finish('sign-in', j.counts());
});

test('add-expense-foreign', async ({ page }) => {
  await signedInHome(page);

  const j = startJourney(page);
  const p = j.page;
  await p.keyboard.press('n');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expectFocusRing(p);
  await p.keyboard.type('Hotel');
  await focusWith(p, dialog.getByLabel('Amount', { exact: true }));
  await p.keyboard.type('30');
  await focusWith(p, dialog.getByLabel('Currency'));
  await p.keyboard.type('EUR');
  // Tabbing away commits a typed valid code (CurrencyPicker onBlur).
  await focusWith(p, dialog.getByRole('button', { name: /^add expense$/i }));
  await p.keyboard.press('Enter');
  await expect(dialog).toBeHidden();
  await expect(page.locator('tr', { hasText: 'Hotel' })).toContainText('EUR');
  finish('add-expense-foreign', j.counts());
});

test('change-month', async ({ page }) => {
  await signedInHome(page);
  const label = page.locator('.desk-month-label');
  const before = await label.innerText();

  const j = startJourney(page);
  const p = j.page;
  await focusWith(p, page.getByRole('button', { name: 'Next month' }));
  await p.keyboard.press('Enter');
  await expect(label).not.toHaveText(before);
  finish('change-month', j.counts());
});

test('edit-budget', async ({ page }) => {
  await signedInHome(page);
  await page.goto('/settings/categories');
  const edit = page
    .locator('li', { hasText: 'Groceries' })
    .first()
    .getByRole('button', { name: /edit/i });
  await expect(edit).toBeVisible();

  const j = startJourney(page);
  const p = j.page;
  await focusWith(p, edit);
  await p.keyboard.press('Enter');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expectFocusRing(p);
  await focusWith(p, dialog.getByLabel(/monthly budget/i));
  await p.keyboard.type('10');
  await focusWith(p, dialog.getByRole('button', { name: /^save$/i }));
  await p.keyboard.press('Enter');
  await expect(dialog).toBeHidden();
  finish('edit-budget', j.counts());
});

test('open-settings', async ({ page }) => {
  await signedInHome(page);

  const j = startJourney(page);
  const p = j.page;
  await focusWith(p, page.getByRole('link', { name: 'Settings', exact: true }));
  await p.keyboard.press('Enter');
  await expect(page).toHaveURL('/settings');
  finish('open-settings', j.counts());
});
