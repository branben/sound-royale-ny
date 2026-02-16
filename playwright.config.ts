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
  // servers started manually in CI
  // webServer: { command: 'npm run dev:frontend', port: 5173, reuseExistingServer: true, timeout: 120000 },
  use: {
    baseURL: 'http://localhost:8080',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  reporter: 'html',
});
