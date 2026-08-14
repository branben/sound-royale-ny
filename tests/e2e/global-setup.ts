import { request } from '@playwright/test';

/**
 * Global setup: clean the backend database before the E2E suite runs.
 * Without this, spectators from previous specs leak into the shared
 * Postgres backend, hitting MAX_SPECTATORS=10 and cascading into
 * "Spectator limit reached" rejections.
 */
async function globalSetup() {
  const baseURL = process.env.LIVE_API_BASE_URL || 'http://127.0.0.1:8000';

  try {
    // Use the test-only cleanup endpoint if available, otherwise best-effort.
    const context = await request.newContext({ baseURL });

    // Truncate all game state via a dedicated test endpoint
    // The endpoint is at /test/cleanup/ (not /api/test/cleanup/)
    const response = await context.post('/test/cleanup/');

    if (response.ok()) {
      console.log('[globalSetup] Database cleaned successfully');
    } else {
      console.warn(`[globalSetup] Cleanup endpoint returned ${response.status()}`);
    }

    await context.dispose();
  } catch (error) {
    console.warn(`[globalSetup] Cleanup failed (non-fatal): ${error}`);
  }
}

export default globalSetup;
