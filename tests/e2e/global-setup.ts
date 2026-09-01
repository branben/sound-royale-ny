import { execSync } from 'child_process';

/**
 * Global setup — runs once before all E2E tests.
 * Cleans up stale rooms/players from previous test runs to prevent
 * "Spectator limit reached" and dirty-state failures.
 */
export default async function globalSetup() {
  console.log('[globalSetup] Cleaning up stale test data...');

  try {
    // Clean up all rooms (cascades to players, tiles, rounds)
    const cmd =
      'cd backend && DJANGO_SETTINGS_MODULE=sound_royale_api.settings_e2e POSTGRES_HOST=localhost python -c "' +
      'import django; django.setup(); ' +
      'from game_engine.models import Room; ' +
      'n = Room.objects.all().delete()[0]; ' +
      'print(f"[globalSetup] Cleaned up {n} rooms")' +
      '"';
    execSync(cmd, { stdio: 'inherit', timeout: 30000 });
  } catch (error) {
    // Don't fail the run if cleanup fails — the database might be empty
    console.warn('[globalSetup] Cleanup skipped or failed:', error);
  }

  console.log('[globalSetup] Done');
}
