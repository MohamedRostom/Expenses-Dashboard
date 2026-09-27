import { execSync } from 'node:child_process';
import { expect, test, type Page } from '@playwright/test';
import { signUpAndVerify, axeCheck, mockProvider, nextMockAccount } from '../fixtures/index.js';
import { PROVIDER_PRIVACY_TEXT } from '../../../packages/contracts/src/privacy-text.js';

const DB_URL = process.env['DATABASE_URL'] ?? 'postgres://desk:desk@localhost:5432/desk';
const GOOGLE_ACCOUNT_LABEL = 'mock-google-user@example.test';

async function connect(page: Page, provider: 'google' | 'microsoft'): Promise<string> {
  const key = await nextMockAccount(provider);
  await page.goto('/settings/connections');
  const buttonName = provider === 'google' ? 'Connect Calendar' : 'Connect Microsoft';
  await page.getByRole('button', { name: buttonName }).click();
  await page.waitForURL(/\/settings\/connections\?connected=/);
  return key;
}

async function csrfHeaders(page: Page): Promise<Record<string, string>> {
  const cookies = await page.context().cookies();
  const csrf = cookies.find((c) => c.name === '__Host-desk_csrf')?.value;
  if (!csrf) throw new Error('csrfHeaders: no __Host-desk_csrf cookie yet — visit a page first');
  return { 'x-csrf-token': csrf };
}

function backdateLastRefresh(email: string, provider: string, minutesAgo: number): void {
  execSync(`pnpm --filter @desk/db backdate-refresh "${email}" "${provider}" ${minutesAgo}`, {
    env: { ...process.env, DATABASE_URL: DB_URL },
    stdio: 'pipe',
  });
}

function seedDummyAccounts(email: string, count: number): void {
  execSync(`pnpm --filter @desk/db seed-dummy-accounts "${email}" ${count}`, {
    env: { ...process.env, DATABASE_URL: DB_URL },
    stdio: 'pipe',
  });
}

type ConnectionsPayload = {
  accounts: {
    id: string;
    label: string;
    colour: string;
    status: string;
    lastRefreshAt: string | null;
  }[];
  limit: number;
};

async function getConnections(page: Page): Promise<ConnectionsPayload> {
  const res = await page.request.get('/connections');
  if (!res.ok()) throw new Error(`GET /connections: ${res.status()}`);
  return (await res.json()) as ConnectionsPayload;
}

async function refreshUntilAllowed(page: Page, timeoutMs = 90_000): Promise<void> {
  await expect(async () => {
    const res = await page.request.post('/panels/today/refresh', {
      headers: await csrfHeaders(page),
    });
    expect(res.status(), `refresh response body: ${await res.text()}`).toBe(202);
  }).toPass({ timeout: timeoutMs, intervals: [2000, 5000, 10000] });
}

async function waitForAccountStatus(
  page: Page,
  status: string,
  timeoutMs = 40_000,
): Promise<ConnectionsPayload> {
  let last: ConnectionsPayload | undefined;
  await expect(async () => {
    const body = await getConnections(page);
    last = body;
    expect(body.accounts[0]?.status).toBe(status);
  }).toPass({ timeout: timeoutMs, intervals: [1000, 2000, 3000] });
  return last as ConnectionsPayload;
}

/** Polls until the account has a `lastRefreshAt`, or (with `eventTitle`) until that title shows
 * up in /panels/today's days — the panels.refresh job runs asynchronously after the 202, so a
 * bare "wait for 202" isn't proof the cache is populated yet. */
async function waitForRefreshed(
  page: Page,
  eventTitle?: string,
  timeoutMs = 40_000,
): Promise<void> {
  await expect(async () => {
    if (eventTitle) {
      const res = await page.request.get('/panels/today');
      const body = (await res.json()) as {
        days: { events: { title: string }[] }[];
      };
      const titles = body.days.flatMap((d) => d.events.map((e) => e.title));
      expect(titles).toContain(eventTitle);
    } else {
      const body = await getConnections(page);
      expect(body.accounts[0]?.lastRefreshAt ?? null).not.toBeNull();
    }
  }).toPass({ timeout: timeoutMs, intervals: [1000, 2000, 3000] });
}

/**
 * T010: Connections page tests (ci project)
 * - Lists providers based on flags
 * - Shows empty states for panels when no accounts are connected
 * - Verifies accessibility on both /today and /settings/connections
 * - Tests flag-gated access (panels.today off -> redirect to /)
 */

test.describe('Connections and Today pages @ci', () => {
  test('displays /settings/connections with providers list', async ({ page }) => {
    const email = `connections-test-${crypto.randomUUID()}@example.com`;
    await signUpAndVerify(page, email);
    await page.goto('/settings/connections');

    // Verify we're on the connections page
    await expect(page).toHaveURL('/settings/connections');

    // Providers are filtered by flags; all on in e2e-ci per T004
    await expect(page.getByRole('heading', { level: 2, name: 'Add a Provider' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 3, name: 'Google' })).toBeVisible();

    // Verify axe accessibility
    await axeCheck(page);
  });

  test('displays /today with empty panel states when no accounts are connected', async ({
    page,
  }) => {
    const email = `today-test-${crypto.randomUUID()}@example.com`;
    await signUpAndVerify(page, email);
    await page.goto('/today');

    // Verify we're on the today page
    await expect(page).toHaveURL('/today');

    // Both panels' no-accounts copy, which only renders once GET /panels/today has loaded
    // (not the error state a failed fetch would show)
    const calendarEmpty = page.getByText('No calendar accounts connected.', { exact: false });
    const inboxEmpty = page.getByText('No mail accounts connected.', { exact: false });
    await expect(calendarEmpty).toBeVisible();
    await expect(inboxEmpty).toBeVisible();

    // A hard reload of /today must serve the page, not the API's JSON
    await page.reload();
    await expect(calendarEmpty).toBeVisible();

    // Verify axe accessibility
    await axeCheck(page);
  });

  test('panels.today flag off: no nav entry and routes redirect to /', async ({ page }) => {
    const email = `flag-off-test-${crypto.randomUUID()}@example.com`;
    await signUpAndVerify(page, email);

    // Disable panels.today for this user via the flags CLI against the compose database.
    const dbUrl = process.env['DATABASE_URL'] ?? 'postgres://desk:desk@localhost:5432/desk';
    execSync(`pnpm --filter @desk/db flags set panels.today --user "${email}" off`, {
      env: { ...process.env, DATABASE_URL: dbUrl },
    });

    // Navigate to home and verify no "Today" nav entry
    await page.goto('/');
    const todayLink = page.getByRole('link', { name: /today/i });
    const todayLinkCount = await todayLink.count();
    expect(todayLinkCount).toBe(0);

    // Verify /today redirects to /
    await page.goto('/today');
    await expect(page).toHaveURL('/');

    // Verify /settings/connections redirects to /
    await page.goto('/settings/connections');
    await expect(page).toHaveURL('/');
  });

  test('T057: account card shows provider, address, capabilities, status and last refresh', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const email = `connections-details-${crypto.randomUUID()}@example.com`;
    await signUpAndVerify(page, email);
    await connect(page, 'google');
    await waitForRefreshed(page);
    backdateLastRefresh(email, 'google', 3);
    await refreshUntilAllowed(page);
    await waitForRefreshed(page);

    await page.goto('/settings/connections');
    const card = page.locator('.account-card').first();
    await expect(card).toContainText('Google');
    await expect(card).toContainText(GOOGLE_ACCOUNT_LABEL);
    await expect(card).toContainText('calendar');
    await expect(card).toContainText('Connected');
    await expect(card).toContainText('Last refresh');

    await axeCheck(page);
  });

  test('T057: rename and recolour reflect in the Today chips', async ({ page }) => {
    test.setTimeout(120_000);
    const email = `connections-rename-${crypto.randomUUID()}@example.com`;
    await signUpAndVerify(page, email);
    await connect(page, 'google');

    await page.goto('/settings/connections');
    const card = page.locator('.account-card').first();
    const labelInput = card.getByLabel('Account label');
    await labelInput.fill('Personal Google');
    await labelInput.blur();
    await expect(card.locator('.provider')).toBeVisible();

    // Colour radio group: swatches are named by PALETTE_COLOURS (packages/ui/src/palette.ts);
    // pick a colour other than the default (teal is first/default for a newly connected account).
    await card.getByRole('radio', { name: 'Violet' }).click();
    await expect(card.getByRole('radio', { name: 'Violet' })).toHaveAttribute(
      'aria-checked',
      'true',
    );

    const connections = await getConnections(page);
    expect(connections.accounts[0]?.label).toBe('Personal Google');
    expect(connections.accounts[0]?.colour).toBe('violet');

    await page.goto('/today');
    await expect(
      page.locator('.calendar-panel').getByRole('button', { name: 'Personal Google' }).first(),
    ).toBeVisible();
  });

  test('T057: pausing an account hides its events from the calendar panel until resumed', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const email = `connections-pause-${crypto.randomUUID()}@example.com`;
    await signUpAndVerify(page, email);
    const key = await connect(page, 'google');
    await waitForRefreshed(page);

    await mockProvider('google', key).addEvent('primary', {
      id: 'evt-pause-test',
      summary: 'Should hide while paused',
      start: { dateTime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() },
      end: { dateTime: new Date(Date.now() + 25 * 60 * 60 * 1000).toISOString() },
    });
    backdateLastRefresh(email, 'google', 3);
    await refreshUntilAllowed(page);
    await waitForRefreshed(page, 'Should hide while paused');
    await page.goto('/today');
    await expect(page.getByText('Should hide while paused')).toBeVisible();

    await page.goto('/settings/connections');
    await page.getByRole('button', { name: 'Pause' }).click();
    await expect(page.locator('.account-status')).toContainText('Paused');

    // Paused accounts contribute neither events nor messages to the Today payload (FR-012,
    // apps/api/src/services/panels.ts todayPayload) — no refresh needed to observe this, it's
    // filtered out of the very next GET.
    await page.goto('/today');
    await expect(page.getByText('Should hide while paused')).toHaveCount(0);

    await page.goto('/settings/connections');
    await page.getByRole('button', { name: 'Resume' }).click();
    await expect(page.locator('.account-status')).toContainText('Connected');

    backdateLastRefresh(email, 'google', 3);
    await refreshUntilAllowed(page);
    await waitForRefreshed(page, 'Should hide while paused');
    await page.goto('/today');
    await expect(page.getByText('Should hide while paused')).toBeVisible();
  });

  test('T057: revoking via the mock shows "reconnect needed" and a per-account reconnect prompt in both panels, with the account marked stale', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const email = `connections-revoke-${crypto.randomUUID()}@example.com`;
    await signUpAndVerify(page, email);
    const key = await connect(page, 'microsoft');
    await waitForRefreshed(page);

    await mockProvider('microsoft', key).revoke();
    backdateLastRefresh(email, 'microsoft', 3);
    await refreshUntilAllowed(page);
    await waitForAccountStatus(page, 'reconnect_needed');

    await page.goto('/settings/connections');
    await expect(page.locator('.account-status')).toContainText('Reconnect needed');
    await expect(
      page.getByText('Access was revoked at the provider', { exact: false }),
    ).toBeVisible();

    await page.goto('/today');
    const mockLabel = 'mock-graph-user@example.test';
    await expect(
      page.locator('.calendar-panel').getByText(`${mockLabel} needs reconnecting.`),
    ).toBeVisible();
    await expect(
      page.locator('.inbox-panel').getByText(`${mockLabel} needs reconnecting.`),
    ).toBeVisible();
    await expect(
      page.locator('.calendar-panel').getByText('Last refreshed', { exact: false }),
    ).toBeVisible();

    await axeCheck(page);
  });

  test("T057: disconnecting removes an account's items from both panels", async ({ page }) => {
    test.setTimeout(120_000);
    const email = `connections-disconnect-${crypto.randomUUID()}@example.com`;
    await signUpAndVerify(page, email);
    const key = await connect(page, 'google');
    await waitForRefreshed(page);

    await mockProvider('google', key).addEvent('primary', {
      id: 'evt-disconnect-test',
      summary: 'Goes away on disconnect',
      start: { dateTime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() },
      end: { dateTime: new Date(Date.now() + 25 * 60 * 60 * 1000).toISOString() },
    });
    backdateLastRefresh(email, 'google', 3);
    await refreshUntilAllowed(page);
    await waitForRefreshed(page, 'Goes away on disconnect');
    await page.goto('/today');
    await expect(page.getByText('Goes away on disconnect')).toBeVisible();

    await page.goto('/settings/connections');
    await page.getByRole('button', { name: 'Disconnect' }).click();
    await page
      .getByRole('dialog', { name: 'Disconnect account' })
      .getByRole('button', {
        name: 'Disconnect',
      })
      .click();
    await expect(page.locator('.account-card')).toHaveCount(0);

    await page.goto('/today');
    await expect(page.getByText('Goes away on disconnect')).toHaveCount(0);
    await expect(page.getByText('No calendar accounts connected.', { exact: false })).toBeVisible();
  });

  test('T057: the eleventh connect is disabled with the limit shown, and disconnecting one re-enables it', async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const email = `connections-limit-${crypto.randomUUID()}@example.com`;
    await signUpAndVerify(page, email);
    seedDummyAccounts(email, 10);

    await page.goto('/settings/connections');
    await expect(
      page.getByText('You can connect up to 10 accounts.', { exact: false }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Connect Calendar' })).toBeDisabled();

    await page.getByRole('button', { name: 'Disconnect' }).first().click();
    await page
      .getByRole('dialog', { name: 'Disconnect account' })
      .getByRole('button', {
        name: 'Disconnect',
      })
      .click();
    await expect(page.locator('.account-card')).toHaveCount(9);
    await expect(
      page.getByText('You can connect up to 10 accounts.', { exact: false }),
    ).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Connect Calendar' })).toBeEnabled();
  });

  test('T057: deleting an account leaves no trace', async ({ page }) => {
    test.setTimeout(120_000);
    const email = `connections-delete-${crypto.randomUUID()}@example.com`;
    await signUpAndVerify(page, email);
    await connect(page, 'google');

    await page.goto('/settings/connections');
    await page.getByRole('button', { name: 'Disconnect' }).click();
    await page
      .getByRole('dialog', { name: 'Disconnect account' })
      .getByRole('button', {
        name: 'Disconnect',
      })
      .click();

    await page.reload();
    await expect(page.locator('.account-card')).toHaveCount(0);
    const connections = await getConnections(page);
    expect(connections.accounts).toHaveLength(0);
  });

  // T073/FR-016: the connect card renders the shared privacy text the landing privacy page also
  // renders (packages/contracts/src/privacy-text.ts), so the two cannot drift apart.
  test("T057: the connect card's privacy text is the shared per-provider text (T073)", async ({
    page,
  }) => {
    await signUpAndVerify(page, `privacy-${crypto.randomUUID()}@example.com`);
    await page.goto('/settings/connections');
    const card = page.locator('.provider-card').filter({ hasText: 'Microsoft' });
    await card.getByText('What Desk reads and stores').click();
    const text = PROVIDER_PRIVACY_TEXT.microsoft;
    await expect(card.locator('dd.reads')).toHaveText(text.reads);
    await expect(card.locator('dd.revoke')).toHaveText(text.revoke);
    await expect(card.locator('dd.scopes li')).toHaveText(text.scopes);
  });
});
