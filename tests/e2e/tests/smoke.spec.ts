import { expect, test } from '@playwright/test';

// T111 @local: post-deploy smoke, run on `desk-local` against the real staging URL (never
// blocks a PR — see playwright.config.ts's `local` project and CLAUDE.md testing rules).
// Uses the seeded e2e user (packages/db/src/seed.ts) rather than signing up, so it needs no
// Mailpit access on the deployed target.
const SEEDED_EMAIL = 'e2e@desk.test';
// Not a real phrase — see tests/e2e/fixtures/index.ts's signUpAndVerify comment.
const SEEDED_PASSWORD = process.env['E2E_SEEDED_PASSWORD'] ?? 'xk-e2e-Tr0ub4-fixture-2026';

test('post-deploy smoke: healthz, seeded login, add and delete one expense @local', async ({
  page,
  baseURL,
  request,
}) => {
  // MonthView.vue's onDelete uses a native window.confirm() — Playwright auto-dismisses (cancels)
  // native dialogs unless a handler accepts them, so without this Delete silently does nothing.
  page.on('dialog', (d) => d.accept());

  const healthRes = await request.get(`${baseURL}/healthz`);
  expect(healthRes.ok()).toBe(true);
  const health = await healthRes.json();
  expect(health.status).toBe('ok');
  expect(['ok', 'degraded']).toContain(health.db);

  await page.goto('/login');
  await page.getByLabel(/email/i).fill(SEEDED_EMAIL);
  await page.getByLabel(/password/i).fill(SEEDED_PASSWORD);
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).toHaveURL('/');

  const description = `Smoke test ${Date.now()}`;
  await page.getByRole('button', { name: /add expense/i }).click();
  await page.getByLabel(/description/i).fill(description);
  await page.getByLabel(/^amount$/i).fill('1.23');
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /^add expense$/i })
    .click();
  await expect(page.getByText(description)).toBeVisible();

  await page
    .getByRole('row', { name: new RegExp(description) })
    .getByRole('button', { name: /delete/i })
    .click();
  await expect(page.getByText(description)).toHaveCount(0);
});
