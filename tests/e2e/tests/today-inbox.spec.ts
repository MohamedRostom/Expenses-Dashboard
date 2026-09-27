import { execSync } from 'node:child_process';
import { expect, test, type Page } from '@playwright/test';
import { signUpAndVerify, axeCheck, mockProvider, nextMockAccount } from '../fixtures/index.js';

/**
 * T043 (ci, inbox): the Today page's inbox panel against the fake Graph and Google servers
 * (infra/mocks/src/graph.ts, google.ts), driven through the real connect flow, kept in its own
 * file (rather than folded into today.spec.ts) per the task note to keep that file manageable.
 *
 * Microsoft's "Connect Microsoft" button grants every capability the panels.microsoft flag
 * offers in one step (apps/web/src/views/ConnectionsView.vue's non-Google branch joins
 * `provider.capabilities`), so a Microsoft account connected this way already has `mail`.
 * Google's card only ever offers `calendar` from its own "Connect Calendar" button — mail is
 * added afterwards through the account's "Add mail" link (ConnectionsView.test.ts: "shows an
 * 'Add mail' button for a capability the provider offers but the account lacks"), which is the
 * flow this file drives for a Google mail account.
 */

const DB_URL = process.env['DATABASE_URL'] ?? 'postgres://desk:desk@localhost:5432/desk';

const GOOGLE_ACCOUNT_LABEL = 'mock-google-user@example.test';
const MICROSOFT_ACCOUNT_LABEL = 'mock-graph-user@example.test';

async function connect(page: Page, provider: 'google' | 'microsoft'): Promise<string> {
  const key = await nextMockAccount(provider);
  await page.goto('/settings/connections');
  const buttonName = provider === 'google' ? 'Connect Calendar' : 'Connect Microsoft';
  await page.getByRole('button', { name: buttonName }).click();
  await page.waitForURL(/\/settings\/connections\?connected=/);
  return key;
}

/** Adds the `mail` capability to the Google account `connect()` just created, through the same
 * "Add mail" link a real user would click (ConnectionsView.vue's missingCapabilities/
 * addCapabilityUrl). This is a second, independent OAuth round trip (T084's `?account=<id>`
 * flow), which rotates the stored credential to whatever mock key `/o/oauth2/v2/auth` consumes
 * next (infra/mocks/src/google.ts's `nextKey`) — so, exactly like `connect()`, this reserves a
 * fresh key with `nextMockAccount` first and returns it; every `mockProvider('google', ...)` call
 * afterwards must use *this* key (the mail identity's fake), not the key `connect()` returned
 * (that one only ever backed the calendar capability and is no longer live once the credential
 * rotates — the mock still resolves both keys to the same account address, so the DB row merges
 * correctly either way, but only the new key's fake is what a mail refresh will actually read). */
async function addGoogleMail(page: Page): Promise<string> {
  const key = await nextMockAccount('google');
  await page.goto('/settings/connections');
  await page.getByRole('link', { name: 'Add mail' }).click();
  await page.waitForURL(/\/settings\/connections\?connected=/);
  return key;
}

async function csrfHeaders(page: Page): Promise<Record<string, string>> {
  const cookies = await page.context().cookies();
  const csrf = cookies.find((c) => c.name === '__Host-desk_csrf')?.value;
  if (!csrf) throw new Error('csrfHeaders: no __Host-desk_csrf cookie yet — visit a page first');
  return { 'x-csrf-token': csrf };
}

type TodayPayload = {
  messages: {
    id: string;
    accountId: string;
    subject: string;
    fromName: string;
    fromAddress: string;
    unread: boolean;
    receivedAt: string;
    link: string | null;
  }[];
  accounts: {
    id: string;
    label: string;
    unreadCount: number;
    lastRefreshAt: string | null;
  }[];
};

async function getTodayPayload(page: Page): Promise<TodayPayload> {
  const res = await page.request.get('/panels/today');
  if (!res.ok()) throw new Error(`GET /panels/today: ${res.status()}`);
  return (await res.json()) as TodayPayload;
}

async function refreshUntilAllowed(page: Page, timeoutMs = 90_000): Promise<void> {
  await expect(async () => {
    const res = await page.request.post('/panels/today/refresh', {
      headers: await csrfHeaders(page),
    });
    expect(res.status(), `refresh response body: ${await res.text()}`).toBe(202);
  }).toPass({ timeout: timeoutMs, intervals: [2000, 5000, 10000] });
}

async function waitForTodayPayload(
  page: Page,
  predicate: (body: TodayPayload) => boolean,
  timeoutMs = 40_000,
): Promise<TodayPayload> {
  let last: TodayPayload | undefined;
  await expect(async () => {
    const body = await getTodayPayload(page);
    last = body;
    expect(predicate(body)).toBe(true);
  }).toPass({ timeout: timeoutMs, intervals: [1000, 2000, 3000] });
  return last as TodayPayload;
}

function backdateLastRefresh(email: string, provider: string, minutesAgo: number): void {
  execSync(`pnpm --filter @desk/db backdate-refresh "${email}" "${provider}" ${minutesAgo}`, {
    env: { ...process.env, DATABASE_URL: DB_URL },
    stdio: 'pipe',
  });
}

function setUserFlag(email: string, flag: string, state: 'on' | 'off'): void {
  execSync(`pnpm --filter @desk/db flags set "${flag}" --user "${email}" ${state}`, {
    env: { ...process.env, DATABASE_URL: DB_URL },
    stdio: 'pipe',
  });
}

function googleMessage(
  id: string,
  subject: string,
  fromName: string,
  hoursAgo: number,
  unread: boolean,
) {
  const date = new Date(Date.now() - hoursAgo * 60 * 60 * 1000);
  return {
    id,
    labelIds: unread ? ['UNREAD'] : [],
    snippet: `preview of ${subject}`,
    internalDate: String(date.getTime()),
    payload: {
      headers: [
        { name: 'From', value: `${fromName} <${fromName.toLowerCase()}@example.test>` },
        { name: 'Subject', value: subject },
      ],
    },
  };
}

function microsoftMessage(
  id: string,
  subject: string,
  fromName: string,
  hoursAgo: number,
  unread: boolean,
) {
  const date = new Date(Date.now() - hoursAgo * 60 * 60 * 1000);
  return {
    id,
    subject,
    bodyPreview: `preview of ${subject}`,
    receivedDateTime: date.toISOString(),
    isRead: !unread,
    webLink: `https://outlook.office.com/mail/inbox/id/${id}`,
    from: { emailAddress: { name: fromName, address: `${fromName.toLowerCase()}@example.test` } },
  };
}

test.describe('Today inbox panel @ci', () => {
  test('a Microsoft and a Google mail account interleave newest first with account chips, and a message opens the provider link in a new tab with no other action', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const email = `today-inbox-${crypto.randomUUID()}@example.com`;
    await signUpAndVerify(page, email);

    const microsoftKey = await connect(page, 'microsoft');
    await waitForTodayPayload(page, (b) => b.accounts[0]?.lastRefreshAt !== null);

    await connect(page, 'google');
    const googleKey = await addGoogleMail(page);

    await mockProvider('microsoft', microsoftKey).addMessage(
      microsoftMessage('msg-ms-1', 'Older Microsoft mail', 'Bob', 4, true),
    );
    await mockProvider('google', googleKey).addMessage(
      googleMessage('msg-g-1', 'Newer Google mail', 'Alice', 1, true),
    );

    backdateLastRefresh(email, 'microsoft', 3);
    backdateLastRefresh(email, 'google', 3);
    await refreshUntilAllowed(page);

    const body = await waitForTodayPayload(page, (b) =>
      b.messages.some((m) => m.subject === 'Newer Google mail'),
    );
    const subjects = body.messages.map((m) => m.subject);
    expect(subjects.indexOf('Newer Google mail')).toBeLessThan(
      subjects.indexOf('Older Microsoft mail'),
    );

    await page.goto('/today');
    const inbox = page.locator('.inbox-panel');
    await expect(inbox.getByRole('button', { name: GOOGLE_ACCOUNT_LABEL }).first()).toBeVisible();
    await expect(
      inbox.getByRole('button', { name: MICROSOFT_ACCOUNT_LABEL }).first(),
    ).toBeVisible();

    const messages = inbox.locator('.message');
    await expect(messages).toHaveCount(2);
    await expect(messages.first()).toContainText('Newer Google mail');

    // The message link opens the provider in a new tab, and the row offers no other action — its
    // only other control is the AccountChip toggle (a filter, not a message action), so exactly
    // one button, never a second one like "mark read" or "delete".
    const firstLink = messages.first().locator('a.message-link');
    await expect(firstLink).toHaveAttribute('target', '_blank');
    await expect(firstLink).toHaveAttribute('href', /mail\.google\.com/);
    await expect(messages.first().locator('button')).toHaveCount(1);
    await expect(messages.first().locator('button.account-chip')).toHaveCount(1);
  });

  test('filtering by account narrows the inbox list and unread count, and a message marked read in the mock drops the count after refresh', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const email = `today-inbox-filter-${crypto.randomUUID()}@example.com`;
    await signUpAndVerify(page, email);

    const microsoftKey = await connect(page, 'microsoft');
    await waitForTodayPayload(page, (b) => b.accounts[0]?.lastRefreshAt !== null);
    await connect(page, 'google');
    const googleKey = await addGoogleMail(page);

    await mockProvider('microsoft', microsoftKey).addMessage(
      microsoftMessage('msg-ms-2', 'Microsoft only', 'Carol', 2, true),
    );
    await mockProvider('google', googleKey).addMessage(
      googleMessage('msg-g-2', 'Google only', 'Dave', 1, true),
    );

    backdateLastRefresh(email, 'microsoft', 3);
    backdateLastRefresh(email, 'google', 3);
    await refreshUntilAllowed(page);
    await waitForTodayPayload(page, (b) => b.messages.length >= 2);

    await page.goto('/today');
    const inbox = page.locator('.inbox-panel');
    await expect(inbox.locator('.message')).toHaveCount(2);
    await expect(inbox.getByText('2 unread')).toBeVisible();

    await inbox.getByRole('button', { name: GOOGLE_ACCOUNT_LABEL }).first().click();
    await expect(inbox.locator('.message')).toHaveCount(1);
    await expect(inbox.locator('.message')).toContainText('Google only');
    await expect(inbox.getByText('1 unread')).toBeVisible();

    // Clear the filter, then prove the mock's markRead drops the (unfiltered) unread count on
    // the next refresh cycle — needs a fresh refresh window and re-backdating (the previous
    // refresh cycle just reset last_refresh_at to "now").
    await inbox.getByRole('button', { name: GOOGLE_ACCOUNT_LABEL }).first().click();
    await mockProvider('google', googleKey).markRead('msg-g-2');
    backdateLastRefresh(email, 'google', 3);
    await refreshUntilAllowed(page);
    await waitForTodayPayload(
      page,
      (b) => (b.messages.find((m) => m.id === 'msg-g-2')?.unread ?? true) === false,
    );

    await page.goto('/today');
    await expect(page.locator('.inbox-panel').getByText('1 unread')).toBeVisible();
  });

  test('a message with no subject renders "(no subject)"', async ({ page }) => {
    test.setTimeout(120_000);
    const email = `today-inbox-nosubject-${crypto.randomUUID()}@example.com`;
    await signUpAndVerify(page, email);
    const microsoftKey = await connect(page, 'microsoft');
    await waitForTodayPayload(page, (b) => b.accounts[0]?.lastRefreshAt !== null);

    await mockProvider('microsoft', microsoftKey).addMessage(
      microsoftMessage('msg-ms-nosubject', '', 'Eve', 1, false),
    );
    backdateLastRefresh(email, 'microsoft', 3);
    await refreshUntilAllowed(page);
    await waitForTodayPayload(page, (b) => b.messages.some((m) => m.id === 'msg-ms-nosubject'));

    await page.goto('/today');
    await expect(page.locator('.inbox-panel').getByText('(no subject)')).toBeVisible();
  });

  test('the Google connect card offers calendar only with panels.google_mail off, and drops the "Gmail is currently disabled" note once it is on', async ({
    page,
  }) => {
    const email = `today-inbox-flag-${crypto.randomUUID()}@example.com`;
    await signUpAndVerify(page, email);

    // panels.google_mail is forced on globally in ci (.github/workflows/ci.yml), so this proves
    // the off case with a per-user override (the same mechanism connections.spec.ts's
    // "panels.today flag off" case uses), then flips it back on for the same user.
    setUserFlag(email, 'panels.google_mail', 'off');
    await page.goto('/settings/connections');
    const googleCard = page.locator('.provider-card', {
      has: page.getByRole('heading', { level: 3, name: 'Google' }),
    });
    await expect(
      googleCard.getByText('Gmail is currently disabled', { exact: false }),
    ).toBeVisible();
    await expect(googleCard.getByRole('button', { name: 'Connect Calendar' })).toBeVisible();

    setUserFlag(email, 'panels.google_mail', 'on');
    await page.goto('/settings/connections');
    await expect(googleCard.getByText('Gmail is currently disabled', { exact: false })).toHaveCount(
      0,
    );

    await axeCheck(page);
  });
});
