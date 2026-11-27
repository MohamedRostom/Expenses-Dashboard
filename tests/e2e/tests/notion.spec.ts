import { expect, test } from '@playwright/test';
import { axeCheck, signUpAndVerify } from '../fixtures/index.js';

/**
 * T076: @local — needs a REAL Notion workspace and a REAL OAuth round-trip, so it runs only on
 * the self-hosted `desk-local` runner (CLAUDE.md's e2e-local rules: workflow_dispatch + nightly,
 * never blocks a PR, secrets from the approval-gated `local-secrets` environment). It is
 * type-checked and structurally complete but UNVERIFIED against a real workspace in this
 * sandbox — there are no live Notion credentials available here. NOTION_TEST_PARENT_PAGE_URL
 * must point at a Notion page the connected integration can create a database under.
 *
 * Three trials per direction (to_notion, from_notion, both) and a five-minute wait give the
 * 5-minute notion.sync cron (research.md R8) a realistic window to have run at least once
 * without the test itself forcing a sync — "sync now" is used to also prove the manual path.
 */
// Not a real phrase — see tests/e2e/fixtures/index.ts's signUpAndVerify comment.
const PASSWORD = 'xk-e2e-Tr0ub4-fixture-2026';
const FIVE_MINUTES_MS = 5 * 60 * 1000;

function uniqueEmail(tag: string): string {
  return `e2e-${tag}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`;
}

test.describe('Notion two-way sync @local', () => {
  // NOTION_TEST_PARENT_PAGE_URL only gates whether this suite runs at all — this flow connects
  // to an existing "💷 Expenses" database (CLAUDE.md's reference schema) rather than creating a
  // new one under that parent page, so the URL itself isn't otherwise read here. Kept as the
  // skip condition anyway: its presence is what signals a real, reachable Notion workspace is
  // configured for desk-local.
  test.skip(
    !process.env['NOTION_TEST_PARENT_PAGE_URL'],
    'requires a real Notion workspace — set NOTION_TEST_PARENT_PAGE_URL (desk-local runner only)',
  );

  for (const direction of ['to_notion', 'from_notion', 'both'] as const) {
    test(`syncs ${direction} across three trials and versions become visible @local`, async ({
      page,
    }) => {
      // Playwright's default test timeout is 30s; this test deliberately waits a full 5 minutes
      // for the notion.sync cron below, so it needs its own timeout well past that.
      test.setTimeout(8 * 60 * 1000);
      const email = uniqueEmail(`notion-${direction}`);
      await signUpAndVerify(page, email, PASSWORD);

      await page.goto('/settings/connectors');
      await page.getByRole('button', { name: /connect notion/i }).click();

      // Real Notion consent screen — a human/CI credential vault fills this on desk-local.
      await page.waitForURL(/notion\.so\/(login|v1\/oauth)/, { timeout: 30_000 });
      // The actual sign-in/consent interaction is environment-specific and intentionally left
      // to the desk-local runner's stored Notion session (cookie reuse), not scripted here.
      await page.waitForURL(/\/settings\/connectors/, { timeout: 60_000 });

      await page.getByLabel(/notion database/i).selectOption({ label: '💷 Expenses' });
      await page.getByLabel(/sync direction/i).selectOption(direction);
      await page.getByRole('button', { name: /save table/i }).click();

      for (let trial = 1; trial <= 3; trial += 1) {
        if (direction !== 'from_notion') {
          await page.goto('/');
          await page.getByRole('button', { name: /add expense/i }).click();
          await page.getByLabel(/description/i).fill(`Notion sync trial ${trial}`);
          await page.getByLabel(/^amount$/i).fill('12.34');
          await page.locator('input[type="date"]').fill('2026-09-10');
          await page
            .getByRole('dialog')
            .getByRole('button', { name: /^add expense$/i })
            .click();
        }

        await page.goto('/settings/connectors');
        await page.getByRole('button', { name: /sync now/i }).click();
        await expect(page.getByText(/synced \(/i)).toBeVisible({ timeout: 30_000 });
      }

      // Give the 5-minute cron a realistic window rather than only exercising sync-now.
      await page.waitForTimeout(FIVE_MINUTES_MS);
      await page.goto('/settings/connectors');
      await page.getByRole('button', { name: /sync now/i }).click();
      await expect(page.getByText(/synced \(/i)).toBeVisible({ timeout: 30_000 });

      await page.goto('/');
      await page.getByText(/notion sync trial 1/i).click();
      await page.getByText(/notion sync history/i).click();
      await expect(page.getByText(/^notion$|^app$/i).first()).toBeVisible();
    });
  }
});

/**
 * Spec 005 T020, T029 (ci): the OAuth round trip against the Notion mock (consent page at
 * NOTION_AUTHORIZE_BROWSER_BASE, mode switches at POST /notion/__control).
 */
const MOCKS_URL = process.env['MOCKS_URL'] ?? 'http://localhost:4000';

test.describe('Notion connect outcomes', () => {
  // The Notion mock's switches are one global state, so a parallel test's reset would undo
  // another's `denied` or `sharedContent: false`.
  test.describe.configure({ mode: 'serial' });
  test.afterEach(async ({ request }) => {
    await request.post(`${MOCKS_URL}/notion/__control`, { data: { reset: true } });
  });

  test('connect then disconnect', async ({ page, request }) => {
    await request.post(`${MOCKS_URL}/notion/__control`, { data: { reset: true } });
    await signUpAndVerify(page, uniqueEmail('notion-connect'), PASSWORD);
    await page.goto('/settings/connectors');
    await page.getByRole('button', { name: /^connect notion$/i }).click();

    await expect(page.getByText('Connected to Fake Workspace.')).toBeVisible();
    await expect(page).not.toHaveURL(/notion=/);

    await page.getByRole('button', { name: /^disconnect$/i }).click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: /^disconnect$/i })
      .click();
    await expect(page.getByRole('button', { name: /^connect notion$/i })).toBeEnabled();
    await expect(page.getByText('Notion is not connected.')).toBeAttached();
  });

  test('denied', async ({ page, request }) => {
    await request.post(`${MOCKS_URL}/notion/__control`, { data: { authorize: 'denied' } });
    await signUpAndVerify(page, uniqueEmail('notion-denied'), PASSWORD);
    await page.goto('/settings/connectors');
    await page.getByRole('button', { name: /^connect notion$/i }).click();

    await expect(page.getByText("Notion wasn't connected.")).toBeVisible();
    await expect(page.getByRole('button', { name: /try again/i })).toBeVisible();
    await axeCheck(page);
  });

  test('expired: a callback without a matching attempt', async ({ page }) => {
    await signUpAndVerify(page, uniqueEmail('notion-expired'), PASSWORD);
    // No attempt cookie was ever set, so this state can't match.
    await page.goto('/notion/callback?code=anything&state=not-a-real-state');

    await expect(page.getByText('That connection attempt expired. Try again.')).toBeVisible();
    await axeCheck(page);
  });

  test('no_pages', async ({ page, request }) => {
    await request.post(`${MOCKS_URL}/notion/__control`, { data: { sharedContent: false } });
    await signUpAndVerify(page, uniqueEmail('notion-no-pages'), PASSWORD);
    await page.goto('/settings/connectors');
    await page.getByRole('button', { name: /^connect notion$/i }).click();

    await expect(page.getByText('No pages were shared with Desk.')).toBeVisible();
    await expect(page.getByRole('button', { name: /reconnect to choose pages/i })).toBeVisible();
    await axeCheck(page);
  });
});

/**
 * Spec 005 T018: runs only in the `ci-no-notion` project, against a stack started with
 * infra/docker-compose.no-notion.yml (api without Notion credentials, like a preview).
 */
test.describe('Notion unavailable @no-notion', () => {
  test('unavailable: Connectors says so, Connect is disabled, no toast @no-notion', async ({
    page,
  }) => {
    await signUpAndVerify(page, uniqueEmail('notion-unavailable'), PASSWORD);

    await page.goto('/settings/connectors');
    // The copy is shown in the panel and also announced by the page's polite status region.
    await expect(
      page.locator('p:not(.desk-sr-only)', {
        hasText: "Notion sync isn't available on this server yet.",
      }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: /connect notion/i })).toBeDisabled();
    // No toast of any tone (Toast.vue renders each as .desk-toast).
    await expect(page.locator('.desk-toast')).toHaveCount(0);

    await axeCheck(page);
  });
});

/**
 * Spec 005 T021 (SC-001.2): real staging round trip with a real Notion account. @local, so it
 * runs only on desk-local (never blocks a PR). UNVERIFIED here — no live credentials in the
 * sandbox. Like the suite above it relies on desk-local's browser profile already being signed
 * into the Notion test account, so no Notion password is scripted; the account's presence is
 * signalled by NOTION_TEST_ACCOUNT_SECRET from the `local-secrets` environment (tests/e2e/
 * fixtures/test-accounts.ts has no Notion entry, so this env var stands in for it).
 */
test.describe('Notion connect on staging @local', () => {
  test.skip(
    !process.env['NOTION_TEST_ACCOUNT_SECRET'],
    'no Notion test account configured — set NOTION_TEST_ACCOUNT_SECRET in the local-secrets environment (desk-local runner only)',
  );

  test('connects to a real workspace within a minute, excluding Notion screens @local', async ({
    page,
  }) => {
    test.setTimeout(3 * 60 * 1000);
    await signUpAndVerify(page, uniqueEmail('notion-staging'), PASSWORD);
    await page.goto('/settings/connectors');

    const clicked = Date.now();
    await page.getByRole('button', { name: /connect notion/i }).click();
    await page.waitForURL(/notion\.so\/(login|v1\/oauth)/, { timeout: 30_000 });
    const leftApp = Date.now();
    await page.waitForURL(/\/settings\/connectors/, { timeout: 90_000 });
    const backInApp = Date.now();
    await expect(page.getByText(/connected to /i)).toBeVisible({ timeout: 30_000 });
    const done = Date.now();

    // Time spent in Desk only: click to leaving for Notion, plus callback to "Connected to …".
    const seconds = (leftApp - clicked + (done - backInApp)) / 1000;
    console.log(
      `SC-001.2 connect duration (excluding Notion's own screens): ${seconds.toFixed(1)} s`,
    );
    expect(seconds).toBeLessThan(60);
  });
});
