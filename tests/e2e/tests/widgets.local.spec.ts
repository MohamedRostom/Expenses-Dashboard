import { expect, test as base, type Page } from '@playwright/test';

/**
 * T037 @local: the weather widget against the REAL Open-Meteo through the deployed API, run by
 * e2e-local on `desk-local` (nightly + workflow_dispatch, never blocking a PR; see
 * playwright.config.ts's `local` project). Type-checked but not run in the session that wrote it:
 * it needs the deployed target with the widgets.weather flag on for new accounts, which only the
 * owner can arrange.
 *
 * Same account handling as smoke.spec.ts: a fresh account per test created through the API (a
 * Resend test-inbox address, random password) and deleted afterwards, so staging does not
 * accumulate users.
 */

const REMOTE = { timeout: 15_000 };
const HOUR_MS = 60 * 60 * 1000;
// SC-004 sampling: the age is checked every SAMPLE_EVERY_MS for SAMPLE_MINUTES (default 5).
const SAMPLE_MINUTES = Number(process.env['E2E_WEATHER_SAMPLE_MINUTES'] ?? 5);
const SAMPLE_EVERY_MS = 30_000;

type Credentials = { email: string; password: string };
type ApiWidget = { kind: string; state: string; asOf: string; figures?: { place: string } };

async function csrfHeaders(page: Page): Promise<Record<string, string>> {
  const cookie = (await page.context().cookies()).find((c) => c.name === '__Host-desk_csrf');
  return cookie ? { 'X-CSRF-Token': cookie.value } : {};
}

const test = base.extend<{ account: Credentials }>({
  account: async ({ page }, use) => {
    const credentials = {
      email: `delivered+weather-${Date.now()}-${crypto.randomUUID().slice(0, 8)}@resend.dev`,
      password: `weather-${crypto.randomUUID()}`,
    };
    expect((await page.request.get('/healthz')).ok()).toBe(true);
    const register = await page.request.post('/auth/register', {
      data: { ...credentials, defaultCurrency: 'GBP', timeZone: 'Europe/London' },
      headers: await csrfHeaders(page),
    });
    expect(register.status()).toBe(202);
    const login = await page.request.post('/auth/login', {
      data: credentials,
      headers: await csrfHeaders(page),
    });
    expect(login.ok()).toBe(true);
    const onboarded = await page.request.patch('/me', {
      data: { onboardingCompletedAt: new Date().toISOString() },
      headers: await csrfHeaders(page),
    });
    expect(onboarded.ok()).toBe(true);
    await use(credentials);
    try {
      await page.request.delete('/me', {
        data: { password: credentials.password },
        headers: await csrfHeaders(page),
      });
    } catch {
      // context gone: anything left is locked after 7 days by login().
    }
  },
});

async function weatherWidget(page: Page): Promise<ApiWidget | undefined> {
  const res = await page.request.get('/widgets');
  expect(res.ok()).toBe(true);
  return ((await res.json()) as { widgets: ApiWidget[] }).widgets.find((w) => w.kind === 'weather');
}

test.describe('weather widget against the real Open-Meteo @local', () => {
  test.describe.configure({ timeout: 60_000 + SAMPLE_MINUTES * 60_000 });

  test('a real place shows a reading under an hour old, and stays that fresh across the run', async ({
    page,
    account,
  }) => {
    expect(account.email).toContain('@');
    // The Add sheet cannot create a weather widget without a place yet, so the arrange step
    // searches the real source and posts the first candidate, as the picker would.
    const search = await page.request.get('/places/search?q=Manchester');
    expect(search.ok()).toBe(true);
    const { candidates } = (await search.json()) as { candidates: unknown[] };
    expect(candidates.length).toBeGreaterThan(0);
    const created = await page.request.post('/widgets', {
      data: { kind: 'weather', place: candidates[0] },
      headers: await csrfHeaders(page),
    });
    expect(created.status()).toBe(201);

    await page.goto('/');
    const weather = page.getByRole('article', { name: 'Weather' });
    await expect(weather).toContainText(/\d+°C/, REMOTE);
    await expect(weather).toContainText(/as of \d{2}:\d{2}/);
    await expect(weather).toContainText('Open-Meteo');

    const ageOk = async () => {
      const w = await weatherWidget(page);
      expect(w, 'the weather widget exists').toBeDefined();
      expect(w!.state).not.toBe('error');
      const age = Date.now() - new Date(w!.asOf).getTime();
      expect(age, `reading age ${Math.round(age / 60000)} min`).toBeLessThan(HOUR_MS);
    };
    await ageOk();

    // SC-004 sampling: the refresh job keeps the reading inside its one-hour window.
    const until = Date.now() + SAMPLE_MINUTES * 60_000;
    while (Date.now() < until) {
      await page.waitForTimeout(SAMPLE_EVERY_MS);
      await ageOk();
    }
  });
});
