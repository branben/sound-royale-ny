import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TestDriver } from 'testdriverai/vitest/hooks';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..', '..');

// The REAL frontend source under review. These are the two modules that build
// the URLs a player's secret can leak into:
//   - gameSocket.ts   -> WebSocket connect URL (?secret=..., &player_id=...)
//   - api.ts          -> GET /auth/discord/status/?player_id=..&player_secret=..
// We also stage the local imports those modules pull in via the "@/" alias so
// esbuild can bundle the real code paths unmodified inside the sandbox.
const SRC_FILES = {
  'services/gameSocket.ts': 'src/services/gameSocket.ts',
  'services/api.ts': 'src/services/api.ts',
  'services/discordSession.ts': 'src/services/discordSession.ts',
  'types/game.ts': 'src/types/game.ts',
};

const HARNESS = readFileSync(join(__dirname, 'fixtures', 'sec1_url_harness.cjs'), 'utf8');

// Base64 so multi-line TS/JS drops into the sandbox in one exec without
// heredoc/quoting fragility.
const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');

// A high-entropy canary standing in for the player's secret. If this exact
// string appears in ANY URL the client builds, the secret is being exposed.
const CANARY = 'SEC1CANARY_a1b2c3d4e5f6_player_secret_MUST_NOT_LEAK';

describe('SEC-1: player secret must never appear in a URL (issue #105)', () => {
  it('keeps the secret out of the WS connect URL and the Discord status GET query', async (context) => {
    const testdriver = TestDriver(context);

    await testdriver.provision.chrome({ url: 'about:blank' });

    // 1) Stage the real source tree + the harness inside the sandbox.
    const stage = [
      'set -e',
      'rm -rf /tmp/sec1 && mkdir -p /tmp/sec1/src/services /tmp/sec1/src/types',
      `echo ${b64(HARNESS)} | base64 -d > /tmp/sec1/sec1_url_harness.cjs`,
    ];
    for (const [dest, srcRel] of Object.entries(SRC_FILES)) {
      const content = readFileSync(join(repoRoot, srcRel), 'utf8');
      stage.push(`echo ${b64(content)} | base64 -d > /tmp/sec1/src/${dest}`);
    }
    stage.push('echo STAGED');
    await testdriver.exec('sh', stage.join('\n'), 60000);

    // 2) Ensure Node + esbuild are available to bundle the real TS modules.
    //    esbuild bundles gameSocket.ts / api.ts (resolving the "@/" alias and
    //    stubbing axios + browser globals) so we exercise the actual URL
    //    builders rather than reimplementing them.
    await testdriver.exec(
      'sh',
      [
        'set -e',
        'cd /tmp/sec1',
        'node -v',
        'npm init -y >/dev/null 2>&1 || true',
        'node -e "require(\'esbuild\')" 2>/dev/null || npm install --no-audit --no-fund --silent esbuild@0.21.5',
        "node -e \"require('esbuild');console.log('esbuild-ok')\"",
      ].join('\n'),
      300000,
    );

    // 3) Run the harness: it drives gameSocket.connect() and
    //    discordApi.getAccountStatus() with the canary secret and prints the
    //    URLs those real code paths produce.
    const run = await testdriver.exec(
      'sh',
      ['cd /tmp/sec1', `CANARY='${CANARY}' SRC_ROOT=/tmp/sec1/src node sec1_url_harness.cjs`].join(
        '\n',
      ),
      120000,
    );
    const runOut = String(run?.stdout ?? run ?? '');
    console.log('SEC-1 harness output:\n' + runOut);

    // 4) Parse the URLs the real client built.
    const raw = (runOut.match(/SEC1_RESULT_START(\{.*\})SEC1_RESULT_END/) || [])[1];
    expect(raw, `harness did not emit a result payload. Full output:\n${runOut}`).toBeTruthy();
    const result = JSON.parse(raw);
    console.log('Parsed SEC-1 result:', result);

    // Sanity: the real URL builders actually ran and produced URLs.
    expect(result.wsUrl, 'gameSocket did not produce a WebSocket URL').toBeTruthy();
    expect(result.statusUrl, 'discordApi.getAccountStatus did not produce a URL').toBeTruthy();
    // And the canary really is what we probed with.
    expect(result.canary).toBe(CANARY);

    // === SEC-1 contract (correct behavior) ===
    // The player secret must NOT be present in either URL. On current code the
    // WS URL is `...?secret=<CANARY>&player_id=...` and the status URL is
    // `/auth/discord/status/?player_id=..&player_secret=<CANARY>`, so BOTH of
    // these FAIL — an intentional red gate. Moving the secret to an
    // Authorization header / POST body / first WS message flips them green.
    expect(
      result.wsUrl.includes(CANARY),
      `player secret leaked into the WebSocket connect URL: ${result.wsUrl}`,
    ).toBe(false);
    expect(
      result.statusUrl.includes(CANARY),
      `player secret leaked into the Discord status GET query: ${result.statusUrl}`,
    ).toBe(false);
  });
});
