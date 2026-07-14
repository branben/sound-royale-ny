import { describe, expect, it } from 'vitest';
import { TestDriver } from 'testdriverai/vitest/hooks';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// SEC-1 (security) gate — issue #105.
//
// The player secret must NEVER be placed in a URL query string. URLs are
// routinely persisted in browser history, proxy logs, and server access logs,
// so a secret carried in the query string (`?secret=...` / `?player_secret=...`)
// is effectively exposed. The remediation is to move the secret to an
// Authorization header, a POST body, or the first WebSocket message.
//
// This test is a REGRESSION GATE, not a smoke test: it stages the project's
// REAL frontend sources into the TestDriver sandbox and exercises the exact
// URL-construction paths the app uses:
//   - gameSocket.ts  -> GameSocketService.getWsUrl()        (WebSocket connect URL)
//   - api.ts         -> discordApi.getAccountStatus()       (GET /auth/discord/status/)
// It then asserts a unique canary secret does NOT appear in either URL's query
// string.
//
// Expected lifecycle:
//   - On CURRENT code: FAILS (the secret leaks into both URLs). This is the
//     "red" that proves the vulnerability is real and the gate detects it.
//   - After the fix (secret moved to header / body / first WS message): PASSES.
//
// The harness (tests/testdriver/fixtures/sec1_url_harness.cjs) runs inside the
// sandbox via `exec` so the check is deterministic and does not depend on a
// live deployment or AI vision — a security gate must be exact.

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');

function b64(path) {
  return readFileSync(path).toString('base64');
}

// Real sources under test + the harness, read from the repo checkout and
// staged into the sandbox by value (base64) so no network/git access is needed.
const GAMESOCKET_TS_B64 = b64(resolve(REPO_ROOT, 'src/services/gameSocket.ts'));
const API_TS_B64 = b64(resolve(REPO_ROOT, 'src/services/api.ts'));
const HARNESS_B64 = b64(resolve(__dirname, 'fixtures/sec1_url_harness.cjs'));

const SANDBOX_DIR = '/tmp/sec1';

describe('SEC-1: player secret must not be exposed in a URL (issue #105)', () => {
  it('does not leak the player secret into the WS connect URL or the discord status GET query', async (context) => {
    const testdriver = TestDriver(context);

    // A Chrome sandbox gives us a Linux VM with node available; we only use it
    // to run the harness against the staged real sources.
    await testdriver.provision.chrome({ url: 'about:blank' });

    // Stage the real sources + harness into the sandbox via base64 round-trip
    // (avoids any shell-escaping issues with the file contents).
    await testdriver.exec('sh', `mkdir -p ${SANDBOX_DIR}`);
    await testdriver.exec(
      'sh',
      `printf '%s' '${GAMESOCKET_TS_B64}' | base64 -d > ${SANDBOX_DIR}/gameSocket.ts`,
    );
    await testdriver.exec('sh', `printf '%s' '${API_TS_B64}' | base64 -d > ${SANDBOX_DIR}/api.ts`);
    await testdriver.exec(
      'sh',
      `printf '%s' '${HARNESS_B64}' | base64 -d > ${SANDBOX_DIR}/sec1_url_harness.cjs`,
    );

    // Run the harness. It prints a single `SEC1_RESULT=<json>` line and exits
    // non-zero when the secret leaks; capture both so we can assert on the JSON
    // regardless of exit code.
    const raw = await testdriver.exec(
      'sh',
      `cd ${SANDBOX_DIR} && SEC1_GAMESOCKET_TS=${SANDBOX_DIR}/gameSocket.ts ` +
        `SEC1_API_TS=${SANDBOX_DIR}/api.ts node sec1_url_harness.cjs 2>&1; ` +
        `echo "SEC1_EXIT=$?"`,
    );

    const output = typeof raw === 'string' ? raw : String(raw ?? '');

    // The harness must actually have run (guard against a staging/tooling
    // failure silently passing the gate).
    const resultLine = output.split('\n').find((l) => l.startsWith('SEC1_RESULT='));
    expect(resultLine, `harness did not emit SEC1_RESULT. Raw output:\n${output}`).toBeTruthy();

    const result = JSON.parse(resultLine.slice('SEC1_RESULT='.length));

    // A code-location failure (exit 2 / result.error) means the app was
    // refactored and the gate can no longer find the code under test — fail
    // loudly rather than let it pass by omission.
    expect(
      result.error,
      `SEC-1 harness could not locate the code under test: ${result.error}`,
    ).toBeUndefined();

    // The core assertion: no URL the app builds may carry the player secret.
    const leakSummary = (result.leaks || []).map((l) => `${l.where}: ${l.url}`).join('\n');
    expect(
      result.ok,
      `SEC-1 VIOLATION (issue #105): the player secret leaked into a URL query ` +
        `string. The secret must move to an Authorization header, POST body, or ` +
        `the first WebSocket message.\nLeaks:\n${leakSummary}`,
    ).toBe(true);
  });
});
