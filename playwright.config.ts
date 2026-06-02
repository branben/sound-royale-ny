import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  testIgnore: ['**/_future/**'],
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 2,
  timeout: 20000,
  expect: {
    timeout: 5000,
  },
  workers: 2,
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
  // The frontend must be running manually on localhost:8080 before E2E runs.
  // Keep this aligned with tests/e2e/README.md and scripts/e2e-guard.sh preflight output.
  use: {
    baseURL: 'http://localhost:8080',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  reporter: 'html',
});
