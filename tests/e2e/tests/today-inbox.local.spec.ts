import { expect, test } from '@playwright/test';
import { signUpAndVerify } from '../fixtures/index.js';
import { loadTestAccounts, skipReason } from '../fixtures/test-accounts.js';

/**
 * T044: @local — needs a REAL Microsoft test mailbox and a REAL OAuth round-trip, so it runs only
 * on the self-hosted `desk-local` runner (CLAUDE.md's e2e-local rules: workflow_dispatch +
 * nightly, never blocks a PR, secrets from the approval-gated `local-secrets` environment). It is
 * type-checked and structurally complete but UNVERIFIED against real accounts in this sandbox —
 * there are no live Microsoft credentials available here.
 *
 * Mirrors today-calendar.local.spec.ts: connecting drives the real Microsoft consent screen and
 * desk-local's browser profile is assumed already signed into the test account, so no password is
 * scripted. SC-002: each of three trials sends a uniquely-subjected message and it must appear
 * in the Today inbox panel within five minutes, newest first.
 *
 * The task said "send via SMTP"; this sends through Microsoft Graph `POST /me/sendMail`, from the
 * mailbox to itself, instead: the repo has no SMTP client dependency (and none may be added for
 * a test), and delivering to the same mailbox through Graph exercises the same inbox path.
 *
 * The account's `refreshToken` (tests/e2e/fixtures/test-accounts.ts) is used only to call Graph
 * directly. It must have been granted `Mail.Send` (Desk's own connection requests read scopes
 * only), so mint it with that scope included. Env vars read directly (add to the `local-secrets`
 * environment; same names apps/api uses, see apps/api/src/env.ts): MICROSOFT_CLIENT_ID,
 * MICROSOFT_CLIENT_SECRET.
 *
 * Gmail joins once `panels.google_mail` is on; IMAP accounts come in T067. No code for them here.
 */
// Not a real phrase — see tests/e2e/fixtures/index.ts's signUpAndVerify comment.
const PASSWORD = 'xk-e2e-Tr0ub4-fixture-2026';
const FIVE_MINUTES_MS = 5 * 60 * 1000;
const TRIALS = 3;

function uniqueEmail(tag: string): string {
  return `e2e-${tag}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`today-inbox.local.spec.ts: missing required env var ${name}`);
  }
  return value;
}

async function microsoftAccessToken(refreshToken: string): Promise<string> {
  const res = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: requireEnv('MICROSOFT_CLIENT_ID'),
      client_secret: requireEnv('MICROSOFT_CLIENT_SECRET'),
      scope: 'offline_access Mail.Send',
    }),
  });
  if (!res.ok) throw new Error(`graph token refresh failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

/** Sends `subject` from the mailbox to itself through Graph; the message lands in its inbox. */
async function sendToSelf(token: string, address: string, subject: string): Promise<void> {
  const res = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      message: {
        subject,
        body: { contentType: 'Text', content: 'Desk e2e-local trial message.' },
        toRecipients: [{ emailAddress: { address } }],
      },
      saveToSentItems: false,
    }),
  });
  if (!res.ok) throw new Error(`graph sendMail failed: ${res.status} ${await res.text()}`);
}

const accounts = loadTestAccounts();

test.describe('Today inbox propagation @local', () => {
  const account = accounts.microsoft;

  test('a message sent to a real Microsoft mailbox appears first in the Today inbox within five minutes, across three trials @local', async ({
    page,
  }) => {
    test.skip(!account, skipReason('microsoft'));

    // Three trials, each allowed up to five minutes (SC-002): raise the default 30s timeout.
    test.setTimeout(TRIALS * FIVE_MINUTES_MS + 5 * 60_000);

    const email = uniqueEmail('today-inbox-microsoft');
    await signUpAndVerify(page, email, PASSWORD);

    await page.goto('/settings/connections');
    await page.getByRole('button', { name: /connect microsoft/i }).click();

    // Real consent screen — desk-local's browser profile is already signed into the test account.
    await page.waitForURL(/login\.microsoftonline\.com/, { timeout: 30_000 });
    await page.waitForURL(/\/settings\/connections/, { timeout: 60_000 });

    const token = await microsoftAccessToken(account!.refreshToken);
    const timingsMs: number[] = [];
    for (let trial = 1; trial <= TRIALS; trial += 1) {
      const subject = `today-inbox-e2e-local-trial${trial}-${Date.now()}`;
      await sendToSelf(token, account!.email, subject);
      const startedAt = Date.now();

      // Newest first: the message just sent must be the top row, ahead of earlier trials'.
      await expect(async () => {
        await page.goto('/today');
        await expect(page.locator('.inbox-panel .message').first()).toContainText(subject, {
          timeout: 5_000,
        });
      }).toPass({ timeout: FIVE_MINUTES_MS, intervals: [10_000] });

      timingsMs.push(Date.now() - startedAt);
    }

    // SC-002: timing written to the run log (no custom report sink).
    console.log(`[SC-002] microsoft inbox propagation timings (ms): ${timingsMs.join(', ')}`);
  });
});
