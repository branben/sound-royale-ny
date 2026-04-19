import { Page } from '@playwright/test';

declare global {
  interface Window {
    __E2E_TESTING__?: boolean;
  }
}

export async function enableE2EMode(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.__E2E_TESTING__ = true;
  });
}
