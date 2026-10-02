import { expect, test, type Page } from '@playwright/test';
import { signUpAndVerify, axeCheck, mockProvider } from '../fixtures/index.js';

/**
 * T066 (ci): the standards-based connect form (IMAP + CalDAV, T072) against the IMAP and CalDAV
 * mocks (infra/mocks/src/imap.ts, caldav.ts). The compose api sets STANDARDS_ALLOW_PRIVATE_HOSTS,
 * which lets the form reach the private mocks host and its http CalDAV URL (off in production).
 * Locators follow StandardsForm.vue: the standards card's "Add another provider" button opens
 * it; submit reads "Connect" ("Reconnect" in reconnect mode).
 */

const IMAP_HOST = process.env['IMAP_TEST_HOST'] ?? 'mocks';
// The api dials the IMAP mock inside the compose network, where it listens on the standard
// plaintext port (IMAP_MOCK_PORT=143 in infra/docker-compose.yml); FR-017 allows only 993 or 143.
const IMAP_PORT = '143';
const CALDAV_URL = process.env['CALDAV_TEST_URL'] ?? 'http://mocks:4000/caldav/dav/';
const IMAP_PASSWORD = 'app-password'; // infra/mocks/src/imap.ts's fixed accepted password

async function openStandardsForm(page: Page): Promise<void> {
  await page.goto('/settings/connections');
  await page.getByRole('button', { name: 'Add another provider' }).click();
}

test.describe('Standards-based connect form @ci', () => {
  test('a preset fills IMAP host, port and CalDAV URL', async ({ page }) => {
    const email = `standards-preset-${crypto.randomUUID()}@example.com`;
    await signUpAndVerify(page, email);
    await openStandardsForm(page);

    await page.getByLabel('Preset').selectOption('fastmail');

    await expect(page.getByLabel('IMAP host')).toHaveValue('imap.fastmail.com');
    await expect(page.getByLabel('IMAP port')).toHaveValue('993');
    // packages/connectors/src/panels/presets.ts's fastmail preset — Fastmail's real published
    // CalDAV URL includes the /dav/ path.
    await expect(page.getByLabel('CalDAV URL')).toHaveValue('https://caldav.fastmail.com/dav/');
  });

  test('a wrong password shows the login-step error', async ({ page }) => {
    const email = `standards-wrongpass-${crypto.randomUUID()}@example.com`;
    await signUpAndVerify(page, email);
    await openStandardsForm(page);

    await page.getByLabel('Address').fill(email);
    await page.getByLabel('App password').fill('definitely-wrong');
    await page.getByLabel('Mail', { exact: true }).check();
    await page.getByLabel('IMAP host').fill(IMAP_HOST);
    await page.getByLabel('IMAP port').fill(IMAP_PORT);
    await page.getByRole('button', { name: 'Connect', exact: true }).click();

    await expect(
      page.getByText('address or app password was rejected', { exact: false }),
    ).toBeVisible();
  });

  test('success lands on Settings with the new account, and the mocks feed both panels the same as the dedicated providers', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const email = `standards-success-${crypto.randomUUID()}@example.com`;
    await signUpAndVerify(page, email);
    const address = `standards-${crypto.randomUUID()}@example.test`;

    await openStandardsForm(page);
    await page.getByLabel('Address').fill(address);
    await page.getByLabel('App password').fill(IMAP_PASSWORD);
    await page.getByLabel('Mail', { exact: true }).check();
    await page.getByLabel('Calendar', { exact: true }).check();
    await page.getByLabel('IMAP host').fill(IMAP_HOST);
    await page.getByLabel('IMAP port').fill(IMAP_PORT);
    await page.getByLabel('CalDAV URL').fill(CALDAV_URL);
    await page.getByRole('button', { name: 'Connect', exact: true }).click();

    await expect(page).toHaveURL(/\/settings\/connections/);
    await expect(page.locator('.account-card')).toContainText(address);

    await mockProvider('imap').addMessage(address, {
      from: 'sender@example.test',
      subject: 'Standards inbox message',
      body: 'hello',
      date: new Date().toISOString(),
      seen: false,
    });

    await page.goto('/today');
    await expect(page.getByText('Standards inbox message')).toBeVisible({ timeout: 60_000 });
  });

  test('reconnect asks only for a new app password', async ({ page }) => {
    test.setTimeout(120_000);
    const email = `standards-reconnect-${crypto.randomUUID()}@example.com`;
    await signUpAndVerify(page, email);
    const address = `standards-reconnect-${crypto.randomUUID()}@example.test`;

    await openStandardsForm(page);
    await page.getByLabel('Address').fill(address);
    await page.getByLabel('App password').fill(IMAP_PASSWORD);
    await page.getByLabel('Mail', { exact: true }).check();
    await page.getByLabel('IMAP host').fill(IMAP_HOST);
    await page.getByLabel('IMAP port').fill(IMAP_PORT);
    await page.getByRole('button', { name: 'Connect', exact: true }).click();
    await expect(page.locator('.account-card')).toContainText(address);

    // The mailbox's app password is rotated, so the next refresh fails LOGIN and the account
    // needs reconnecting; only then does the card offer Reconnect.
    await mockProvider('imap').setPassword(address, 'new-app-password-123');
    const csrf = (await page.context().cookies()).find((c) => c.name === '__Host-desk_csrf')?.value;
    const { accounts } = (await (await page.request.get('/connections')).json()) as {
      accounts: { id: string; address: string }[];
    };
    const accountId = accounts.find((a) => a.address === address)!.id;
    const refresh = await page.request.post(`/connections/${accountId}/refresh`, {
      headers: { 'x-csrf-token': csrf ?? '' },
    });
    expect(refresh.status()).toBe(202);
    await expect(async () => {
      await page.reload();
      await expect(page.getByRole('button', { name: 'Reconnect' })).toBeVisible({ timeout: 1000 });
    }).toPass({ timeout: 30_000 });

    await page.getByRole('button', { name: 'Reconnect' }).click();
    await expect(page.getByLabel('Address')).toHaveCount(0);
    await expect(page.getByText(address)).toBeVisible();
    await page.getByLabel('App password').fill('new-app-password-123');
    await page.locator('form').getByRole('button', { name: 'Reconnect', exact: true }).click();

    await expect(page.locator('.account-status')).not.toContainText('Reconnect needed');
  });

  test('axe clean on the standards form', async ({ page }) => {
    const email = `standards-axe-${crypto.randomUUID()}@example.com`;
    await signUpAndVerify(page, email);
    await openStandardsForm(page);
    await axeCheck(page);
  });
});
