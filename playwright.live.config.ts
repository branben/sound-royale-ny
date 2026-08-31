import { defineConfig, devices } from '@playwright/test';

/**
 * Live stack E2E config — tests against the deployed Cloudflare Pages frontend
 * and Fly.io backend. No mocks, no local servers.
 *
 * Usage:
 *   npx playwright test --config=playwright.live.config.ts
 *
 * Environment:
 *   BASE_URL (default: https://soundroyale.pages.dev)
 *   API_URL (default: https://sound-royale-ny.fly.dev)
 */
export default defineConfig({
  testDir: './tests/e2e-live',
  testIgnore: ['**/_future/**'],
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 2,
  timeout: 60000,
  expect: {
    timeout: 15000,
  },
  workers: 1,
  reporter: process.env.CI
    ? [['list'], ['json', { outputFile: 'test-results/live-results.json' }]]
    : 'html',
  use: {
    baseURL: process.env.BASE_URL || 'https://soundroyale.pages.dev',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          args: [
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--no-sandbox',
            '--disable-setuid-sandbox',
          ],
        },
      },
    },
  ],
});
