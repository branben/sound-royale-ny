import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: undefined,
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
  webServer: {
    command: 'npm run dev',
    port: 8080,
    reuseExistingServer: true,
  },
  use: {
    trace: 'on-first-retry',
    launchOptions: {
      env: {
        VITE_E2E_TESTING: 'true',
      },
    },
    screenshot: 'only-on-failure',
  },
  reporter: 'html',
});
