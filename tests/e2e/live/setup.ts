import { test } from '@playwright/test';

/**
 * Shared setup for live E2E specs: clean the backend database before
 * each test so spectators from prior tests don't leak into the next
 * room's count. Without this, the suite hits MAX_SPECTATORS=10 after
 * ~10 spec files each create 3 spectators.
 */
export function useLiveSetup() {
  test.beforeEach(async () => {
    const baseURL = process.env.LIVE_API_BASE_URL || 'http://127.0.0.1:8000';
    try {
      const response = await fetch(`${baseURL}/test/cleanup/`, { method: 'POST' });
      if (!response.ok) {
        console.warn(`[setup] Cleanup returned ${response.status}`);
      }
    } catch (error) {
      console.warn(`[setup] Cleanup failed: ${error}`);
    }
  });
}
