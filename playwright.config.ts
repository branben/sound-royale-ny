import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  testIgnore: ['**/_future/**'],
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 2,
  timeout: 90000,
  expect: {
    timeout: 10000,
  },
  workers: 2,
  globalSetup: './tests/e2e/global-setup.ts',
  // Auto-start Vite dev server before running tests.
  // No need to manually start a separate terminal.
  webServer: {
    command: 'pnpm exec vite --port 8081 --host',
    url: 'http://localhost:8081',
    reuseExistingServer: false,
    timeout: 120000,
    env: {
      VITE_E2E_TESTING: 'true',
      NODE_ENV: 'development',
    },
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
            '--disable-background-timer-throttling',
            '--disable-backgrounding-occluded-windows',
            '--disable-renderer-backgrounding',
            '--disable-features=TranslateUI',
            '--disable-extensions',
          ],
        },
      },
    },
  ],
  use: {
    baseURL: 'http://localhost:8081',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  reporter: process.env.CI
    ? [['list'], ['json', { outputFile: 'test-results/results.json' }]]
    : 'html',
});
