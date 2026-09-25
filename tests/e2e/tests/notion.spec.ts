import { expect, test } from '@playwright/test';
import { signUpAndVerify } from '../fixtures/index.js';

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
