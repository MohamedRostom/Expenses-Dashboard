import { execSync } from 'node:child_process';
import { expect, test, type Page } from '@playwright/test';
import { signUpAndVerify } from '../fixtures/index.js';

// Not a real phrase, see tests/e2e/fixtures/index.ts's signUpAndVerify comment.
const PASSWORD = 'xk-e2e-Tr0ub4-fixture-2026';

const uniqueEmail = (tag: string) =>
  `e2e-${tag}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`;

/**
 * T061 (ci, SC-003): the strip must not slow the pages it sits on. `/widgets` is route-mocked
 * (once empty, once with eight ready widgets) so the measured difference is the client's cost of
 * rendering a full strip, not the server's (apps/api/test/widgets-load.test.ts covers that).
 * Lighthouse perf/a11y scores stay with the lhci run and axe elsewhere.
 * ponytail: the 100 ms deltas are medians of 5 in-page timings, still noisy on a shared runner;
 * if this flakes, raise the repeat count before the thresholds.
 */

const TYPES = { types: [] };
const DELTA_BUDGET_MS = 100;

const pace = (i: number) => ({
  id: `w${i}`,
  kind: 'spend_pace',
  position: i,
  settings: {},
  state: 'ready',
  asOf: new Date().toISOString(),
  figures: {
    spentMinor: 1000 + i,
    budgetMinor: null,
    pct: null,
    daysLeft: 20,
    dailyToBudgetMinor: null,
    overBudget: false,
  },
});

let count = 0;

async function mock(page: Page, initial: number): Promise<void> {
  count = initial;
  await page.route('**/widgets/types', (route) => route.fulfill({ json: TYPES }));
  await page.route(/\/widgets$/, (route) =>
    route.request().method() === 'GET'
      ? route.fulfill({
          json: {
            widgets: Array.from({ length: count }, (_, i) => pace(i)),
            limit: 8,
            temperatureUnit: 'C',
          },
        })
      : route.fallback(),
  );
  await page.route('**/panels/today', (route) =>
    route.fulfill({
      json: { days: [], messages: [], accounts: [], generatedAt: new Date().toISOString() },
    }),
  );
}

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;

/**
 * Median of per-pair differences (eight widgets minus none) over 5 interleaved pairs, so load
 * drift on a shared stack hits both arms alike. `metric` loads `path` and returns milliseconds.
 */
async function delta(page: Page, path: string, metric: (page: Page) => Promise<number>) {
  await page.goto(path); // warm-up: cold bundles would penalise whichever arm runs first
  const diffs: number[] = [];
  for (let i = 0; i < 5; i++) {
    count = 0;
    await page.goto(path);
    const none = await metric(page);
    count = 8;
    await page.goto(path);
    diffs.push((await metric(page)) - none);
  }
  return median(diffs);
}

test.describe('SC-003 performance', () => {
  let email = '';
  test.beforeEach(async ({ page }) => {
    await mock(page, 0);
    email = uniqueEmail('widgets-perf');
    await signUpAndVerify(page, email, PASSWORD);
  });

  test('cached figures render from the one cached /widgets answer on throttled mobile', async ({
    page,
  }) => {
    // ponytail: the dev-build reload under slow 4G alone takes ~30 s on the ci stack; this only
    // stops the reload from eating the default test timeout.
    test.setTimeout(90_000);
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    await mock(page, 8);
    await page.setViewportSize({ width: 360, height: 640 });
    // Warm the HTTP cache unthrottled, then throttle and measure the repeat visit.
    await page.goto('/');
    const strip = page.getByTestId('widget-strip');
    await expect(strip.locator('article')).toHaveCount(8);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 150,
      downloadThroughput: (1.6 * 1024 * 1024) / 8,
      uploadThroughput: (750 * 1024) / 8,
    });
    // T096: a runner-side wall clock under 4x CPU throttling flaked under parallel load. The
    // deterministic half of SC-003's 1 s budget is that the strip renders straight from the first
    // /widgets answer with no second request (no refetch, no waterfall); the 1 s number itself is
    // gated by the Lighthouse budgets in tests/e2e/lighthouserc.json.
    let gets = 0;
    page.on('request', (r) => {
      if (r.method() === 'GET' && /\/widgets$/.test(r.url())) gets++;
    });
    const answered = page.waitForResponse(/\/widgets$/);
    await page.reload({ waitUntil: 'commit' });
    await answered; // the slow-4G dev-build reload itself is not the strip's to own
    await expect(strip.locator('article')).toHaveCount(8);
    expect(gets).toBe(1);
  });

  test('eight widgets add at most 100 ms to the month view first paint', async ({ page }) => {
    const fcp = async (p: Page) =>
      p.evaluate(
        () =>
          new Promise<number>((resolve) => {
            const get = () => performance.getEntriesByName('first-contentful-paint')[0]?.startTime;
            const poll = () => {
              const v = get();
              if (v !== undefined) resolve(v);
              else setTimeout(poll, 20);
            };
            poll();
          }),
      );
    expect(await delta(page, '/', fcp)).toBeLessThanOrEqual(DELTA_BUDGET_MS);
  });

  test('the Today panels settle no more than 100 ms later with eight widgets', async ({ page }) => {
    // panels.today is dark by default; switch it on for this user, as connections.spec.ts does.
    const dbUrl = process.env['DATABASE_URL'] ?? 'postgres://desk:desk@localhost:5432/desk';
    execSync(`pnpm --filter @desk/db flags set panels.today --user "${email}" on`, {
      env: { ...process.env, DATABASE_URL: dbUrl },
    });
    // T096: read the in-page clock (ms since navigation start, checked every frame) rather than
    // the runner's Date.now around an expect poll, whose 100 ms poll interval alone was as large
    // as the budget.
    const panelsLoaded = (p: Page) =>
      p
        .waitForFunction(
          "[...document.querySelectorAll('.sr-only')].some((e) => e.textContent.includes('Panels loaded')) && performance.now()",
          undefined,
          { polling: 'raf', timeout: 15_000 },
        )
        .then((h) => h.jsonValue() as Promise<number>);
    expect(await delta(page, '/today', panelsLoaded)).toBeLessThanOrEqual(DELTA_BUDGET_MS);
  });
});
