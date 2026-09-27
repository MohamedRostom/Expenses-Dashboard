import { execSync } from 'node:child_process';
import { expect, test, type Page } from '@playwright/test';
import { signUpAndVerify, mockProvider, nextMockAccount } from '../fixtures/index.js';

/**
 * T075 (ci): browser-level complement to the ownership matrix (apps/api/test/ownership.test.ts,
 * T009) — two users, each with their own mock Google account, proving user B's browser never
 * renders user A's chips, events or messages on /today or /settings/connections (SC-003), plus
 * FR-006's "the month view makes no request to /today".
 *
 * Both mock accounts resolve to the exact same address (infra/mocks/src/google.ts's
 * `fakeIdToken` is hardcoded to 'mock-google-user@example.test' regardless of the reserved mock
 * key), so this can't tell the two accounts apart by label/address text — only by the
 * per-test event/message titles and by row counts, which is what every assertion below uses.
 */

const DB_URL = process.env['DATABASE_URL'] ?? 'postgres://desk:desk@localhost:5432/desk';

async function connectGoogle(page: Page): Promise<string> {
  const key = await nextMockAccount('google');
  await page.goto('/settings/connections');
  await page.getByRole('button', { name: 'Connect Calendar' }).click();
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

type TodayPayload = {
  days: { events: { title: string }[] }[];
  accounts: { id: string }[];
};

async function refreshUntilAllowed(page: Page, timeoutMs = 90_000): Promise<void> {
  await expect(async () => {
    const res = await page.request.post('/panels/today/refresh', {
      headers: await csrfHeaders(page),
    });
    expect(res.status(), `refresh response body: ${await res.text()}`).toBe(202);
  }).toPass({ timeout: timeoutMs, intervals: [2000, 5000, 10000] });
}

async function waitForOwnEvent(page: Page, title: string, timeoutMs = 40_000): Promise<void> {
  await refreshUntilAllowed(page);
  await expect(async () => {
    const body = (await (await page.request.get('/panels/today')).json()) as TodayPayload;
    const titles = body.days.flatMap((d) => d.events.map((e) => e.title));
    expect(titles).toContain(title);
  }).toPass({ timeout: timeoutMs, intervals: [1000, 2000, 3000] });
}

test.describe('Panel isolation between users @ci', () => {
  test("user B never sees user A's events, messages or accounts on /today or /settings/connections", async ({
    browser,
  }) => {
    test.setTimeout(180_000);

    const contextA = await browser.newContext();
    const pageA = await contextA.newPage();
    const emailA = `isolation-alice-${crypto.randomUUID()}@example.com`;
    await signUpAndVerify(pageA, emailA);
    const keyA = await connectGoogle(pageA);
    await mockProvider('google', keyA).addEvent('primary', {
      id: 'evt-alice-only',
      summary: 'OnlyForAlice',
      start: { dateTime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() },
      end: { dateTime: new Date(Date.now() + 25 * 60 * 60 * 1000).toISOString() },
    });
    await mockProvider('google', keyA).addMessage({
      id: 'msg-alice-only',
      labelIds: ['UNREAD'],
      snippet: 'preview',
      internalDate: String(Date.now()),
      payload: { headers: [{ name: 'Subject', value: 'AliceMailOnly' }] },
    });
    backdateLastRefresh(emailA, 'google', 3);
    await waitForOwnEvent(pageA, 'OnlyForAlice');

    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();
    const emailB = `isolation-bob-${crypto.randomUUID()}@example.com`;
    await signUpAndVerify(pageB, emailB);
    const keyB = await connectGoogle(pageB);
    await mockProvider('google', keyB).addEvent('primary', {
      id: 'evt-bob-only',
      summary: 'OnlyForBob',
      start: { dateTime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() },
      end: { dateTime: new Date(Date.now() + 25 * 60 * 60 * 1000).toISOString() },
    });
    backdateLastRefresh(emailB, 'google', 3);
    await waitForOwnEvent(pageB, 'OnlyForBob');

    // API-level proof: B's own payload never contains A's data.
    const bodyB = (await (await pageB.request.get('/panels/today')).json()) as TodayPayload;
    const titlesB = bodyB.days.flatMap((d) => d.events.map((e) => e.title));
    expect(titlesB).not.toContain('OnlyForAlice');
    expect(bodyB.accounts).toHaveLength(1);

    // Browser-level proof: nothing of Alice's renders on Bob's Today or Settings pages.
    await pageB.goto('/today');
    await expect(pageB.getByText('OnlyForBob')).toBeVisible();
    await expect(pageB.getByText('OnlyForAlice')).toHaveCount(0);
    await expect(pageB.getByText('AliceMailOnly')).toHaveCount(0);
    // AccountChip renders once per account in the top strip (CalendarPanel.vue's
    // `.account-chips`) AND again per event in that event's footer, so `.account-chip` alone
    // double-counts a single account with one event — scope to the strip to count accounts.
    await expect(pageB.locator('.calendar-panel .account-chips .account-chip')).toHaveCount(1);

    await pageB.goto('/settings/connections');
    await expect(pageB.locator('.account-card')).toHaveCount(1);

    await contextA.close();
    await contextB.close();
  });

  test('the month view makes no request to /panels/today', async ({ page }) => {
    const email = `isolation-monthview-${crypto.randomUUID()}@example.com`;
    await signUpAndVerify(page, email);

    const requestedUrls: string[] = [];
    page.on('request', (req) => requestedUrls.push(req.url()));

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    expect(requestedUrls.some((u) => u.includes('/panels/today'))).toBe(false);
  });
});
