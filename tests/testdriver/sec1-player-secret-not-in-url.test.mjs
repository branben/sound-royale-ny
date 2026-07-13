import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TestDriver } from 'testdriverai/vitest/hooks';

// ---------------------------------------------------------------------------
// SEC-1 (security) — issue #105
//
// "Player secret is exposed via URL query param or console/error string.
//  Move to Authorization header / POST body / first WS message."
//
// A player's `player_secret` is a bearer credential: anyone holding it can act
// as that player (start/reset the game, cast votes, kick players, link a
// Discord account, rejoin). SEC-1 names TWO leak vectors, and this gate covers
// BOTH of them:
//
//   1. URL query string  — leaks the credential into the browser address bar
//      and history, server / proxy / CDN access logs, the HTTP `Referer`
//      header sent to third parties, and WebSocket handshake URLs captured in
//      devtools / logs.
//   2. console / error string — leaks the credential into the browser console,
//      error-tracking / logging services (Sentry etc.), and any surfaced
//      error message.
//
// This gate proves the credential is NOT carried in any request URL and is NOT
// interpolated into a console log or thrown-error string. It is a
// source-contract regression gate in the same spirit as this PR's
// `backend/game_engine/test_db_txn_safety.py` (assert the fix is *present in
// the code*, not just that a happy path works). It is written as a TestDriver
// test so it runs in the same `vitest.testdriver.config.mjs` suite; it also
// optionally drives a real browser against the deployment when one is wired
// (see the `SOUND_ROYALE_URL` block below).
//
// Coverage: the SEC-1 contract is "the secret never travels in a URL —
// anywhere in the client", so rather than hand-pick a couple of files this
// gate scans the ENTIRE client source tree (`src/**/*.ts` and `src/**/*.tsx`,
// excluding test/spec/setup files). A future leak introduced in ANY module —
// a service, a React component, a context, a page, a hook — is caught.
// `gameSocket.ts` and `api.ts` (the two known offenders today) are also
// asserted explicitly by name so the failure output names them directly.
//
// Expected lifecycle:
//   - BEFORE the fix (current code): the WebSocket URL sets `?secret=...` and
//     `discordApi.getAccountStatus` builds `?player_id=...&player_secret=...`.
//     => the assertions below FAIL (intentional red guard).
//   - AFTER the fix (SEC-1): the secret moves to the Authorization header /
//     POST body / first WS message and disappears from every URL (and is never
//     logged). => this test goes green automatically.
// ---------------------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..', '..');
const srcDir = join(repoRoot, 'src');
const servicesDir = join(srcDir, 'services');

function readSource(absPath) {
  return readFileSync(absPath, 'utf8');
}

// The two known offenders today — asserted explicitly so failure output names
// the exact file to fix.
const GAME_SOCKET_TS = readSource(join(servicesDir, 'gameSocket.ts'));
const API_TS = readSource(join(servicesDir, 'api.ts'));

// Recursively collect every client source module under src/, so a future leak
// in ANY module (a service, component, context, page, hook, …) is caught.
// Excludes test/spec/setup files and non-source entries.
function collectSourceFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) {
      // Skip the app's own test folder (fixtures/mocks legitimately contain
      // `player_secret` in mock JSON payloads — not a URL/log leak).
      if (entry.name === 'test' || entry.name === '__tests__') continue;
      out.push(...collectSourceFiles(abs));
    } else if (
      entry.isFile() &&
      /\.tsx?$/.test(entry.name) &&
      !/\.(test|spec)\.tsx?$/.test(entry.name) &&
      !/\.d\.ts$/.test(entry.name) &&
      !/\bsetupTests?\./.test(entry.name)
    ) {
      out.push(abs);
    }
  }
  return out;
}

const ALL_CLIENT_SOURCES = collectSourceFiles(srcDir).map((abs) => ({
  // Label with the repo-relative path so failure output points to the file.
  name: relative(repoRoot, abs).split(sep).join('/'),
  source: readSource(abs),
}));

// A sentinel we treat as "a player secret". Case-insensitive so we catch both
// the frontend camelCase (`playerSecret`) and the wire snake_case
// (`player_secret`) spellings.
const SECRET_PARAM_PATTERNS = [
  // `?secret=...` or `&secret=...` (the WebSocket fallback param)
  /[?&]secret=/i,
  // `player_secret=` anywhere in a query string
  /[?&]player_secret=/i,
  // `discord_session_secret=` in a query string (same class of bearer leak)
  /[?&]discord_session_secret=/i,
];

// Programmatic query-param construction, e.g.
//   url.searchParams.set('secret', ...)
//   searchParams.append('player_secret', ...)
const SEARCHPARAMS_SET_PATTERNS = [
  /searchParams\.(?:set|append)\(\s*['"`]secret['"`]/i,
  /searchParams\.(?:set|append)\(\s*['"`]player_secret['"`]/i,
  /searchParams\.(?:set|append)\(\s*['"`]discord_session_secret['"`]/i,
];

// console / error-string leaks — the SECOND vector SEC-1 names ("... or
// console/error string"). SEC-1 has two console sub-risks:
//
//   (a) DIRECT: a secret variable is passed straight into a console.* call or
//       interpolated into a thrown-error message, e.g.
//         console.log('secret', playerSecret)
//         console.error(`ws failed with secret=${this.options.playerSecret}`)
//         throw new Error(`auth failed: ${playerSecret}`)
//       No client module does this today, so these patterns act as a
//       forward-looking regression guard: they stay green now and turn red the
//       moment someone logs a raw secret in the future.
//
//   (b) INDIRECT (the present risk): gameSocket.ts puts the secret in the WS
//       URL (`?secret=…`, line 89) and then logs the raw WebSocket error
//       (`console.error('[GameSocket] Error:', error)`), which can embed that
//       secret-bearing URL in the error string. This is ALREADY gated by the
//       URL half above (`searchParams.set('secret', …)`), and it resolves via
//       the SAME SEC-1 fix: once the secret leaves the URL it can no longer
//       appear in the logged error. So no separate pattern is needed for (b) —
//       fixing the URL leak fixes the log leak.
//
// The patterns below are deliberately anchored to console.*/throw so we don't
// flag the many legitimate `playerSecret` reads/passes elsewhere in the client.
const CONSOLE_ERROR_LEAK_PATTERNS = [
  // console.<method>( ... <secret ident> ... )  — same statement/line
  /console\.(?:log|error|warn|info|debug|trace)\([^)\n]*\b(?:player_?secret|discord_?session_?secret)\b/i,
  // throw new <Error>( ... `${...secret...}` ... )  — secret in a template literal
  /throw\s+new\s+\w*Error\([^)\n]*\$\{[^}\n]*\b(?:player_?secret|discord_?session_?secret)\b/i,
];

const ALL_PATTERNS = [
  ...SECRET_PARAM_PATTERNS,
  ...SEARCHPARAMS_SET_PATTERNS,
  ...CONSOLE_ERROR_LEAK_PATTERNS,
];

/**
 * Strip line (`//`) and block comments so the doc comments in the source
 * (which legitimately mention `?secret=` while explaining the fix) don't
 * trigger false positives. We only want to gate on executable code.
 */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '') // block comments
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1'); // line comments (leave URLs' `://`)
}

function findLeaks(label, source) {
  const code = stripComments(source);
  const leaks = [];
  for (const re of ALL_PATTERNS) {
    const m = code.match(re);
    if (m) leaks.push(`${label}: matched ${re} near "${m[0]}"`);
  }
  return leaks;
}

describe('SEC-1: player secret must never travel in a URL or a log (#105)', () => {
  it('WebSocket auth (gameSocket.ts) does not put the secret in the URL', () => {
    const leaks = findLeaks('gameSocket.ts', GAME_SOCKET_TS);
    expect(
      leaks,
      'The WebSocket connection URL must not carry the player secret as a ' +
        'query param. Move it to the Authorization header or send it as the ' +
        'first WebSocket message after connect.\n' +
        leaks.join('\n'),
    ).toEqual([]);
  });

  it('HTTP client (api.ts) does not put the secret in a request URL', () => {
    const leaks = findLeaks('api.ts', API_TS);
    expect(
      leaks,
      'No request URL (path or query string) may contain player_secret / ' +
        'discord_session_secret. Send credentials in the request body (POST) ' +
        'or an Authorization header instead.\n' +
        leaks.join('\n'),
    ).toEqual([]);
  });

  it('no client source builds a `player_secret=` / `secret=` query string', () => {
    // Belt-and-suspenders: catch the literal template-string form
    //   `/auth/discord/status/?player_id=${id}&player_secret=${secret}`
    // that api.ts currently uses, independent of the searchParams form.
    const combined = stripComments(GAME_SOCKET_TS) + '\n' + stripComments(API_TS);
    const literalTemplateLeak = /[?&](?:player_secret|secret|discord_session_secret)=\$\{/.test(
      combined,
    );
    expect(
      literalTemplateLeak,
      'A URL template string interpolates a secret into a query param ' +
        '(e.g. `?player_secret=${playerSecret}`). Move the credential out of ' +
        'the URL (Authorization header / POST body / first WS message).',
    ).toBe(false);
  });

  it('no client module (src/**/*.ts[x]) leaks a secret into a URL or a console/error string', () => {
    // Whole-tree sweep so a future leak in ANY client module — service,
    // component, context, page, or hook — can't slip past the explicitly-named
    // gates above. Covers both SEC-1 vectors: URL query params AND
    // console/error strings.
    const leaks = ALL_CLIENT_SOURCES.flatMap(({ name, source }) => findLeaks(name, source));
    expect(
      leaks,
      'A client module carries a player/session secret in a URL query string, ' +
        'a WebSocket URL, or a console/error string. Move the credential to ' +
        'the Authorization header / POST body / first WS message, and never ' +
        'log it.\n' +
        leaks.join('\n'),
    ).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // Optional live end-to-end gate.
  //
  // When a reachable deployment is wired via SOUND_ROYALE_URL (the same repo
  // variable the smoke suite uses), drive a real browser: create/join a room
  // so the app opens its authenticated WebSocket, then assert the visible
  // address bar shows no `secret=` / `player_secret=` query param. This
  // catches leaks that only manifest at runtime (e.g. a redirect that appends
  // the credential). It is skipped locally when the URL is not set so the
  // source-contract gates above always run.
  // -------------------------------------------------------------------------
  const BASE_URL = process.env.SOUND_ROYALE_URL;
  const liveIt = BASE_URL && BASE_URL.trim() ? it : it.skip;

  liveIt(
    'live: the browser URL never exposes the player secret after joining a room',
    async (context) => {
      const testdriver = TestDriver(context);
      await testdriver.provision.chrome({ url: BASE_URL });

      // Let the SPA hydrate and dismiss the How to Play modal (matches the
      // smoke suite's onboarding behaviour) so the lobby is interactable.
      await testdriver.wait(4000);
      const dismiss = await testdriver.find(
        'the Close button that dismisses the How to Play instructions modal',
      );
      if (dismiss.found()) {
        await dismiss.click();
        await testdriver.wait(1000);
      }

      // Create a room so the app authenticates and opens its WebSocket using
      // the player secret — the moment SEC-1 protects.
      const createBtn = await testdriver.find('the button to create or host a new battle room');
      await createBtn.click();
      await testdriver.wait(2000);

      // Some deployments prompt for a display name before entering the room.
      const nameField = await testdriver.find('a text input asking for a player / display name');
      if (nameField.found()) {
        await nameField.click();
        await testdriver.type('SEC1Tester');
        const confirm = await testdriver.find(
          'the button that confirms the name and enters the room',
        );
        if (confirm.found()) await confirm.click();
      }

      // Wait for the room/lobby to settle and the WebSocket to connect.
      await testdriver.wait(5000);

      // The core assertion: the address bar must not reveal the secret.
      const urlIsClean = await testdriver.assert(
        "the browser address bar / URL does NOT contain a 'secret=', " +
          "'player_secret=', or 'discord_session_secret=' query parameter " +
          '(the room URL may contain a room code, but no credential/secret)',
      );
      expect(urlIsClean).toBeTruthy();
    },
  );
});
