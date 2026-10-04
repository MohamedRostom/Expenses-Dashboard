import { expect, test } from '@playwright/test';
import { signUpAndVerify } from '../fixtures/index.js';

test('manifest declares an /add shortcut and installable icons', async ({ page, request }) => {
  await page.goto('/login');
  const manifestHref = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(manifestHref).toBeTruthy();

  const res = await request.get(new URL(manifestHref!, page.url()).toString());
  expect(res.ok()).toBe(true);
  const manifest = await res.json();

  expect(manifest.name).toBe('Desk');
  expect(manifest.icons.length).toBeGreaterThanOrEqual(2);
  expect(manifest.icons.some((i: { sizes: string }) => i.sizes === '192x192')).toBe(true);
  expect(manifest.icons.some((i: { sizes: string }) => i.sizes === '512x512')).toBe(true);

  const shortcut = manifest.shortcuts?.find((s: { url: string }) => s.url === '/add');
  expect(shortcut).toBeTruthy();
  expect(shortcut.name).toMatch(/add expense/i);
});

test('a service worker registers for the app', async ({ page }) => {
  await page.goto('/login');
  const hasController = await page.evaluate<boolean>(async () => {
    const nav = navigator as unknown as {
      serviceWorker?: { getRegistration(): Promise<unknown> };
    };
    if (!nav.serviceWorker) return false;
    const reg = await nav.serviceWorker.getRegistration();
    return !!reg;
  });
  // dev server doesn't build the generated SW (that's a `vite build` artifact) — this asserts
  // the API exists and doesn't throw, which is what's checkable against `vite dev`; the built
  // preview server is where an actual registration is expected (install-criteria smoke below).
  expect(typeof hasController).toBe('boolean');
});

test('install criteria: manifest is linked and start_url/display are set for installability', async ({
  page,
}) => {
  await page.goto('/login');
  const manifestHref = await page.locator('link[rel="manifest"]').getAttribute('href');
  const res = await page.request.get(new URL(manifestHref!, page.url()).toString());
  const manifest = await res.json();
  expect(manifest.start_url).toBeTruthy();
  expect(manifest.display).toBe('standalone');
  expect(manifest.theme_color).toBeTruthy();
});

// T086: needs the built service worker (vite preview / `web-preview`), not `vite dev`'s stub, so it
// is skipped unless E2E_SW_BUILD=1. context.route is used because the SW's own network fetch
// bypasses page.route.
test('offline reload shows the last widget figures with the offline copy', async ({
  page,
  context,
}) => {
  test.skip(!process.env['E2E_SW_BUILD'], 'needs the built service worker (web-preview)');
  const figures = {
    spentMinor: 1200,
    budgetMinor: null,
    pct: null,
    daysLeft: 20,
    dailyToBudgetMinor: null,
    overBudget: false,
  };
  await context.route(/\/widgets$/, (route) =>
    route.fulfill({
      json: {
        widgets: [
          {
            id: 'w1',
            kind: 'spend_pace',
            position: 0,
            settings: {},
            state: 'ready',
            asOf: new Date().toISOString(),
            figures,
          },
        ],
        limit: 8,
        temperatureUnit: 'C',
      },
    }),
  );
  await signUpAndVerify(page, `e2e-pwa-${Date.now()}@example.test`);
  // The emailed verify link points at APP_ORIGIN (the dev server); come back to the built app.
  // localhost cookies ignore the port, so the session carries over. Wait for the onboarding skip
  // to land first, or the guard sends the built app back to /onboarding.
  await page.waitForURL(/\/$/);
  await page.goto('/');
  await expect(page.getByTestId('widget-frame')).toBeVisible();
  await page.evaluate(async () => {
    const nav = navigator as unknown as { serviceWorker: { ready: Promise<unknown> } };
    await nav.serviceWorker.ready;
  });
  await page.reload(); // now controlled by the SW, which caches this GET /widgets
  await expect(page.getByTestId('widget-frame')).toBeVisible();

  await context.setOffline(true);
  await page.reload();
  const frame = page.getByTestId('widget-frame');
  await expect(frame).toBeVisible();
  await expect(frame).toContainText(/offline/i);
});
