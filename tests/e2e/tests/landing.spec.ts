import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// The landing site (apps/landing, vite-ssg) is not part of the web app's dev server / baseURL —
// it's served by its own `landing` service in infra/docker-compose.yml (T105/T108). Override via
// E2E_LANDING_URL for other environments.
const LANDING_URL = process.env['E2E_LANDING_URL'] ?? 'http://localhost:5174';

test.describe('landing page (US9)', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('shows the call to action, three steps and privacy link with no horizontal scroll', async ({
    page,
  }) => {
    await page.goto(LANDING_URL);

    await expect(page.getByRole('link', { name: /sign up/i })).toBeVisible();

    const steps = page.locator('.steps li');
    await expect(steps).toHaveCount(3);
    for (const step of await steps.all()) {
      await expect(step).toBeVisible();
    }

    await expect(page.getByRole('link', { name: /privacy/i })).toBeVisible();

    const hasHorizontalScroll = await page.evaluate<boolean>(() => {
      const doc = (
        globalThis as unknown as {
          document: { documentElement: { scrollWidth: number; clientWidth: number } };
        }
      ).document;
      return doc.documentElement.scrollWidth > doc.documentElement.clientWidth;
    });
    expect(hasHorizontalScroll).toBe(false);
  });

  test('has no accessibility violations', async ({ page }) => {
    await page.goto(LANDING_URL);
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });
});
