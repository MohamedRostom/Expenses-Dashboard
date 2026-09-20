import { expect, test, type Page } from '@playwright/test';
import { axeCheck, signUpAndVerify } from '../fixtures/index.js';

const MAILPIT_URL = process.env['MAILPIT_URL'] ?? 'http://localhost:8025';
// Not real phrases — see tests/e2e/fixtures/index.ts's signUpAndVerify comment: the XKCD example
// password is genuinely flagged by the real HIBP breach-check used in e2e-ci.
const PASSWORD = 'xk-e2e-Tr0ub4-fixture-2026';
const NEW_PASSWORD = 'xk-e2e-Tr0ub4-reset-2026';

type MailpitMessage = { ID: string; To: { Address: string }[] };
type MailpitMessagesResponse = { messages: MailpitMessage[] };

/** Polls Mailpit for the newest email to `email` whose body matches `linkPattern`, returns the link. */
async function readLinkFromMailpit(
  email: string,
  linkPattern: RegExp,
  timeoutMs = 15_000,
): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await fetch(`${MAILPIT_URL}/api/v1/messages`);
    if (res.ok) {
      const { messages } = (await res.json()) as MailpitMessagesResponse;
      const matches = messages.filter((m) => m.To.some((to) => to.Address === email));
      for (const m of matches) {
        const detail = await fetch(`${MAILPIT_URL}/api/v1/message/${m.ID}`);
        const { HTML, Text } = (await detail.json()) as { HTML: string; Text: string };
        const found = (HTML || Text).match(linkPattern);
        if (found) return found[0];
      }
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`readLinkFromMailpit: no matching email for ${email} within ${timeoutMs}ms`);
}

/**
 * The API mails links against a fixed LINK_ORIGIN (apps/api/src/services/auth.ts), not this
 * run's baseURL — navigate by path+query against the app under test rather than the mailed origin.
 */
function pathOf(url: string): string {
  const u = new URL(url);
  return `${u.pathname}${u.search}`;
}

/**
 * apps/web/src/api/client.ts's apiFetch reads the __Host-desk_csrf cookie and sends it as
 * X-CSRF-Token on every mutating browser fetch — page.request (Playwright's own APIRequestContext)
 * shares the browser context's cookie jar but has no such logic, so a raw page.request.post/delete
 * needs this header attached manually or apps/api/src/middleware/csrf.ts 403s it.
 */
async function csrfHeaders(page: Page): Promise<Record<string, string>> {
  const cookie = (await page.context().cookies()).find((c) => c.name === '__Host-desk_csrf');
  return cookie ? { 'X-CSRF-Token': cookie.value } : {};
}

function uniqueEmail(tag: string): string {
  return `e2e-${tag}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`;
}

test('sign up, verify via Mailpit, sign in on two contexts, sign out one, reset password, delete account', async ({
  page,
  browser,
}) => {
  const email = uniqueEmail('auth');

  // 1. Sign up
  await page.goto('/register');
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(PASSWORD);
  await page.getByRole('button', { name: /sign up/i }).click();
  await expect(page.getByText(/check your email/i)).toBeVisible();
  await axeCheck(page);

  // 2. Read verification link in Mailpit and verify
  const verifyUrl = await readLinkFromMailpit(
    email,
    /https?:\/\/[^\s"'<>]*\/verify\?token=[^\s"'<>]*/,
  );
  await page.goto(pathOf(verifyUrl));
  // A freshly verified user has no onboardingCompletedAt yet, so /verify's own client-side
  // redirect to /onboarding fires after page.goto() above already resolved — wait for the Skip
  // button (a page.url() check right here would race that navigation) rather than reading the
  // URL synchronously. This test isn't about onboarding (see onboarding.spec.ts for that).
  const skipButton = page.getByRole('button', { name: /^skip$/i });
  await skipButton.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
  if (await skipButton.isVisible()) await skipButton.click();
  await expect(page).toHaveURL('/');
  await axeCheck(page);

  // 3. Sign in on two contexts
  const context2 = await browser.newContext();
  const page2 = await context2.newPage();
  await page2.goto('/login');
  await axeCheck(page2);
  await page2.getByLabel(/email/i).fill(email);
  await page2.getByLabel(/password/i).fill(PASSWORD);
  await page2.getByRole('button', { name: /sign in/i }).click();
  await expect(page2).toHaveURL('/');

  // both contexts reach /settings without being redirected to /login
  await page.goto('/settings');
  await expect(page).toHaveURL('/settings');
  await page2.goto('/settings');
  await expect(page2).toHaveURL('/settings');

  // 4. Sign out one (context 2). SettingsView is still a placeholder (no logout button yet),
  // so drive the real endpoint directly with context2's cookies — this is what a logout button
  // will call once SettingsView grows one; swap this for a UI click at that point.
  // ponytail: SettingsView has no session-list/logout UI yet; upgrade this to a UI click when it lands.
  const logoutRes = await page2.request.post('/auth/logout', { headers: await csrfHeaders(page2) });
  expect(logoutRes.status()).toBe(204);
  await page2.goto('/settings');
  await expect(page2).toHaveURL(/\/login/);

  // context 1 remains signed in
  await page.goto('/settings');
  await expect(page).toHaveURL('/settings');
  await context2.close();

  // 5. Reset password
  await page.goto('/forgot');
  await axeCheck(page);
  await page.getByLabel(/email/i).fill(email);
  await page.getByRole('button', { name: /send reset link/i }).click();
  await expect(page.getByText(/reset link was sent/i)).toBeVisible();

  // NOTE: the API currently mails a /reset-password link (apps/api/src/services/auth.ts) while
  // the SPA route is /reset (apps/web/src/router.ts) — a real mismatch this test surfaces rather
  // than papers over. Match whichever reset path the email actually contains.
  const resetUrl = await readLinkFromMailpit(
    email,
    /https?:\/\/[^\s"'<>]*\/reset[^\s"'<>]*\?token=[^\s"'<>]*/,
  );
  await page.goto(pathOf(resetUrl));
  await axeCheck(page);
  await page.getByLabel(/new password/i).fill(NEW_PASSWORD);
  await page.getByRole('button', { name: /reset password/i }).click();
  await expect(page.getByText(/password was reset/i)).toBeVisible();

  await page.goto('/login');
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(NEW_PASSWORD);
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).toHaveURL('/');

  // 6. Delete account. SettingsView has no delete-account UI yet, so exercise the real
  // endpoint directly (same caveat as logout above).
  // ponytail: SettingsView has no delete-account confirmation dialog yet; upgrade this to a UI
  // click-through when it lands.
  const deleteRes = await page.request.delete('/me', {
    data: {},
    headers: await csrfHeaders(page),
  });
  expect(deleteRes.status()).toBe(204);
  await page.goto('/settings');
  await expect(page).toHaveURL(/\/login/);

  // signing in again with the same credentials now fails
  await page.goto('/login');
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(NEW_PASSWORD);
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page.getByText(/wrong email or password/i)).toBeVisible();
});

test('signUpAndVerify fixture reaches an authenticated home page', async ({ page }) => {
  const email = uniqueEmail('fixture');
  await signUpAndVerify(page, email, PASSWORD);
  await expect(page).toHaveURL('/');
  await axeCheck(page);
});
