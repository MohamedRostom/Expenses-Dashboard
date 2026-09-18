import { defineConfig, devices } from '@playwright/test';

// Two projects: `ci` runs against the compose stack with mocked connectors on every PR;
// `local` runs on the self-hosted desk-local runner against real accounts, never blocking a PR.
export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI'] ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: { trace: 'on-first-retry' },
  projects: [
    {
      name: 'ci',
      grepInvert: /@local/,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: process.env['E2E_BASE_URL'] ?? 'http://localhost:5173',
      },
    },
    {
      name: 'local',
      grep: /@local/,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: process.env['E2E_LOCAL_BASE_URL'] ?? 'https://desk-staging.fly.dev',
      },
    },
    // T092: mobile device projects for the responsive/PWA/onboarding specs (@mobile-tagged).
    {
      name: 'pixel-7',
      grepInvert: /@local/,
      grep: /@mobile/,
      use: {
        ...devices['Pixel 7'],
        baseURL: process.env['E2E_BASE_URL'] ?? 'http://localhost:5173',
      },
    },
    {
      name: 'iphone-14',
      grepInvert: /@local/,
      grep: /@mobile/,
      use: {
        ...devices['iPhone 14'],
        baseURL: process.env['E2E_BASE_URL'] ?? 'http://localhost:5173',
      },
    },
  ],
});
