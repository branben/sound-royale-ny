import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { TestDriver } from "testdriverai/vitest/hooks";

// ---------------------------------------------------------------------------
// SEC-1 (security) — issue #105
//
// "Player secret is exposed via URL query param or console/error string.
//  Move to Authorization header / POST body / first WS message."
//
// A player's `player_secret` is a bearer credential: anyone holding it can act
// as that player (start/reset the game, cast votes, kick players, link a
// Discord account, rejoin). SEC-1 names TWO leak vectors and this gate covers
// BOTH of them:
//
//   1. URL query param — leaks the credential into:
//        - the browser address bar and history,
//        - server / proxy / CDN access logs,
//        - the HTTP `Referer` header sent to third parties,
//        - WebSocket handshake URLs captured in devtools / logs.
//   2. console / error string — leaks the credential into:
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
// It scans EVERY client service source (src/services/*.ts), not a hard-coded
// pair of files, so a refactor cannot route the secret through a third module
// undetected.
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
const repoRoot = join(__dirname, "..", "..");
const servicesDir = join(repoRoot, "src", "services");

/**
 * Every client service source under review, as { name, source } pairs.
 * Scanning the whole directory (rather than two hard-coded files) means a
 * future refactor that moves the leaking code into a new module is still
 * caught by this gate.
 */
const SERVICE_SOURCES = readdirSync(servicesDir)
  .filter((f) => f.endsWith(".ts") && !f.endsWith(".d.ts"))
  .map((name) => ({
    name,
    source: readFileSync(join(servicesDir, name), "utf8"),
  }));

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
// A console.* call that passes a secret-bearing identifier as an argument,
// e.g. `console.error('secret', playerSecret)` or
// `console.log(\`...${player_secret}...\`)`. We match a console.* call whose
// argument list mentions a secret variable. Kept deliberately specific to the
// known secret identifiers so ordinary logging does not false-positive.
const CONSOLE_SECRET_PATTERN =
  /console\.(?:log|error|warn|info|debug)\([^)]*\b(?:playerSecret|player_secret|sessionSecret|discord_session_secret|discordSessionSecret)\b/i;

/**
 * Strip line (`//`) and block comments so the doc comments in the source
 * (which legitimately mention `?secret=` while explaining the fix) don't
 * trigger false positives. We only want to gate on executable code.
 */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "") // block comments
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1"); // line comments (leave URLs' `://`)
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

function findConsoleLeaks({ name, source }) {
  const code = stripComments(source);
  const m = code.match(CONSOLE_SECRET_PATTERN);
  return m ? [`${name}: matched ${CONSOLE_SECRET_PATTERN} near "${m[0]}"`] : [];
}

describe("SEC-1: player secret must never travel in a URL or console string (#105)", () => {
  it("exposes the service sources under review (sanity)", () => {
    // Guard against a refactor that renames/moves the services dir silently
    // turning this whole gate into a no-op.
    const names = SERVICE_SOURCES.map((s) => s.name);
    expect(names).toContain("api.ts");
    expect(names).toContain("gameSocket.ts");
  });

  it("no client service puts the secret in a request URL", () => {
    const leaks = SERVICE_SOURCES.flatMap(findUrlLeaks);
    expect(
      leaks,
      "No request URL (path, query string, or WebSocket handshake) may carry " +
        "player_secret / secret / discord_session_secret. Move the credential " +
        "to the Authorization header, the POST body, or the first WebSocket " +
        "message after connect.\n" +
        leaks.join("\n"),
    ).toEqual([]);
  });

  it("no client source builds a `player_secret=` / `secret=` query string", () => {
    // Belt-and-suspenders: catch the literal template-string form
    //   `/auth/discord/status/?player_id=${id}&player_secret=${secret}`
    // that api.ts currently uses, independent of the searchParams form.
    const combined = SERVICE_SOURCES.map((s) => stripComments(s.source)).join(
      "\n",
    );
    const literalTemplateLeak =
      /[?&](?:player_secret|secret|discord_session_secret)=\$\{/.test(combined);
    expect(
      literalTemplateLeak,
      "A URL template string interpolates a secret into a query param " +
        "(e.g. `?player_secret=${playerSecret}`). Move the credential out of " +
        "the URL (Authorization header / POST body / first WS message).",
    ).toBe(false);
  });

  it("no client service logs the secret to the console / an error string", () => {
    // Second half of SEC-1: the credential must not land in a console.* call
    // (which flows to devtools and — via api.ts's response interceptor that
    // ships config.url to /errors/log/ — the backend error log).
    const leaks = SERVICE_SOURCES.flatMap(findConsoleLeaks);
    expect(
      leaks,
      "A console.* call receives the player/session secret. Never log a bearer " +
        "credential (or a URL/string that embeds one). Redact it before " +
        "logging.\n" +
        leaks.join("\n"),
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
    "live: the browser URL never exposes the player secret after joining a room",
    async (context) => {
      const testdriver = TestDriver(context);
      await testdriver.provision.chrome({ url: BASE_URL });

      // Let the SPA hydrate and dismiss the How to Play modal (matches the
      // smoke suite's onboarding behaviour) so the lobby is interactable.
      await testdriver.wait(4000);
      const dismiss = await testdriver.find(
        "the Close button that dismisses the How to Play instructions modal",
      );
      if (dismiss.found()) {
        await dismiss.click();
        await testdriver.wait(1000);
      }

      // Create a room so the app authenticates and opens its WebSocket using
      // the player secret — the moment SEC-1 protects.
      const createBtn = await testdriver.find(
        "the button to create or host a new battle room",
      );
      await createBtn.click();
      await testdriver.wait(2000);

      // Some deployments prompt for a display name before entering the room.
      const nameField = await testdriver.find(
        "a text input asking for a player / display name",
      );
      if (nameField.found()) {
        await nameField.click();
        await testdriver.type("SEC1Tester");
        const confirm = await testdriver.find(
          "the button that confirms the name and enters the room",
        );
        if (confirm.found()) await confirm.click();
      }

      // Wait for the room/lobby to settle and the WebSocket to connect.
      await testdriver.wait(5000);

      // The core assertion: the address bar must not reveal the secret.
      const urlIsClean = await testdriver.assert(
        "the browser address bar / URL does NOT contain a 'secret=', " +
          "'player_secret=', or 'discord_session_secret=' query parameter " +
          "(the room URL may contain a room code, but no credential/secret)",
      );
      expect(urlIsClean).toBeTruthy();
    },
  );
});
