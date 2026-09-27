import type { Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const MAILPIT_URL = process.env['MAILPIT_URL'] ?? 'http://localhost:8025';
const MOCKS_URL = process.env['MOCKS_URL'] ?? 'http://localhost:4000';

// T036: infra/mocks/src/google.ts and graph.ts each serve their provider's calendar API, OAuth
// endpoints and these control routes under one mount — 'microsoft' maps to '/graph' because
// that mock is Microsoft Graph, while the app's own provider id (used in /connections/:provider)
// is 'microsoft'.
const MOCK_MOUNTS = { google: 'google', microsoft: 'graph' } as const;

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

/**
 * Control-route helpers for the Google and Graph mock servers (infra/mocks/src/google.ts,
 * graph.ts), so a Playwright spec can add/delete provider events and simulate a revoked
 * connection without going through the real Google/Microsoft APIs.
 */
/**
 * Drives the mock's control routes for one connected account. `key` scopes every call to a single
 * account's fake (T087) — pass the key `nextMockAccount` returned before the OAuth connect that
 * created it; omit it only for a test that never called `nextMockAccount` and is content with the
 * mock's single shared 'default' account.
 *
 * T052: `mockProvider('imap')` drives the IMAP mock (infra/mocks/src/imap.ts) instead — a real TCP
 * IMAP server backed by an in-memory mailbox per username (IMAP has no OAuth account key, so
 * isolation is by `username` directly and every call takes it explicitly; `addEvent`/`deleteEvent`/
 * `revoke` don't apply to a mail-only, revoke-less provider, so IMAP's helper only offers
 * `addMessage`/`markRead`).
 */
export function mockProvider(
  provider: 'google' | 'microsoft',
  key?: string,
): {
  addEvent(calendarId: string, event: Record<string, unknown>): Promise<void>;
  deleteEvent(calendarId: string, eventId: string): Promise<void>;
  addMessage(message: Record<string, unknown>): Promise<void>;
  markRead(id: string): Promise<void>;
  revoke(): Promise<void>;
};
export function mockProvider(provider: 'imap'): {
  addMessage(
    username: string,
    message: { from: string; subject: string; body: string; date: string; seen?: boolean },
  ): Promise<void>;
  markRead(username: string, uid: number): Promise<void>;
};
// T071: `mockProvider('caldav')` drives the CalDAV mock (infra/mocks/src/caldav.ts) — HTTP like
// Google/Graph, but with no OAuth account key (CalDAV has no OAuth), so isolation is by
// `username` directly, the same as `mockProvider('imap')` above. `addEvent`/`deleteEvent` take the
// object resource's `href` and full ICS text (CalDavFake.addEvent's shape) rather than a
// friendlier per-field object, so the mock never needs its own second ICS-building logic.
export function mockProvider(provider: 'caldav'): {
  addEvent(username: string, href: string, icsText: string): Promise<void>;
  deleteEvent(username: string, href: string): Promise<void>;
  setPassword(username: string, password: string): Promise<void>;
};
export function mockProvider(provider: 'google' | 'microsoft' | 'imap' | 'caldav', key?: string) {
  if (provider === 'imap') {
    return {
      async addMessage(
        username: string,
        message: { from: string; subject: string; body: string; date: string; seen?: boolean },
      ): Promise<void> {
        await postControl(`${MOCKS_URL}/__control/imap/messages`, {
          username,
          action: 'add',
          message,
        });
      },
      async markRead(username: string, uid: number): Promise<void> {
        await postControl(`${MOCKS_URL}/__control/imap/messages`, {
          username,
          action: 'markRead',
          uid,
        });
      },
    };
  }

  if (provider === 'caldav') {
    const base = `${MOCKS_URL}/caldav`;
    return {
      async addEvent(username: string, href: string, icsText: string): Promise<void> {
        await postControl(`${base}/__control/events`, { action: 'add', username, href, icsText });
      },
      async deleteEvent(username: string, href: string): Promise<void> {
        await postControl(`${base}/__control/events`, { action: 'delete', username, href });
      },
      async setPassword(username: string, password: string): Promise<void> {
        await postControl(`${base}/__control/password`, { username, password });
      },
    };
  }

  const base = `${MOCKS_URL}/${MOCK_MOUNTS[provider]}`;
  return {
    async addEvent(calendarId: string, event: Record<string, unknown>): Promise<void> {
      await postControl(`${base}/__control/events`, { action: 'add', calendarId, event, key });
    },
    async deleteEvent(calendarId: string, eventId: string): Promise<void> {
      await postControl(`${base}/__control/events`, { action: 'delete', calendarId, eventId, key });
    },
    // T052: message.id below is the provider's raw message id (Gmail message id / Graph message
    // id) — the same id passed to markRead.
    async addMessage(message: Record<string, unknown>): Promise<void> {
      await postControl(`${base}/__control/messages`, { action: 'add', message, key });
    },
    async markRead(id: string): Promise<void> {
      await postControl(`${base}/__control/messages`, { action: 'markRead', id, key });
    },
    async revoke(): Promise<void> {
      await postControl(`${base}/__control/revoke`, { key });
    },
  };
}

/**
 * Reserves a fresh, isolated mock account for `provider` (T087) — call this right before clicking
 * Connect. The mock creates a new GoogleFake/GraphFake for the returned key and routes the OAuth
 * code, then the access/refresh tokens, so the resulting connected account never sees another
 * test's events. Pass the returned key to `mockProvider()` afterwards.
 */
export async function nextMockAccount(provider: 'google' | 'microsoft'): Promise<string> {
  const key = crypto.randomUUID();
  const base = `${MOCKS_URL}/${MOCK_MOUNTS[provider]}`;
  await postControl(`${base}/__control/next-account`, { key });
  return key;
}

async function postControl(url: string, body: unknown): Promise<void> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`mockProvider: POST ${url} failed: ${res.status} ${await res.text()}`);
  }
}

/** Runs axe against the current page and throws with violation details if any serious/critical ones are found. */
export async function axeCheck(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  const blocking = results.violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical',
  );
  if (blocking.length > 0) {
    // Include each violating node's selector, not just the rule id — "color-contrast (serious)"
    // alone doesn't say which element, making failures expensive to diagnose after the fact.
    const summary = blocking
      .map(
        (v) =>
          `${v.id} (${v.impact}): ${v.help}\n` +
          v.nodes.map((n) => `  - ${n.target.join(' ')}: ${n.html}`).join('\n'),
      )
      .join('\n');
    throw new Error(`axeCheck: ${blocking.length} serious/critical violation(s):\n${summary}`);
  }
}
