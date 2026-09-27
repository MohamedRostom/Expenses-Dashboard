import { execSync } from 'node:child_process';
import { expect, test, type Page } from '@playwright/test';
import { signUpAndVerify, axeCheck, mockProvider, nextMockAccount } from '../fixtures/index.js';

/**
 * T029 (ci, calendar): the Today page's calendar panel against the fake Google and Graph
 * servers (infra/mocks/src/google.ts, graph.ts) driven through the real connect flow
 * (/connections/:provider/start -> mock authorize -> /connections/:provider/callback), not by
 * seeding the database directly.
 *
 * Timing notes (read before touching the timeouts below):
 * - `POST /panels/today/refresh` is rate-limited to once per minute per user
 *   (apps/api/src/routes/today.ts) — a test that needs a second refresh cycle for the same
 *   account polls with `refreshUntilAllowed` instead of a fixed sleep.
 * - A user-triggered refresh (POST /panels/today/refresh, including the on-open one /today
 *   fires when data is older than two minutes) kicks the job runner at once (T086,
 *   apps/api/src/lib/kick-jobs.ts), so SC-002's on-open half is asserted with the literal 10s.
 *   Other waits keep a wider default: the first refresh after connecting runs on the api's
 *   30s JOB_TICK_MS tick.
 */

const DB_URL = process.env['DATABASE_URL'] ?? 'postgres://desk:desk@localhost:5432/desk';

const GOOGLE_ACCOUNT_LABEL = 'mock-google-user@example.test';
const MICROSOFT_ACCOUNT_LABEL = 'mock-graph-user@example.test';

/** Reserves a fresh, isolated mock account (T087) before driving the real connect flow, and
 * returns its key so this test's mockProvider(provider, key) calls only ever touch its own
 * account's events — never another test's, even when this file runs in parallel. */
async function connect(page: Page, provider: 'google' | 'microsoft'): Promise<string> {
  const key = await nextMockAccount(provider);
  await page.goto('/settings/connections');
  const buttonName = provider === 'google' ? 'Connect Calendar' : 'Connect Microsoft';
  await page.getByRole('button', { name: buttonName }).click();
  await page.waitForURL(/\/settings\/connections\?connected=/);
  return key;
}

/** Reads the double-submit CSRF cookie the app sets on any GET, for a page.request POST. */
async function csrfHeaders(page: Page): Promise<Record<string, string>> {
  const cookies = await page.context().cookies();
  const csrf = cookies.find((c) => c.name === '__Host-desk_csrf')?.value;
  if (!csrf) throw new Error('csrfHeaders: no __Host-desk_csrf cookie yet — visit a page first');
  return { 'x-csrf-token': csrf };
}

type TodayPayload = {
  days: { date: string; events: { id: string; title: string; accountId: string }[] }[];
  accounts: {
    id: string;
    label: string;
    status: string;
    lastRefreshAt: string | null;
    stale: boolean;
    purged: boolean;
  }[];
};

async function getTodayPayload(page: Page): Promise<TodayPayload> {
  const res = await page.request.get('/panels/today');
  if (!res.ok()) throw new Error(`GET /panels/today: ${res.status()}`);
  return (await res.json()) as TodayPayload;
}

/** POSTs the refresh endpoint once it's allowed (the endpoint is 1-per-minute per user), rather
 * than sleeping a fixed duration — polls the real rate-limiter state. */
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

/** Waits until the account's last_refresh_at stops changing between two consecutive polls.
 * The panels.refresh job writes cached_events before it writes last_refresh_at
 * (apps/api/src/jobs/panels-refresh.ts), so a poll can observe new events while the same job is
 * still mid-flight; backdating last_refresh_at again right then loses the race against the
 * job's own final "set last_refresh_at = now" write. Waiting for it to settle avoids that race
 * before a test asks for a second refresh cycle. */
async function waitForRefreshToSettle(page: Page, timeoutMs = 15_000): Promise<void> {
  let previous: string | null | undefined;
  await expect(async () => {
    const body = await getTodayPayload(page);
    const current = body.accounts[0]?.lastRefreshAt ?? null;
    const stable = previous !== undefined && previous === current;
    previous = current;
    expect(stable).toBe(true);
  }).toPass({ timeout: timeoutMs, intervals: [800, 1500] });
}

function eventTitles(body: TodayPayload): string[] {
  return body.days.flatMap((d) => d.events.map((e) => e.title));
}

/** Sets a connected account's cached last_refresh_at into the past (packages/db's
 * backdate-refresh CLI), so a test can prove staleness behaviour without waiting for real time
 * to pass or adding a clock override to the running api service. */
function backdateLastRefresh(email: string, provider: string, minutesAgo: number): void {
  execSync(`pnpm --filter @desk/db backdate-refresh "${email}" "${provider}" ${minutesAgo}`, {
    env: { ...process.env, DATABASE_URL: DB_URL },
    stdio: 'pipe',
  });
}

/** T058: there is no clock-override route on the mocks or the running api (checked — the mocks'
 * clock control is per provider-account fake data, not the api's own JobRunner), so this drives
 * the same end state `panels.purge` (apps/api/src/jobs/panels-purge.ts) leaves directly against
 * the compose database via a small test-only CLI (packages/db/src/purge-idle-cli.ts): backdates
 * `users.last_active_at` past the 30-day idle cutoff, deletes the user's cached_events and
 * cached_messages, and sets `connected_accounts.cache_purged_at`, exactly as the real job does
 * (its own JobRunner bookkeeping and audit row aren't observable from here, so aren't simulated). */
function simulateIdlePurge(email: string): void {
  execSync(`pnpm --filter @desk/db purge-idle "${email}"`, {
    env: { ...process.env, DATABASE_URL: DB_URL },
    stdio: 'pipe',
  });
}

function isoAt(daysFromNow: number, hourUtc: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysFromNow);
  d.setUTCHours(hourUtc, 0, 0, 0);
  return d.toISOString();
}

function dateOnly(daysFromNow: number): string {
  return isoAt(daysFromNow, 0).slice(0, 10);
}

function googleEvent(id: string, title: string, daysFromNow: number) {
  return {
    id,
    summary: title,
    location: 'Meeting room 1',
    start: { dateTime: isoAt(daysFromNow, 10) },
    end: { dateTime: isoAt(daysFromNow, 11) },
  };
}

test.describe('Today calendar panel @ci', () => {
  test('shows the empty state when no calendar accounts are connected, axe clean', async ({
    page,
  }) => {
    const email = `today-empty-${crypto.randomUUID()}@example.com`;
    await signUpAndVerify(page, email);
    await page.goto('/today');

    await expect(page.getByText('No calendar accounts connected.', { exact: false })).toBeVisible();

    await page.setViewportSize({ width: 360, height: 800 });
    await axeCheck(page);
    await page.setViewportSize({ width: 1280, height: 800 });
    await axeCheck(page);
  });

  test('shows a loading skeleton while the panel fetches, axe clean', async ({ page }) => {
    const email = `today-loading-${crypto.randomUUID()}@example.com`;
    await signUpAndVerify(page, email);

    // Delay the payload response just long enough to reliably observe the loading skeleton
    // before it resolves — a route-level delay on this one response, not a test-wide sleep.
    // Fulfils a synthetic empty payload rather than route.continue()-ing the real request:
    // holding a real proxied request open for a second while it's `continue()`-d let Chrome
    // treat it as needing a retry under load, redispatching it through the same handler and
    // throwing "Route is already handled!" on the second continue(). Fulfilling never touches
    // the real backend, so there's nothing to retry.
    await page.route('**/panels/today', async (route) => {
      await new Promise((r) => setTimeout(r, 1000));
      await route.fulfill({
        json: { days: [], messages: [], accounts: [], generatedAt: new Date().toISOString() },
      });
    });

    await page.goto('/today');
    await expect(page.locator('.calendar-panel .desk-skeleton').first()).toBeVisible();

    await page.setViewportSize({ width: 360, height: 800 });
    await axeCheck(page);
    await page.setViewportSize({ width: 1280, height: 800 });
    await axeCheck(page);
  });

  test('shows an error state when offline, axe clean', async ({ page }) => {
    const email = `today-error-${crypto.randomUUID()}@example.com`;
    await signUpAndVerify(page, email);
    await page.goto('/today');

    // context.setOffline(true) blocks every request, including the reload's own navigation, so
    // page.reload() would throw net::ERR_INTERNET_DISCONNECTED before the SPA ever got a chance
    // to render its offline copy. Instead, fail only the panel's own fetch and force
    // navigator.onLine to false (apps/web/src/utils/errors.ts's toPanelErrorKind reads it) —
    // the page's own HTML/JS still loads normally, as it would for a real "API unreachable,
    // rest of the app fine" offline experience.
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'onLine', { get: () => false });
    });
    await page.route('**/panels/today', (route) => route.abort('internetdisconnected'));
    await page.reload();
    // Both panels share this one endpoint, so both go into the error state — any one proves it.
    await expect(page.getByRole('alert').first()).toBeVisible();

    await page.setViewportSize({ width: 360, height: 800 });
    await axeCheck(page);
    await page.setViewportSize({ width: 1280, height: 800 });
    await axeCheck(page);

    await page.unroute('**/panels/today');
  });

  test('a Google event appears after POST /panels/today/refresh with the right account chip, a recurring event shows once per day, and deleting it removes it', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const email = `today-google-${crypto.randomUUID()}@example.com`;
    await signUpAndVerify(page, email);
    const key = await connect(page, 'google');

    // Wait for the connect-time auto-refresh job to finish discovering calendars before adding
    // events and asking for another refresh — avoids two jobs racing to create the same
    // account_calendars row.
    await waitForTodayPayload(page, (body) => body.accounts[0]?.lastRefreshAt !== null);

    await mockProvider('google', key).addEvent(
      'primary',
      googleEvent('evt-team-sync', 'Team sync', 1),
    );
    // "a recurring event shows once per day": three daily instances, one per day, same title —
    // this is how the real Google API represents a recurring series once expanded
    // (events.list with singleEvents=true, per T031), so the fake models it the same way.
    await mockProvider('google', key).addEvent(
      'primary',
      googleEvent('evt-standup-0', 'Daily standup', 0),
    );
    await mockProvider('google', key).addEvent(
      'primary',
      googleEvent('evt-standup-1', 'Daily standup', 1),
    );
    await mockProvider('google', key).addEvent(
      'primary',
      googleEvent('evt-standup-2', 'Daily standup', 2),
    );

    // markDue (apps/api/src/services/panels.ts) only enqueues a refresh for accounts whose
    // last_refresh_at is null or older than 2 minutes — the connect-time job just set it to
    // "now", so without backdating, this POST would be a accepted no-op (queued: []).
    backdateLastRefresh(email, 'google', 3);
    const resFirst = await page.request.post('/panels/today/refresh', {
      headers: await csrfHeaders(page),
    });
    expect(resFirst.status()).toBe(202);

    // Wait for every event added above, not just the first: a tick-driven refresh can land
    // between the mock adds and return a payload holding only some of them.
    const body = await waitForTodayPayload(
      page,
      (b) =>
        eventTitles(b).includes('Team sync') &&
        eventTitles(b).filter((t) => t === 'Daily standup').length >= 3,
    );

    for (const day of [dateOnly(0), dateOnly(1), dateOnly(2)]) {
      const bucket = body.days.find((d) => d.date === day);
      const standups = bucket?.events.filter((e) => e.title === 'Daily standup') ?? [];
      expect(standups, `day ${day} should show 'Daily standup' exactly once`).toHaveLength(1);
    }

    await page.goto('/today');
    await expect(page.getByText('Team sync')).toBeVisible();
    // AccountChip renders once in the top chip row and again per event footer — any one proves
    // the account is attributed correctly.
    await expect(page.getByRole('button', { name: GOOGLE_ACCOUNT_LABEL }).first()).toBeVisible();

    // Deleting it: needs a second refresh cycle for the same account, so wait out the
    // once-per-minute limit rather than sleeping a guessed duration, and backdate again since
    // the first refresh cycle just reset last_refresh_at to "now". Wait for that first cycle's
    // job to fully settle first (see waitForRefreshToSettle) before backdating again.
    await waitForRefreshToSettle(page);
    await mockProvider('google', key).deleteEvent('primary', 'evt-team-sync');
    backdateLastRefresh(email, 'google', 3);
    await refreshUntilAllowed(page);
    await waitForTodayPayload(page, (b) => !eventTitles(b).includes('Team sync'));

    await page.reload();
    await expect(page.getByText('Team sync')).toHaveCount(0);
  });

  test('a Microsoft event appears after refresh with the right account chip', async ({ page }) => {
    test.setTimeout(120_000);
    const email = `today-microsoft-${crypto.randomUUID()}@example.com`;
    await signUpAndVerify(page, email);
    const key = await connect(page, 'microsoft');

    await waitForTodayPayload(page, (body) => body.accounts[0]?.lastRefreshAt !== null);

    const start = new Date();
    start.setUTCDate(start.getUTCDate() + 1);
    start.setUTCHours(9, 0, 0, 0);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    // Graph dateTimes arrive as naive local strings (no trailing Z — the connector appends one
    // itself, packages/connectors/src/microsoft/calendar.ts's toOccurrence).
    const naive = (d: Date) => d.toISOString().replace('Z', '');

    await mockProvider('microsoft', key).addEvent('primary-cal@example.test', {
      id: 'evt-planning',
      subject: 'Planning sync',
      location: { displayName: 'Room 2' },
      start: { dateTime: naive(start) },
      end: { dateTime: naive(end) },
    });

    backdateLastRefresh(email, 'microsoft', 3);
    const res = await page.request.post('/panels/today/refresh', {
      headers: await csrfHeaders(page),
    });
    expect(res.status()).toBe(202);

    await waitForTodayPayload(page, (b) => eventTitles(b).includes('Planning sync'));

    await page.goto('/today');
    await expect(page.getByText('Planning sync')).toBeVisible();
    await expect(page.getByRole('button', { name: MICROSOFT_ACCOUNT_LABEL }).first()).toBeVisible();
  });

  test('auto-refreshes stale cached data on open, and a stale account shows its last-refresh time', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const email = `today-stale-${crypto.randomUUID()}@example.com`;
    await signUpAndVerify(page, email);
    const key = await connect(page, 'google');
    await waitForTodayPayload(page, (body) => body.accounts[0]?.lastRefreshAt !== null);

    await mockProvider('google', key).addEvent('primary', googleEvent('evt-late-add', 'Retro', 1));

    // 6 minutes: past both the 2-minute auto-refresh threshold (apps/web/src/stores/today.ts,
    // apps/api/src/services/panels.ts markDue) and the 5-minute "stale" tier threshold for an
    // active user (apps/api/src/services/panels.ts todayPayload), so opening /today should show
    // both effects from one backdate.
    backdateLastRefresh(email, 'google', 6);

    await page.goto('/today');
    // The stale notice is rendered from the GET /panels/today response the page loads with,
    // before refreshIfStale's background POST has had any chance to complete — this must be
    // true immediately, not after a poll.
    await expect(page.getByText(GOOGLE_ACCOUNT_LABEL).first()).toBeVisible();
    await expect(
      page.locator('.calendar-panel').getByText('Last refreshed', { exact: false }),
    ).toBeVisible();

    // SC-002 (on-open half): the event appears within 10s of opening /today (T086).
    await waitForTodayPayload(page, (b) => eventTitles(b).includes('Retro'), 10_000);
  });

  test('shows a reconnect notice once the mock revokes access, axe clean', async ({ page }) => {
    test.setTimeout(120_000);
    const email = `today-reconnect-${crypto.randomUUID()}@example.com`;
    await signUpAndVerify(page, email);
    const key = await connect(page, 'google');
    await waitForTodayPayload(page, (body) => body.accounts[0]?.lastRefreshAt !== null);

    await mockProvider('google', key).revoke();

    backdateLastRefresh(email, 'google', 3);
    const res = await page.request.post('/panels/today/refresh', {
      headers: await csrfHeaders(page),
    });
    expect(res.status()).toBe(202);

    await waitForTodayPayload(page, (b) => b.accounts[0]?.status === 'reconnect_needed');

    await page.goto('/today');
    await expect(
      page.locator('.calendar-panel').getByText(`${GOOGLE_ACCOUNT_LABEL} needs reconnecting.`),
    ).toBeVisible();
    await expect(
      page
        .locator('.calendar-panel')
        .getByRole('link', { name: `Reconnect ${GOOGLE_ACCOUNT_LABEL}` }),
    ).toBeVisible();

    await page.setViewportSize({ width: 360, height: 800 });
    await axeCheck(page);
    await page.setViewportSize({ width: 1280, height: 800 });
    await axeCheck(page);
  });

  test('T058: after a simulated 30-day idle purge, panels show loading rather than stale rows until the refresh completes', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const email = `today-purge-${crypto.randomUUID()}@example.com`;
    await signUpAndVerify(page, email);
    const key = await connect(page, 'google');
    await waitForTodayPayload(page, (body) => body.accounts[0]?.lastRefreshAt !== null);

    await mockProvider('google', key).addEvent(
      'primary',
      googleEvent('evt-pre-purge', 'Pre-purge event', 1),
    );
    backdateLastRefresh(email, 'google', 3);
    await refreshUntilAllowed(page);
    await waitForTodayPayload(page, (b) => eventTitles(b).includes('Pre-purge event'));

    // Wait for that cycle to settle before backdating past the purge job's own 30-day cutoff —
    // otherwise a still-in-flight refresh could overwrite last_refresh_at right after the CLI
    // deletes the cache, and this test would never observe the purged state.
    await waitForRefreshToSettle(page);
    simulateIdlePurge(email);

    // purged: true (contracts/src/today.ts) — the cache is gone, so the panel must show its
    // loading state, never the stale "Pre-purge event" row it deleted.
    const purgedBody = await waitForTodayPayload(page, (b) => b.accounts[0]?.purged === true);
    expect(eventTitles(purgedBody)).not.toContain('Pre-purge event');

    await page.goto('/today');
    await expect(page.locator('.calendar-panel .desk-skeleton').first()).toBeVisible();
    await expect(page.getByText('Pre-purge event')).toHaveCount(0);

    // markDue (apps/api/src/services/panels.ts) only looks at last_refresh_at, not the purged
    // flag, so this account (freshly refreshed just before the purge) needs backdating again
    // before a refresh will actually pick it up.
    backdateLastRefresh(email, 'google', 3);
    await refreshUntilAllowed(page);
    await waitForTodayPayload(page, (b) => b.accounts[0]?.purged === false);
  });
});

// T074 (e2e half): a Playwright device-project run proving already-cached Today content renders
// fast — the `pixel-7`/`iphone-14` projects (tests/e2e/playwright.config.ts) run any spec whose
// describe title contains "@mobile" in addition to the desktop `ci` project, so this also
// exercises the panel on a phone-sized viewport. This is deliberately a warm navigation (data
// already cached from a prior refresh), not the cold/empty-state load the loading-skeleton test
// above covers — SC-005 is about the panel painting from cache quickly, not about network time.
test.describe('Today render performance @mobile', () => {
  test('renders cached calendar content within one second of navigating to /today', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const email = `today-perf-${crypto.randomUUID()}@example.com`;
    await signUpAndVerify(page, email);
    const key = await connect(page, 'google');
    await waitForTodayPayload(page, (body) => body.accounts[0]?.lastRefreshAt !== null);

    await mockProvider('google', key).addEvent(
      'primary',
      googleEvent('evt-perf', 'Perf check event', 1),
    );
    backdateLastRefresh(email, 'google', 3);
    await refreshUntilAllowed(page);
    await waitForTodayPayload(page, (b) => eventTitles(b).includes('Perf check event'));

    const start = Date.now();
    await page.goto('/today');
    await expect(page.getByText('Perf check event')).toBeVisible();
    expect(Date.now() - start).toBeLessThan(1000);
  });
});
