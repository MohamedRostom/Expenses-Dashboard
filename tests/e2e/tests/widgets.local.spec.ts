import { expect, type Page } from '@playwright/test';
import { csrfHeaders as apiCsrf, test } from '../fixtures/local-account.js';

/**
 * T037 @local: the weather widget against the REAL Open-Meteo through the deployed API, run by
 * e2e-local on `desk-local` (nightly + workflow_dispatch, never blocking a PR; see
 * playwright.config.ts's `local` project). Type-checked but not run in the session that wrote it:
 * it needs the deployed target with the widgets.weather flag on for new accounts, which only the
 * owner can arrange.
 *
 * Account handling: the worker's shared account from fixtures/local-account.ts (T037), deleted
 * when the worker ends, so staging neither accumulates users nor hits the register limit.
 */

const REMOTE = { timeout: 15_000 };
const HOUR_MS = 60 * 60 * 1000;
// SC-004 sampling: the age is checked every SAMPLE_EVERY_MS for SAMPLE_MINUTES (default 5).
const SAMPLE_MINUTES = Number(process.env['E2E_WEATHER_SAMPLE_MINUTES'] ?? 5);
const SAMPLE_EVERY_MS = 30_000;

type ApiWidget = { kind: string; state: string; asOf: string; figures?: { place: string } };

const csrfHeaders = (page: Page) => apiCsrf(page.request);

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
    // The route answers 404 only while widgets.weather is off for this account (owner-only setup).
    test.skip(created.status() === 404, 'widgets.weather is off on the target; turn it on to run');
    expect(created.status()).toBe(201);
    const { widget } = (await created.json()) as { widget: { id: string } };
    // The shared account outlives this test (other specs use it); leave no widget behind.
    const removeWidget = async () =>
      page.request.delete(`/widgets/${widget.id}`, { headers: await csrfHeaders(page) });

    try {
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
    } finally {
      await removeWidget();
    }
  });
});
