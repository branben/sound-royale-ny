/**
 * Global setup for E2E tests — DISABLED because it causes race conditions
 * with sharded test runs. When two shards share the same Postgres, one
 * shard's global cleanup truncates data that the other shard is actively
 * using.
 *
 * Instead, each live test is responsible for cleaning up after itself
 * using test-specific room codes (e.g., `test-{uuid}`) and deleting
 * them in afterEach hooks.
 */
export default async function globalSetup() {
  console.log('[globalSetup] Disabled — tests must self-cleanup');
}
