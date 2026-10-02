import { expect, test } from '@playwright/test';
import { signUpAndVerify } from '../fixtures/index.js';
import { loadTestAccounts, skipReason, type OAuthAccount } from '../fixtures/test-accounts.js';

/**
 * T030: @local — needs REAL Google and Microsoft test accounts and a REAL OAuth round-trip, so
 * it runs only on the self-hosted `desk-local` runner (CLAUDE.md's e2e-local rules:
 * workflow_dispatch + nightly, never blocks a PR, secrets from the approval-gated `local-secrets`
 * environment). It is type-checked and structurally complete but UNVERIFIED against real
 * accounts in this sandbox — there are no live Google/Microsoft credentials available here.
 *
 * Mirrors notion.spec.ts's pattern: connecting the account drives the real provider consent
 * screen, and desk-local's browser profile is assumed already signed into the test account, so
 * no password is scripted here — the redirect back to the app resolves on its own.
 *
 * The account's `refreshToken` (tests/e2e/fixtures/test-accounts.ts, filled in from connecting
 * it once through Desk's panels OAuth client — same file the connect step above also exercises)
 * is used here only to call the real Google/Microsoft APIs directly and create the trial event,
 * proving propagation into Desk rather than proving the connect UI (T029 already covers that
 * against the mocks). New env vars this reads directly (add to the `local-secrets` GitHub
 * environment; same names apps/api already uses for the live OAuth clients, see
 * apps/api/src/env.ts): GOOGLE_PANELS_CLIENT_ID, GOOGLE_PANELS_CLIENT_SECRET,
 * MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET.
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
    throw new Error(`today-calendar.local.spec.ts: missing required env var ${name}`);
  }
  return value;
}

/** Tomorrow at `hour` UTC, as an ISO string — keeps the trial event inside Today's 7-day window. */
function tomorrowAt(hour: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 1);
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString();
}

async function googleAccessToken(refreshToken: string): Promise<string> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: requireEnv('GOOGLE_PANELS_CLIENT_ID'),
      client_secret: requireEnv('GOOGLE_PANELS_CLIENT_SECRET'),
    }),
  });
  if (!res.ok) throw new Error(`google token refresh failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
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
      scope: 'offline_access Calendars.ReadWrite',
    }),
  });
  if (!res.ok) throw new Error(`graph token refresh failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

/** Creates a one-hour event tomorrow via the real provider API; returns its provider event id. */
async function createProviderEvent(
  provider: 'google' | 'microsoft',
  account: OAuthAccount,
  title: string,
): Promise<string> {
  if (provider === 'google') {
    const token = await googleAccessToken(account.refreshToken);
    const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        summary: title,
        start: { dateTime: tomorrowAt(9) },
        end: { dateTime: tomorrowAt(10) },
      }),
    });
    if (!res.ok) throw new Error(`google event create failed: ${res.status} ${await res.text()}`);
    return ((await res.json()) as { id: string }).id;
  }
  const token = await microsoftAccessToken(account.refreshToken);
  const res = await fetch('https://graph.microsoft.com/v1.0/me/events', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      subject: title,
      start: { dateTime: tomorrowAt(9).replace('Z', ''), timeZone: 'UTC' },
      end: { dateTime: tomorrowAt(10).replace('Z', ''), timeZone: 'UTC' },
    }),
  });
  if (!res.ok) throw new Error(`graph event create failed: ${res.status} ${await res.text()}`);
  return ((await res.json()) as { id: string }).id;
}

async function deleteProviderEvent(
  provider: 'google' | 'microsoft',
  account: OAuthAccount,
  eventId: string,
): Promise<void> {
  const url =
    provider === 'google'
      ? `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`
      : `https://graph.microsoft.com/v1.0/me/events/${eventId}`;
  const token =
    provider === 'google'
      ? await googleAccessToken(account.refreshToken)
      : await microsoftAccessToken(account.refreshToken);
  const res = await fetch(url, { method: 'DELETE', headers: { authorization: `Bearer ${token}` } });
  if (!res.ok && res.status !== 404) {
    throw new Error(`${provider} event delete failed: ${res.status} ${await res.text()}`);
  }
}

const accounts = loadTestAccounts();

test.describe('Today calendar propagation @local', () => {
  for (const provider of ['google', 'microsoft'] as const) {
    const account = accounts[provider];

    test(`an event created via the ${provider} API appears in Today within five minutes, across three trials @local`, async ({
      page,
    }) => {
      test.skip(!account, skipReason(provider));

      // Three trials, each allowed up to five minutes to propagate (SC-002) — long enough that
      // the default 30s Playwright test timeout must be raised well past the worst case.
      test.setTimeout(TRIALS * FIVE_MINUTES_MS + 5 * 60_000);

      const email = uniqueEmail(`today-${provider}`);
      await signUpAndVerify(page, email, PASSWORD);

      await page.goto('/settings/connections');
      await page.getByRole('button', { name: new RegExp(`connect ${provider}`, 'i') }).click();

      // Real consent screen — desk-local's browser profile is already signed into the test
      // account (see notion.spec.ts), so this resolves without a scripted login.
      await page.waitForURL(/accounts\.google\.com|login\.microsoftonline\.com/, {
        timeout: 30_000,
      });
      await page.waitForURL(/\/settings\/connections/, { timeout: 60_000 });

      const timingsMs: number[] = [];
      for (let trial = 1; trial <= TRIALS; trial += 1) {
        const title = `today-e2e-local-${provider}-trial${trial}-${Date.now()}`;
        const eventId = await createProviderEvent(provider, account!, title);
        const startedAt = Date.now();

        try {
          await expect(async () => {
            await page.goto('/today');
            expect(await page.getByText(title, { exact: false }).count()).toBeGreaterThan(0);
          }).toPass({ timeout: FIVE_MINUTES_MS, intervals: [10_000] });
        } finally {
          await deleteProviderEvent(provider, account!, eventId);
        }

        timingsMs.push(Date.now() - startedAt);
      }

      // SC-002: timing written to the report (no custom report sink here — the run log is it).
      console.log(`[SC-002] ${provider} propagation timings (ms): ${timingsMs.join(', ')}`);
    });
  }
});
