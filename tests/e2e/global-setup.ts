import { FullConfig } from '@playwright/test';

/**
 * Global setup: delete all rooms, players, tiles, and related game state
 * from the test database before the suite runs.
 *
 * This is necessary because the E2E suite uses a shared Postgres container
 * in CI. Without cleanup, rooms/players from a prior run remain and the
 * (room_id, name) unique constraint rejects joins with the same player
 * names in a new run.
 *
 * Uses the /test/cleanup/ endpoint which TRUNCATES all game state tables.
 * That endpoint is test-only (never registered in production urls.py).
 * It lives at the ROOT url (not under /api/), so we use the root URL.
 */
export default async function globalSetup(config: FullConfig) {
  // The cleanup endpoint is at root level, not under /api/
  const apiBase = process.env.LIVE_API_BASE_URL || 'http://127.0.0.1:8000/api';
  const rootBase = apiBase.replace('/api', '');

  // Wait for backend to be ready (CI containers take a moment)
  let ready = false;
  for (let i = 0; i < 30; i++) {
    try {
      const response = await fetch(`${rootBase}/test/cleanup/`, { method: 'GET' });
      if (response.ok || response.status === 405) {
        // 405 means endpoint exists but doesn't accept GET — that's expected
        ready = true;
        break;
      }
    } catch {
      // Backend not ready yet
    }
    await new Promise((r) => setTimeout(r, 1000));
  }

  if (!ready) {
    console.warn('[globalSetup] Backend not reachable, skipping cleanup');
    return;
  }

  try {
    const response = await fetch(`${rootBase}/test/cleanup/`, { method: 'POST' });
    if (response.ok) {
      console.log('[globalSetup] Test database cleaned successfully');
    } else {
      console.warn(`[globalSetup] Cleanup returned ${response.status}`);
    }
  } catch (error) {
    console.warn(
      `[globalSetup] Cleanup failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
