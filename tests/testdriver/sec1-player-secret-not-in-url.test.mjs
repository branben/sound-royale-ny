import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TestDriver } from 'testdriverai/vitest/hooks';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..', '..');

// The REAL frontend source under review (the two known leak sites) + the
// harness that runs their actual URL builders with a canary secret.
const REAL_GAMESOCKET_TS = readFileSync(join(repoRoot, 'src', 'services', 'gameSocket.ts'), 'utf8');
const REAL_API_TS = readFileSync(join(repoRoot, 'src', 'services', 'api.ts'), 'utf8');
const HARNESS_CJS = readFileSync(join(__dirname, 'fixtures', 'sec1_url_harness.cjs'), 'utf8');

// Base64 so multi-line source drops into the sandbox in one exec without
// heredoc/quoting fragility.
const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');

// A unique, high-entropy canary so a match is unambiguous — this exact string
// stands in for the player secret and must NEVER appear in any request URL.
const CANARY = 'SEC1CANARY' + randomBytes(9).toString('hex').toUpperCase();

describe('SEC-1 (#105): player secret must not travel in a request URL', () => {
  it('stages the real gameSocket.ts + api.ts and asserts the secret is absent from the WS connect URL and the /auth/discord/status/ GET query', async (context) => {
    const testdriver = TestDriver(context);

    await testdriver.provision.chrome({ url: 'about:blank' });

    // 1) Stage the REAL source files + the harness inside the sandbox.
    await testdriver.exec(
      'sh',
      [
        'set -e',
        'rm -rf /tmp/sec1 && mkdir -p /tmp/sec1',
        `echo ${b64(REAL_GAMESOCKET_TS)} | base64 -d > /tmp/sec1/gameSocket.ts`,
        `echo ${b64(REAL_API_TS)} | base64 -d > /tmp/sec1/api.ts`,
        `echo ${b64(HARNESS_CJS)} | base64 -d > /tmp/sec1/sec1_url_harness.cjs`,
        'echo STAGED',
      ].join('\n'),
      60000,
    );

    // 2) Run the harness against the REAL builders with the canary secret.
    const run = await testdriver.exec(
      'sh',
      [
        'cd /tmp/sec1',
        `export SEC1_GAMESOCKET_TS=/tmp/sec1/gameSocket.ts`,
        `export SEC1_API_TS=/tmp/sec1/api.ts`,
        `export SEC1_CANARY=${CANARY}`,
        'node sec1_url_harness.cjs',
      ].join('\n'),
      60000,
    );
    const out = String(run?.stdout ?? run ?? '');
    console.log('SEC-1 harness output:\n' + out);

    const wsLine = (out.match(/^WS_URL=.*$/m) || [])[0] || '';
    const wsFail = (out.match(/^WS_MATCH_FAIL=.*$/m) || [])[0] || '';
    const discordUrlLine = (out.match(/^DISCORD_STATUS_URL=.*$/m) || [])[0] || '';
    const discordNoLeak = (out.match(/^DISCORD_NO_LEAK=.*$/m) || [])[0] || '';
    const discordFail = (out.match(/^DISCORD_MATCH_FAIL=.*$/m) || [])[0] || '';

    // Extraction must have succeeded — otherwise the gate is meaningless. A
    // MATCH_FAIL means the harness could not locate the real builder (source
    // refactored past the extractor); surface it loudly rather than passing.
    expect(wsFail, `harness failed to extract getWsUrl() from gameSocket.ts: ${wsFail}`).toBe('');
    expect(
      discordFail,
      `harness failed to locate /auth/discord/status/ in api.ts: ${discordFail}`,
    ).toBe('');
    expect(wsLine, 'harness did not report a WS_URL — the WebSocket builder did not run').not.toBe(
      '',
    );

    // === SEC-1 contract ===
    // The player secret (canary) must NOT appear anywhere in the WebSocket
    // connect URL. On current code the builder does
    //   url.searchParams.set('secret', playerSecret)
    // so the canary lands in `?secret=<CANARY>` and this assertion FAILS — an
    // intentional red gate. It goes green once the secret moves out of the URL
    // (Authorization header / POST body / first WS message).
    expect(
      wsLine.includes(CANARY),
      `SEC-1 leak: player secret found in the WebSocket connect URL -> ${wsLine}`,
    ).toBe(false);

    // The player secret must NOT appear in the /auth/discord/status/ GET query.
    // Current code builds `...?player_id=...&player_secret=${playerSecret}`, so
    // DISCORD_STATUS_URL carries the canary and this FAILS. It goes green when
    // the endpoint reports DISCORD_NO_LEAK (secret moved to a header/body).
    if (discordUrlLine) {
      expect(
        discordUrlLine.includes(CANARY),
        `SEC-1 leak: player secret found in the discord status GET query -> ${discordUrlLine}`,
      ).toBe(false);
    } else {
      // No leaky query template present — the fixed state.
      expect(
        discordNoLeak,
        'expected either a discord status URL or an explicit DISCORD_NO_LEAK marker',
      ).not.toBe('');
    }

    // Belt-and-suspenders: the canary must not appear ANYWHERE in the harness
    // output (covers any future URL/console/error string that echoes it).
    expect(
      out.includes(CANARY),
      `SEC-1 leak: the player-secret canary appeared in produced URL output:\n${out}`,
    ).toBe(false);
  });
});
