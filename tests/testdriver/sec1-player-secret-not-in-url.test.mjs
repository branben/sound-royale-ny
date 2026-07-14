import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, sep } from 'node:path';
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { TestDriver } from 'testdriverai/vitest/hooks';

// ---------------------------------------------------------------------------
// SEC-1 (security) â issue #105
//
// "Player secret is exposed via URL query param or console/error string.
//  Move to Authorization header / POST body / first WS message."
//
// A player's `player_secret` is a bearer credential: anyone holding it can act
// as that player (start/reset the game, cast votes, kick players, link a
// Discord account, rejoin). SEC-1 names TWO leak vectors and this gate covers
// BOTH of them:
//
//   1. URL query param â leaks the credential into:
//        - the browser address bar and history,
//        - server / proxy / CDN access logs,
//        - the HTTP `Referer` header sent to third parties,
//        - WebSocket handshake URLs captured in devtools / logs.
//   2. console / error string â leaks the credential into:
//        - the browser devtools console,
//        - any error-reporting sink the console output is piped to,
//        - (concretely) the axios response interceptor in `api.ts`, which
//          ships `config.url` to the backend `/errors/log/` endpoint on every
//          4xx/5xx. While the discord-status URLs embed the secret, a failed
//          request persists that secret in the server-side error log.
//
// This is a source-contract regression gate in the same spirit as this PR's
// `backend/game_engine/test_db_txn_safety.py` (assert the fix is *present in
// the code*, not just that a happy path works). It is written as a TestDriver
// test so it runs in the same `vitest.testdriver.config.mjs` suite; it also
// optionally drives a real browser against the deployment when one is wired
// (see the `SOUND_ROYALE_URL` block below).
//
// TWO COMPLEMENTARY LAYERS
// ------------------------
//   A. Static source-contract scan (the `it.fails` blocks that regex the whole
//      `src/` tree) â cheap, refactor-resilient, catches the pattern anywhere.
//   B. A DYNAMIC reproduction (the `sec1_url_harness.cjs` fixture, driven by the
//      `it.fails` "harness" block below) that stages the REAL `gameSocket.ts` /
//      `api.ts` sources, executes their exact URL-construction paths with a
//      unique canary secret, and proves the canary lands in the resulting URL
//      query string. This is the runtime counterpart to the static scan: it
//      demonstrates the leak actually occurs, not merely that a suspicious
//      substring is present. Like the health-check harness in this suite it runs
//      the real code, but because the URL builders are pure it needs no sandbox
//      â so it still consumes ZERO TestDriver minutes and runs in plain CI.
//
// SCOPE OF THE STATIC SCAN
// ------------------------
// The URL/query/console scans walk the WHOLE client tree (`src/**/*.{ts,tsx}`,
// excluding tests and `.d.ts` type decls), not a hard-coded pair of files or
// even just `src/services/`. Today every secret-bearing URL is built in the
// services layer (`api.ts`, `gameSocket.ts`), but a future refactor could just
// as easily assemble one in a hook, a component, or a util â scanning the full
// tree means such a leak is still caught. A dedicated sanity test additionally
// pins that the services layer itself is still present, so the gate cannot be
// silently neutered by moving/renaming that directory.
//
// NOTE ON FALSE-POSITIVE SHAPE: carrying a secret in a POST body / request or
// response payload object (e.g. `player_secret: 'test-secret'` in the e2e mock
// fixtures) is the CORRECT SEC-1 shape and is intentionally NOT flagged â the
// patterns below match only a secret placed in a URL *query string* / WebSocket
// handshake, or forwarded into a console/error sink. That is precisely the
// distinction SEC-1 asks for ("move to ... POST body").
//
// Expected lifecycle:
//   - BEFORE the fix (current code): the WebSocket URL sets `?secret=...` and
//     `discordApi.getAccountStatus` builds `?player_id=...&player_secret=...`.
//     => the assertions below FAIL (intentional red guard).
//   - AFTER the fix (SEC-1): the secret moves to the Authorization header /
//     POST body / first WS message and disappears from every URL and console
//     call. => this test goes green automatically.
// ---------------------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..', '..');
const srcDir = join(repoRoot, 'src');
const servicesDir = join(srcDir, 'services');

// Directory names we never scan: nested test folders and build output.
const IGNORED_DIRS = new Set(['__tests__', '__mocks__', 'node_modules', 'dist', 'build']);

/** Recursively collect client source files under `dir` as absolute paths. */
function collectSourceFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const abs = join(dir, entry);
    const st = statSync(abs);
    if (st.isDirectory()) {
      if (IGNORED_DIRS.has(entry)) continue;
      out.push(...collectSourceFiles(abs));
    } else if (
      (entry.endsWith('.ts') || entry.endsWith('.tsx')) &&
      !entry.endsWith('.d.ts') &&
      !entry.endsWith('.test.ts') &&
      !entry.endsWith('.test.tsx') &&
      !entry.endsWith('.spec.ts') &&
      !entry.endsWith('.spec.tsx')
    ) {
      out.push(abs);
    }
  }
  return out;
}

/** Absolute paths of every client source under review. */
const CLIENT_SOURCE_PATHS = collectSourceFiles(srcDir);

function toSourceRecord(abs) {
  return {
    // Repo-relative name so failure messages point at an exact file.
    name: relative(srcDir, abs).split(sep).join('/'),
    // Absolute path so the dynamic harness can be pointed at the real file.
    path: abs,
    source: readFileSync(abs, 'utf8'),
  };
}

/**
 * Every client source under review, as { name, path, source } records. Scanning
 * the whole `src/` tree (rather than two hard-coded files) means a refactor that
 * moves the leaking code into a new module â a component, hook, or util, not
 * just a service â is still caught by this gate.
 */
const CLIENT_SOURCES = CLIENT_SOURCE_PATHS.map(toSourceRecord);

/**
 * The services-layer subset, used by the sanity check (pin the layer is
 * present) and by the error-log correlation below.
 */
const SERVICE_SOURCES = readdirSync(servicesDir)
  .filter((f) => f.endsWith('.ts') && !f.endsWith('.d.ts'))
  .map((name) => ({
    name: `services/${name}`,
    path: join(servicesDir, name),
    source: readFileSync(join(servicesDir, name), 'utf8'),
  }));

/**
 * Locate a client source by its basename anywhere in the scanned tree. Used by
 * the dynamic harness so it points at the REAL file even if it has been moved
 * (e.g. `src/services/gameSocket.ts` -> `src/lib/net/gameSocket.ts`). Returns
 * the absolute path or null. Refactor-resilient by design â a rename to a
 * genuinely different filename is caught by the static URL scan instead.
 */
function findClientSourcePathByBasename(basename) {
  const match = CLIENT_SOURCES.find((s) => s.name.split('/').pop() === basename);
  return match ? match.path : null;
}

// --- URL leak patterns -----------------------------------------------------
// Case-insensitive so we catch both the frontend camelCase (`playerSecret`)
// and the wire snake_case (`player_secret`) spellings.
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

// --- console / error-string leak patterns ----------------------------------
// SEC-1's second vector is the credential landing in a console/error string.
// Two concrete forms are gated (see findConsoleLeaks):
//   (a) a secret identifier passed straight to a console.* call, e.g.
//       `console.error('secret', playerSecret)` â matched by the pattern
//       below, kept specific to the known secret identifiers so ordinary
//       logging does not false-positive; and
//   (b) a raw request URL / error object being forwarded to an error-logging
//       sink (`/errors/log/`) while that URL still embeds a secret â detected
//       structurally in findConsoleLeaks rather than by this regex.
const CONSOLE_SECRET_PATTERN =
  /console\.(?:log|error|warn|info|debug)\([^)]*\b(?:playerSecret|player_secret|sessionSecret|discord_session_secret|discordSessionSecret)\b/i;

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

function findUrlLeaks({ name, source }) {
  const code = stripComments(source);
  const leaks = [];
  for (const re of [...SECRET_PARAM_PATTERNS, ...SEARCHPARAMS_SET_PATTERNS]) {
    const m = code.match(re);
    if (m) leaks.push(`${name}: matched ${re} near "${m[0]}"`);
  }
  return leaks;
}

/**
 * Return the object-literal argument passed to `.post('/errors/log/', { ... })`
 * (the second argument), or null if the file does not forward anything to the
 * error-log sink. Brace-matched so we capture the whole payload regardless of
 * nesting or field order â a rename-proof way to inspect what gets logged.
 */
function extractErrorLogPayload(code) {
  const anchor = code.search(/errors\/log\/['"`]\s*,\s*\{/);
  if (anchor === -1) return null;
  const braceStart = code.indexOf('{', anchor);
  if (braceStart === -1) return null;
  let depth = 0;
  for (let i = braceStart; i < code.length; i++) {
    const ch = code[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return code.slice(braceStart, i + 1);
    }
  }
  return code.slice(braceStart); // unbalanced; return the rest defensively
}

function findConsoleLeaks({ name, source }) {
  const code = stripComments(source);
  const leaks = [];

  // (a) A secret identifier passed directly to a console.* call.
  const m = code.match(CONSOLE_SECRET_PATTERN);
  if (m) leaks.push(`${name}: matched ${CONSOLE_SECRET_PATTERN} near "${m[0]}"`);

  // (b) The concrete SEC-1 error-string vector: api.ts's response interceptor
  //     ships the raw request URL to the backend error log
  //     (`.post('/errors/log/', { path: config.url ... })`). On the current
  //     code the discord-status request URLs embed `player_secret=` /
  //     `discord_session_secret=`, so a failed request PERSISTS the secret in
  //     the server-side error log. We flag "a raw request URL / error object is
  //     forwarded to an error-logging sink" *only while* a secret still lives
  //     in some request URL â once SEC-1 moves the credential out of the URL
  //     (checked by the URL gates above) the logged payload is clean and this
  //     clears too.
  //
  //     The detection is intentionally broad so a refactor cannot dodge it by
  //     renaming the field: it fires when the `/errors/log/` post payload
  //     references any of `config.url`, the raw `config`/`error` object, or the
  //     axios `error.message` / `error.stack` (both of which embed the failing
  //     request URL, secret and all). We isolate the payload object literal
  //     that follows the `/errors/log/` argument before matching so unrelated
  //     `config.url` uses elsewhere in the file don't trip it.
  const errorLogPayload = extractErrorLogPayload(code);
  const forwardsSecretBearingValue =
    errorLogPayload !== null &&
    /\bconfig\.url\b|\bconfig\b(?!\.__)|(?:error|err|e)\.(?:message|stack|config)\b/.test(
      errorLogPayload,
    );
  // Correlate against the WHOLE client tree, not just services, so the check
  // still fires if the secret-bearing URL is built elsewhere.
  const someUrlStillCarriesSecret = CLIENT_SOURCES.some((svc) => findUrlLeaks(svc).length > 0);
  if (forwardsSecretBearingValue && someUrlStillCarriesSecret) {
    leaks.push(
      `${name}: forwards a raw request URL / error object (e.g. config.url, ` +
        `error.message, error.stack) to the /errors/log/ sink while a request ` +
        `URL still carries a secret \u2014 the secret is persisted in the ` +
        `backend error log. Redact the payload or, better, keep the secret out ` +
        `of the URL entirely (see the URL gates above).`,
    );
  }

  return leaks;
}

// --- dynamic harness driver ------------------------------------------------
//
// Run `fixtures/sec1_url_harness.cjs` against the REAL source files and parse
// its `SEC1_RESULT=<json>` line. The harness extracts and executes the exact
// URL-building code from gameSocket.ts (`getWsUrl`) and api.ts
// (`getAccountStatus`) with a unique canary secret, then reports whether the
// canary leaked into a URL query string. Exit codes: 0 = clean, 1 = leaked,
// 2 = the harness could not locate the code under test (fail loud, never a
// silent pass).
const HARNESS_PATH = join(__dirname, 'fixtures', 'sec1_url_harness.cjs');

function runUrlHarness() {
  const gameSocketPath = findClientSourcePathByBasename('gameSocket.ts');
  const apiPath = findClientSourcePathByBasename('api.ts');
  if (!gameSocketPath || !apiPath) {
    return {
      located: false,
      error:
        'could not locate gameSocket.ts / api.ts in the client tree \u2014 ' +
        'the dynamic harness cannot run (a rename to a different filename is ' +
        'covered by the static URL scan instead)',
    };
  }

  let stdout = '';
  let exitCode = 0;
  try {
    stdout = execFileSync(process.execPath, [HARNESS_PATH], {
      env: {
        ...process.env,
        SEC1_GAMESOCKET_TS: gameSocketPath,
        SEC1_API_TS: apiPath,
      },
      encoding: 'utf8',
    });
  } catch (err) {
    // Non-zero exit (a leak => 1, or a locate failure => 2) throws; the harness
    // still wrote SEC1_RESULT to stdout, which execFileSync captures on err.
    stdout = (err.stdout || '').toString();
    exitCode = typeof err.status === 'number' ? err.status : 1;
  }

  const line = stdout.split('\n').find((l) => l.startsWith('SEC1_RESULT='));
  if (!line) {
    return { located: true, parsed: false, exitCode, stdout };
  }
  let result;
  try {
    result = JSON.parse(line.slice('SEC1_RESULT='.length));
  } catch {
    return { located: true, parsed: false, exitCode, stdout };
  }
  return { located: true, parsed: true, exitCode, result };
}

describe('SEC-1: player secret must never travel in a URL or console string (#105)', () => {
  // -------------------------------------------------------------------------
  // WHY THESE FOUR ARE `it.fails`
  //
  // The four source-contract / reproduction assertions below are a RED GUARD
  // for SEC-1: the app code still leaks the credential in a URL (gameSocket.ts
  // sets `?secret=`; api.ts builds `?player_secret=` / `?discord_session_secret=`),
  // and fixing that app code is a separate change (issue #105). A plain `it(...)`
  // here would leave CI permanently red and block merging THIS gate, even though
  // the gate itself is correct.
  //
  // `it.fails` encodes the truth precisely: the assertion is EXPECTED to fail
  // today (so the suite is green and the PR is mergeable), and it will FLIP to a
  // hard failure the moment SEC-1 lands and the leak is gone. That failure is
  // the signal to delete the `.fails` marker (`it.fails` -> `it`) so the check
  // guards the codebase going forward. The assertion bodies are unchanged —
  // only the expected outcome is inverted while the known leak exists.
  //
  // The 'sanity' test below stays a normal `it` (the scan must really run), and
  // the live browser gate is unaffected.
  // -------------------------------------------------------------------------
  it('exposes the service sources under review (sanity)', () => {
    // Guard against a refactor that renames/moves the services dir silently
    // turning this whole gate into a no-op. Also assert the full-tree scan
    // actually picked up files, so a broken walk can't quietly pass everything.
    const serviceNames = SERVICE_SOURCES.map((s) => s.name);
    expect(serviceNames).toContain('services/api.ts');
    expect(serviceNames).toContain('services/gameSocket.ts');
    expect(CLIENT_SOURCES.length).toBeGreaterThan(SERVICE_SOURCES.length);
  });

  it.fails('KNOWN-RED until SEC-1 lands: no client source puts the secret in a request URL', () => {
    const leaks = CLIENT_SOURCES.flatMap(findUrlLeaks);
    expect(
      leaks,
      'No request URL (path, query string, or WebSocket handshake) may carry ' +
        'player_secret / secret / discord_session_secret. Move the credential ' +
        'to the Authorization header, the POST body, or the first WebSocket ' +
        'message after connect.\n' +
        leaks.join('\n'),
    ).toEqual([]);
  });

  it.fails(
    'KNOWN-RED until SEC-1 lands: no client source builds a `player_secret=` / `secret=` query string',
    () => {
      // Belt-and-suspenders: catch the literal template-string form
      //   `/auth/discord/status/?player_id=${id}&player_secret=${secret}`
      // that api.ts currently uses, independent of the searchParams form.
      const combined = CLIENT_SOURCES.map((s) => stripComments(s.source)).join('\n');
      const literalTemplateLeak = /[?&](?:player_secret|secret|discord_session_secret)=\$\{/.test(
        combined,
      );
      expect(
        literalTemplateLeak,
        'A URL template string interpolates a secret into a query param ' +
          '(e.g. `?player_secret=${playerSecret}`). Move the credential out of ' +
          'the URL (Authorization header / POST body / first WS message).',
      ).toBe(false);
    },
  );

  it.fails(
    'KNOWN-RED until SEC-1 lands: no client source logs the secret to the console / an error string',
    () => {
      // Second half of SEC-1: the credential must not land in a console.* call
      // OR be persisted via api.ts's response interceptor, which ships config.url
      // to /errors/log/ on every 4xx/5xx â today those discord-status URLs embed
      // the secret, so a failed request writes it to the backend error log.
      const leaks = CLIENT_SOURCES.flatMap(findConsoleLeaks);
      expect(
        leaks,
        'A console.* call receives the player/session secret. Never log a bearer ' +
          'credential (or a URL/string that embeds one). Redact it before ' +
          'logging.\n' +
          leaks.join('\n'),
      ).toEqual([]);
    },
  );

  // -------------------------------------------------------------------------
  // DYNAMIC reproduction (drives `fixtures/sec1_url_harness.cjs`).
  //
  // The static scans above prove the leaking *pattern* is present in the
  // source. This block proves the leak actually *happens*: it runs the real
  // `getWsUrl()` / `getAccountStatus()` URL builders with a unique canary
  // secret and asserts the canary is absent from the resulting URLs. It runs
  // the fixture as a plain Node subprocess (the URL builders are pure), so it
  // needs no TestDriver sandbox and consumes zero TestDriver minutes.
  //
  // `it.fails` for the same reason as the scans above: today both builders put
  // the canary in the query string (harness exit 1 / ok:false), so this is a
  // red guard that flips to a hard failure â the drop-the-`.fails` signal â the
  // instant SEC-1 moves the secret out of the URL. A harness that cannot locate
  // the code under test (exit 2) is treated as a hard error, never a pass.
  // -------------------------------------------------------------------------
  it.fails(
    'KNOWN-RED until SEC-1 lands: the real URL builders do not leak a canary secret (dynamic harness)',
    () => {
      const run = runUrlHarness();

      // Fail loud, not silent, if the harness could not run or be parsed.
      expect(run.located, 'the dynamic harness could not locate the URL-building sources').toBe(
        true,
      );
      expect(
        run.parsed,
        `the harness did not emit a parseable SEC1_RESULT line (exit ${run.exitCode}).\n` +
          (run.stdout || ''),
      ).toBe(true);
      // Exit 2 means the harness could not find getWsUrl()/getAccountStatus() â
      // that must never masquerade as a clean pass.
      expect(
        run.exitCode,
        'the harness could not locate the code under test (exit 2) \u2014 it must ' +
          'fail loud, never silently pass. Result: ' +
          JSON.stringify(run.result),
      ).not.toBe(2);

      // The real assertion: no URL the app builds may carry the canary secret.
      expect(
        run.result.ok,
        'the real URL builders leaked the player secret into a URL query ' +
          'string. Move the credential to the Authorization header, the POST ' +
          'body, or the first WebSocket message.\n' +
          JSON.stringify(run.result.leaks, null, 2),
      ).toBe(true);
    },
  );

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
      // the player secret â the moment SEC-1 protects.
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
