import type { Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const MAILPIT_URL = process.env['MAILPIT_URL'] ?? 'http://localhost:8025';
const MOCKS_URL = process.env['MOCKS_URL'] ?? 'http://localhost:4000';

type MailpitMessage = { ID: string; To: { Address: string }[] };
type MailpitMessagesResponse = { messages: MailpitMessage[] };

/**
 * Fills and submits the register form for `email`, then polls Mailpit's REST API for the
 * verification email and visits its link. RegisterView.vue is still a placeholder (Phase 1
 * in progress) — this targets the form contract the register route will expose (email/password
 * fields, a submit button) and a verify link matching /auth/verify; update the selectors here
 * alongside the real form, not the call sites.
 */
export async function signUpAndVerify(
  page: Page,
  email: string,
  password = 'correct horse battery staple',
): Promise<void> {
  await page.goto('/register');
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole('button', { name: /sign up|register|create account/i }).click();

  const verifyUrl = await pollForVerifyLink(email);
  await page.goto(verifyUrl);
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
        const found = (HTML || Text).match(/https?:\/\/[^\s"'<>]*\/auth\/verify[^\s"'<>]*/);
        if (found) return found[0];
      }
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`signUpAndVerify: no verification email for ${email} within ${timeoutMs}ms`);
}

/** Freezes the mocks server's clock (infra/mocks/src/server.ts) at `date`. */
export async function freezeClock(date: Date): Promise<void> {
  const res = await fetch(`${MOCKS_URL}/clock`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ iso: date.toISOString() }),
  });
  if (!res.ok) {
    throw new Error(`freezeClock: POST /clock failed with status ${res.status}`);
  }
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
