import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  testIgnore: ['**/_future/**', '**/live/**'],
  fullyParallel: false,
  forbidOnly: undefined,
  retries: 2,
  timeout: 20000,
  expect: {
    timeout: 5000,
  },
  workers: 1,
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
            '--disable-background-timer-throttling',
            '--disable-backgrounding-occluded-windows',
            '--disable-renderer-backgrounding',
            '--disable-features=TranslateUI',
            '--disable-extensions',
          ],
        },
      },
    },
    {
      name: 'live-chrome',
      testDir: './tests/e2e/live',
      testIgnore: ['**/_future/**'],
      fullyParallel: false,
      timeout: 120000,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: process.env.LIVE_FRONTEND_URL || 'http://localhost:8080',
        launchOptions: {
          args: [
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-background-timer-throttling',
            '--disable-backgrounding-occluded-windows',
            '--disable-renderer-backgrounding',
            '--disable-features=TranslateUI',
            '--disable-extensions',
          ],
        },
      },
    },
    {
      name: 'live-firefox',
      testDir: './tests/e2e/live',
      testIgnore: ['**/_future/**'],
      fullyParallel: false,
      timeout: 120000,
      use: {
        ...devices['Desktop Firefox'],
        baseURL: process.env.LIVE_FRONTEND_URL || 'http://localhost:8080',
      },
    },
  ],
  // The frontend must be running manually on localhost:8080 before E2E runs.
  // Keep this aligned with tests/e2e/README.md and scripts/e2e-guard.sh preflight output.
  use: {
    baseURL: 'http://localhost:8080',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  reporter: 'html',
});
