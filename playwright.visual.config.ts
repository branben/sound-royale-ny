import { defineConfig, devices } from '@playwright/test';

/**
 * Visual dogfooding config — captures screenshots of every page for review.
 *
 * Usage:
 *   npx playwright test --config=playwright.visual.config.ts
 *
 * Screenshots are saved to test-results/visual/ and can be reviewed
 * as GitHub Actions artifacts on each PR.
 */
export default defineConfig({
  testDir: './tests/e2e-visual',
  fullyParallel: false,
  retries: 1,
  timeout: 60000,
  expect: {
    timeout: 15000,
  },
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: process.env.BASE_URL || 'https://soundroyale.pages.dev',
    screenshot: 'on', // Always capture
    trace: 'off',
    video: 'off',
    viewport: { width: 1280, height: 720 },
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          args: ['--disable-dev-shm-usage', '--disable-gpu', '--no-sandbox'],
        },
      },
    },
  ],
});
