/**
 * Global setup — runs once before all E2E tests.
 * Cleans up stale rooms/players from previous test runs to prevent
 * "Spectator limit reached" and dirty-state failures.
 *
 * Uses the /test/cleanup/ POST endpoint which TRUNCATES all game state.
 * That endpoint is test-only (never registered in production urls.py).
 */
export default async function globalSetup() {
  console.log('[globalSetup] Cleaning up stale test data...');

  const apiBase = process.env.LIVE_API_BASE_URL || 'http://127.0.0.1:8000/api';
  const rootBase = apiBase.replace('/api', '');
  const cleanupUrl = `${rootBase}/test/cleanup/`;

  // Wait for backend to be ready (CI containers take a moment)
  let ready = false;
  for (let i = 0; i < 30; i++) {
    try {
      const response = await fetch(cleanupUrl, { method: 'GET' });
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
    const response = await fetch(cleanupUrl, { method: 'POST' });
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

  console.log('[globalSetup] Done');
}
