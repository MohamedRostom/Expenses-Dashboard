import type { Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const MAILPIT_URL = process.env['MAILPIT_URL'] ?? 'http://localhost:8025';

type MailpitMessage = { ID: string; To: { Address: string }[] };
type MailpitMessagesResponse = { messages: MailpitMessage[] };

/**
 * Fills and submits the register form for `email`, then polls Mailpit's REST API for the
 * verification email and visits its link (the SPA's /verify?token=... route).
 */
export async function signUpAndVerify(
  page: Page,
  email: string,
  // Not a real quote/phrase — HibpBreachChecker (apps/api/src/adapters/breach-checker.ts) makes
  // a live call to api.pwnedpasswords.com in e2e-ci, and 'correct horse battery staple' (the
  // XKCD example) is a genuinely breached password, so every signup using it was rejected 400.
  password = 'xk-e2e-Tr0ub4-fixture-2026',
  // A freshly verified user has no onboardingCompletedAt yet, so the router guard
  // (apps/web/src/router.ts) bounces every route back to /onboarding until it's set — most
  // callers expect to land on an authenticated '/', so skip it here by default. onboarding.spec.ts
  // passes false since it deliberately asserts /onboarding and drives that UI itself.
  skipOnboarding = true,
): Promise<void> {
  await page.goto('/register');
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole('button', { name: /sign up|register|create account/i }).click();

  const verifyUrl = await pollForVerifyLink(email);
  await page.goto(verifyUrl);

  if (skipOnboarding) {
    // /verify does its own client-side redirect to /onboarding after page.goto() above already
    // resolved (goto only waits for /verify's own load) — an immediate page.url() check races
    // that navigation, so wait for the Skip button instead of reading the URL synchronously.
    // A user who's already onboarded never shows it, so the catch is the normal, common case.
    const skipButton = page.getByRole('button', { name: /^skip$/i });
    await skipButton.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
    if (await skipButton.isVisible()) await skipButton.click();
  }
}

async function pollForVerifyLink(email: string, timeoutMs = 15_000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await fetch(`${MAILPIT_URL}/api/v1/messages`);
    if (res.ok) {
      const { messages } = (await res.json()) as MailpitMessagesResponse;
      const match = messages.find((m) => m.To.some((to) => to.Address === email));
      if (match) {
        const detail = await fetch(`${MAILPIT_URL}/api/v1/message/${match.ID}`);
        const { HTML, Text } = (await detail.json()) as { HTML: string; Text: string };
        // The mail links to the SPA's client-side /verify route (which itself calls
        // POST /auth/verify), not to /auth/verify directly — this regex never matched it.
        const found = (HTML || Text).match(/https?:\/\/[^\s"'<>]*\/verify\?[^\s"'<>]*/);
        if (found) return found[0];
      }
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`signUpAndVerify: no verification email for ${email} within ${timeoutMs}ms`);
}

/** Runs axe against the current page and throws with violation details if any serious/critical ones are found. */
export async function axeCheck(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  const blocking = results.violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical',
  );
  if (blocking.length > 0) {
    const summary = blocking.map((v) => `${v.id} (${v.impact}): ${v.help}`).join('\n');
    throw new Error(`axeCheck: ${blocking.length} serious/critical violation(s):\n${summary}`);
  }
}
