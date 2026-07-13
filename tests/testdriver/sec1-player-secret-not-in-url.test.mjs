import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";
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
// Discord account, rejoin). Putting a bearer credential in a URL query string
// leaks it into:
//   - the browser address bar and history,
//   - server / proxy / CDN access logs,
//   - the HTTP `Referer` header sent to third parties,
//   - WebSocket handshake URLs captured in devtools / logs.
//
// This gate proves the credential is NOT carried in any request URL. It is a
// source-contract regression gate in the same spirit as this PR's
// `backend/game_engine/test_db_txn_safety.py` (assert the fix is *present in
// the code*, not just that a happy path works). It is written as a TestDriver
// test so it runs in the same `vitest.testdriver.config.mjs` suite; it also
// optionally drives a real browser against the deployment when one is wired
// (see the `SOUND_ROYALE_URL` block below).
//
// Expected lifecycle:
//   - BEFORE the fix (current code): the WebSocket URL sets `?secret=...` and
//     `discordApi.getAccountStatus` builds `?player_id=...&player_secret=...`.
//     => the assertions below FAIL (intentional red guard).
//   - AFTER the fix (SEC-1): the secret moves to the Authorization header /
//     POST body / first WS message and disappears from every URL.
//     => this test goes green automatically.
// ---------------------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..", "..");
const srcRoot = join(repoRoot, "src");

// The real client source under review (kept as explicit, human-readable gates
// so a failure names the exact file the reviewer already knows leaks).
const GAME_SOCKET_TS = readFileSync(
  join(srcRoot, "services", "gameSocket.ts"),
  "utf8",
);
const API_TS = readFileSync(join(srcRoot, "services", "api.ts"), "utf8");

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

const ALL_LEAK_PATTERNS = [...SECRET_PARAM_PATTERNS, ...SEARCHPARAMS_SET_PATTERNS];

/**
 * Strip line (`//`) and block comments so the doc comments in the source
 * (which legitimately mention `?secret=` while explaining the fix) don't
 * trigger false positives. We only want to gate on executable code.
 *
 * The line-comment pass only treats `//` as a comment when it is NOT the `//`
 * of a URL scheme (`http://`, `ws://`, …). We approximate that by refusing to
 * start a comment when the two chars before `//` are `:/` — i.e. the `//` is
 * part of `://` — which keeps any real query string on that line intact.
 */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "") // block comments
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1"); // line comments (leave URLs' `://`)
}

function findLeaks(label, source) {
  const code = stripComments(source);
  const leaks = [];
  for (const re of ALL_LEAK_PATTERNS) {
    const m = code.match(re);
    if (m) leaks.push(`${label}: matched ${re} near "${m[0]}"`);
  }
  return leaks;
}

/** Recursively collect client source files under src/ (skip test/spec files). */
function collectClientSources(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (entry === "__tests__" || entry === "node_modules") continue;
      out.push(...collectClientSources(full));
    } else if (
      /\.(?:ts|tsx|js|jsx|mjs|cjs)$/.test(entry) &&
      !/\.(?:test|spec)\.[a-z]+$/.test(entry) &&
      !/\.d\.ts$/.test(entry)
    ) {
      out.push(full);
    }
  }
  return out;
}

describe("SEC-1: player secret must never travel in a URL query string (#105)", () => {
  it("WebSocket auth (gameSocket.ts) does not put the secret in the URL", () => {
    const leaks = findLeaks("gameSocket.ts", GAME_SOCKET_TS);
    expect(
      leaks,
      "The WebSocket connection URL must not carry the player secret as a " +
        "query param. Move it to the Authorization header or send it as the " +
        "first WebSocket message after connect.\n" +
        leaks.join("\n"),
    ).toEqual([]);
  });

  it("HTTP client (api.ts) does not put the secret in a request URL", () => {
    const leaks = findLeaks("api.ts", API_TS);
    expect(
      leaks,
      "No request URL (path or query string) may contain player_secret / " +
        "discord_session_secret. Send credentials in the request body (POST) " +
        "or an Authorization header instead.\n" +
        leaks.join("\n"),
    ).toEqual([]);
  });

  it("no client source builds a `player_secret=` / `secret=` query string", () => {
    // Belt-and-suspenders: catch the literal template-string form
    //   `/auth/discord/status/?player_id=${id}&player_secret=${secret}`
    // that api.ts currently uses, independent of the searchParams form.
    const combined = stripComments(GAME_SOCKET_TS) + "\n" + stripComments(API_TS);
    const literalTemplateLeak =
      /[?&](?:player_secret|secret|discord_session_secret)=\$\{/.test(combined);
    expect(
      literalTemplateLeak,
      "A URL template string interpolates a secret into a query param " +
        "(e.g. `?player_secret=${playerSecret}`). Move the credential out of " +
        "the URL (Authorization header / POST body / first WS message).",
    ).toBe(false);
  });

  it("no client source ANYWHERE under src/ leaks the secret in a URL", () => {
    // Repo-wide sweep so the gate can't be silently bypassed by moving the
    // leaky code into a different file. Scans every non-test client source,
    // not just the two files we already know about.
    const leaks = [];
    for (const file of collectClientSources(srcRoot)) {
      const rel = relative(repoRoot, file);
      const src = readFileSync(file, "utf8");
      leaks.push(...findLeaks(rel, src));
    }
    expect(
      leaks,
      "A client source builds a URL that carries the player/Discord secret as " +
        "a query param. Every occurrence below must move the credential to an " +
        "Authorization header, a POST body, or the first WebSocket message.\n" +
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
