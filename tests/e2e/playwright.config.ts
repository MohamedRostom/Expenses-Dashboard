import { defineConfig, devices } from '@playwright/test';

// Two projects: `ci` runs against the compose stack with mocked connectors on every PR;
// `local` runs on the self-hosted desk-local runner against real accounts, never blocking a PR.
export default defineConfig({
  testDir: './tests',
  // T082: waits for Mailpit/the API when E2E_WAIT_FOR_STACK is set (ci.yml only) — see
  // global-setup.ts for why (docker compose --wait has no healthcheck to block on for mailpit).
  globalSetup: './global-setup.ts',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI'] ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: { trace: 'on-first-retry' },
  // R6: tight, shared tolerance; the `visual` project renders in the pinned Playwright image.
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.005, animations: 'disabled' } },
  projects: [
    {
      name: 'ci',
      grepInvert: /@local|@visual/,
      use: {
        ...devices['Desktop Edge'],
        baseURL: process.env['E2E_BASE_URL'] || 'http://localhost:5173',
        channel: 'msedge',
      },
    },
    // Chromium only, no `channel`: the pinned mcr.microsoft.com/playwright image ships Chromium,
    // not Edge. Run via the update-snapshots workflow / ci.yml `visual` job (docs/runbooks/visual-snapshots.md).
    {
      name: 'visual',
      grep: /@visual/,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: process.env['E2E_BASE_URL'] || 'http://localhost:5173',
      },
    },
    {
      name: 'local',
      grep: /@local/,
      use: {
        ...devices['Desktop Edge'],
        baseURL: process.env['E2E_LOCAL_BASE_URL'] || 'https://ros-desk-staging.fly.dev',
        channel: 'msedge',
      },
    },
    // T092: mobile device projects for the responsive/PWA/onboarding specs (@mobile-tagged).
    {
      name: 'pixel-7',
      grepInvert: /@local|@visual/,
      grep: /@mobile/,
      use: {
        ...devices['Pixel 7'],
        baseURL: process.env['E2E_BASE_URL'] || 'http://localhost:5173',
        channel: 'msedge',
      },
    },
    {
      name: 'iphone-14',
      grepInvert: /@local|@visual/,
      grep: /@mobile/,
      use: {
        ...devices['iPhone 14'],
        baseURL: process.env['E2E_BASE_URL'] || 'http://localhost:5173',
        channel: 'msedge',
      },
    },
  ],
});
