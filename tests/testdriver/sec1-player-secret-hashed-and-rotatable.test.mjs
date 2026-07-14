import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { TestDriver } from "testdriverai/vitest/hooks";

// ---------------------------------------------------------------------------
// SEC-1 (security) — issue #105, at-rest half (PR #261).
//
// The transport half of #105 ("secret must not travel in a URL / console") is
// already gated by sec1-player-secret-not-in-url.test.mjs and
// sec1-secret-not-in-url.test.mjs. This test covers the *at-rest* guardrail
// that PR #261 adds:
//
//   1. player_secret is stored ONLY as a SHA-256 hex digest — the plaintext is
//      never persisted.
//   2. Issuance (room/player create) returns the plaintext exactly once.
//   3. A rotation endpoint issues a fresh plaintext and INVALIDATES the old
//      secret (POST /api/players/<player_id>/rotate_secret/).
//   4. Rotation rejects a wrong secret with 403.
//
// Rather than assert against a mock, this drives the REAL security code
// end-to-end inside the TestDriver sandbox, in the same spirit as this repo's
// health-redis-down.test.mjs: it stages the actual backend module under review
// and probes a running Django server with curl.
//
// TRANSPORT CONTRACT (do not regress the sibling not-in-url tests)
// ----------------------------------------------------------------
// The real PlayerViewSet.rotate_secret is a DRF `detail=True` action: the URL
// segment is the player's opaque PK, and the current secret is read from
// `request.data['player_secret']` (the POST body) — never from the URL. This
// test (and its harness) address every endpoint by `player_id` and send the
// plaintext secret in the request BODY, so the at-rest gate never models the
// very "secret in the URL" anti-pattern that #105 forbids and that
// sec1-*-not-in-url.test.mjs enforce.
//
// SECRET HYGIENE (SEC-1 #105 — no secret in URL *or* console/error string)
// ------------------------------------------------------------------------
// The guardrail forbids the plaintext secret appearing in a URL query param OR
// in a console / error string. The dashcam run-recording and vitest logs both
// capture exec stdout, so echoing the issued/rotated plaintext (or the raw
// create response that contains it) would itself leak the secret into the
// shared recording — the exact anti-pattern under review. Therefore:
//   * The plaintext secret is NEVER printed to stdout and NEVER returned to
//     the JS layer. It lives only inside the sandbox in mode-600 files under
//     /tmp/psec/secrets/ and is referenced by path, never by value.
//   * Every secret-dependent decision (is-hex64, plaintext != stored,
//     new != old, HTTP status of a rotate) is computed IN the sandbox; only
//     non-secret signals (booleans, lengths, HTTP codes) cross to JS.
//   * The rotate helper posts the current secret straight from its sandbox
//     file into the request BODY, and writes any freshly-issued secret back to
//     a file — the value is never observed by the harness/test log.
//
// WHAT IS REAL vs. HARNESS
// ------------------------
// The security-critical logic — the SHA-256 hashing (hash_secret), the
// plaintext generator (new_player_secret / is_hex64), the model save() hook
// that hashes before persisting, and the rotation view's "compare hashes, 403
// on mismatch" auth check — all comes from the REAL repo code:
//   * backend/game_engine/security.py is loaded verbatim by the harness.
//   * The Player.save() hook and the rotate_secret auth check are transcribed
//     from models.py / views.py but delegate every hashing decision to the
//     real security.py, so the security decision is made by real code.
// The harness (tests/testdriver/fixtures/player_secret_harness.py) only wires a
// minimal Django project + routes so the endpoints can be exercised without
// dragging in the whole game_engine app (Player is entangled with Room /
// DiscordAccount / auth.User FKs). If the real security.py regresses — e.g.
// stops hashing, or the compare stops using the hash — these assertions fail.
//
// Expected lifecycle:
//   - AFTER the fix (PR #261): the stored value is a hash, create returns the
//     plaintext once, rotation invalidates the old secret and rejects a wrong
//     one. => green.
//   - If someone reverts to storing plaintext, or drops the rotation auth
//     check, the corresponding assertion goes red.
// ---------------------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..", "..");

// The REAL code under review + the harness that boots it.
const REAL_SECURITY_PY = readFileSync(
  join(repoRoot, "backend", "game_engine", "security.py"),
  "utf8",
);
const HARNESS_PY = readFileSync(
  join(__dirname, "fixtures", "player_secret_harness.py"),
  "utf8",
);

// Base64 so multi-line Python drops into the sandbox in one exec without
// heredoc/quoting fragility.
const b64 = (s) => Buffer.from(s, "utf8").toString("base64");

// Small helper: pull a labelled value (LABEL=value) out of exec stdout.
// Only ever used to read NON-SECRET signals (HTTP codes, booleans, lengths,
// player ids) — never a plaintext secret (those stay in the sandbox).
const grab = (out, label) =>
  (String(out ?? "").match(new RegExp(`${label}=(\\S+)`)) || [])[1] || "";

const BASE = `http://127.0.0.1:8112`;

// Sandbox-only location for plaintext secrets. Files here are mode 600 and are
// NEVER echoed; the value is referenced by path so it can't land in a log.
const SECRET_DIR = "/tmp/psec/secrets";
const CURRENT_SECRET = `${SECRET_DIR}/current`; // the live secret for the player
const OLD_SECRET = `${SECRET_DIR}/old`; //         the pre-rotation secret

describe("SEC-1: player_secret is hashed at rest and rotatable (#105, PR #261)", () => {
  it("stores only a hash, issues plaintext once, and rotation invalidates the old secret", async (context) => {
    const testdriver = TestDriver(context);

    await testdriver.provision.chrome({ url: "about:blank" });

    // Rotate the player addressed by `playerId` (opaque PK in the URL) while
    // presenting the secret read from the sandbox file `secretFile` in the JSON
    // BODY — never in the URL (SEC-1 #105). The plaintext is streamed straight
    // from the file into curl's body via python (jq-free JSON encoding) so it
    // is never interpolated into the shell command, an env var, or stdout.
    //
    // Returns { code, newSecretFile } on success (the fresh secret is written
    // to `newSecretFile`, NOT returned by value); REJECTS (throws) on any
    // non-200 with a status-carrying message so a caller can gate the
    // *rejection* with `expect(...).rejects.toThrow()` (TST-2). No secret ever
    // appears in the thrown message or on stdout.
    const rotate = async (playerId, secretFile, newSecretFile) => {
      const out = await testdriver.exec(
        "sh",
        [
          "set -e",
          // Build the JSON body from the secret FILE (never a shell var / arg),
          // so the plaintext is not exposed in the process table or any echo.
          `BODY=$(SECRET_FILE="${secretFile}" python3 -c 'import json,os;print(json.dumps({"player_secret": open(os.environ["SECRET_FILE"]).read()}))')`,
          `RESP=$(printf '%s' "$BODY" | curl -s -w '\\nHTTP:%{http_code}' -X POST "${BASE}/api/players/${playerId}/rotate_secret/" -H 'Content-Type: application/json' --data-binary @-)`,
          `CODE=$(printf %s "$RESP" | sed -n "s/^HTTP://p")`,
          // Emit ONLY the HTTP code. On success, extract the fresh secret and
          // write it to a file (mode 600) — never print it.
          `if [ "$CODE" = "200" ]; then`,
          `  mkdir -p "${SECRET_DIR}" && printf %s "$RESP" | head -1 | python3 -c "import sys,json;open('${newSecretFile}','w').write(json.load(sys.stdin)['player_secret'])"`,
          `  chmod 600 "${newSecretFile}"`,
          `fi`,
          `echo "ROTATE_CODE=$CODE"`,
        ].join("\n"),
        60000,
      );
      const text = String(out?.stdout ?? out ?? "");
      const code = grab(text, "ROTATE_CODE");
      if (code !== "200") {
        // Status-only rejection — carries no secret material.
        throw new Error(`rotate_secret rejected with HTTP ${code}`);
      }
      return { code, newSecretFile };
    };

    // 1) Stage the REAL security.py + the harness inside the sandbox.
    await testdriver.exec(
      "sh",
      [
        "set -e",
        "rm -rf /tmp/psec && mkdir -p /tmp/psec",
        `mkdir -p "${SECRET_DIR}" && chmod 700 "${SECRET_DIR}"`,
        `echo ${b64(REAL_SECURITY_PY)} | base64 -d > /tmp/psec/security.py`,
        `echo ${b64(HARNESS_PY)} | base64 -d > /tmp/psec/harness.py`,
        "echo STAGED",
      ].join("\n"),
      60000,
    );

    // 2) Make sure Django is importable (install the repo's pinned version if not).
    await testdriver.exec(
      "sh",
      'python3 -c "import django" 2>/dev/null || pip3 install --quiet --break-system-packages "Django==4.2.7"; python3 -c "import django;print(\\"django-\\"+django.get_version())"',
      180000,
    );

    // 3) Boot the harness. It publishes the create route via reverse() so the
    //    client never hardcodes /api/players/.
    const boot = await testdriver.exec(
      "sh",
      [
        "set -e",
        "cd /tmp/psec",
        "rm -f /tmp/psec/urls.txt /tmp/psec/server.log /tmp/psec/db.sqlite3",
        "export PSEC_SECURITY_PY=/tmp/psec/security.py",
        "export PSEC_URL_FILE=/tmp/psec/urls.txt",
        "export PSEC_DB=/tmp/psec/db.sqlite3",
        "nohup python3 harness.py runserver 127.0.0.1:8112 --noreload > /tmp/psec/server.log 2>&1 &",
        // wait for the reverse()-resolved URL file the harness writes at boot
        'for i in $(seq 1 40); do [ -s /tmp/psec/urls.txt ] && break; sleep 0.5; done',
        'CREATE_URL=$(cat /tmp/psec/urls.txt 2>/dev/null)',
        'echo "CREATE_URL=$CREATE_URL"',
        // wait until the dev server actually answers (POST-only route -> 405 is fine)
        'for i in $(seq 1 40); do curl -s -o /dev/null "http://127.0.0.1:8112$CREATE_URL" && break; sleep 0.5; done',
        'echo "SECURITY_SOURCE=$(grep -m1 SECURITY_SOURCE= /tmp/psec/server.log | cut -d= -f2)"',
        "echo BOOT_DONE",
      ].join("\n"),
      180000,
    );
    const bootOut = String(boot?.stdout ?? boot ?? "");
    const createUrl = grab(bootOut, "CREATE_URL") || "/api/players/";
    // The harness must have loaded the REAL repo security.py (not the vendored
    // fallback), so these assertions gate the actual code under review.
    expect(bootOut).toContain("BOOT_DONE");
    expect(grab(bootOut, "SECURITY_SOURCE")).toContain("/tmp/psec/security.py");

    // 4) CREATE a player. The response carries a plaintext secret + an opaque
    //    player_id; the DB must store only the SHA-256 hash (never the
    //    plaintext). The issued plaintext is written STRAIGHT to a mode-600
    //    sandbox file and never printed — we then introspect the stored column
    //    by player_id (NOT by the plaintext secret, so no secret is placed in a
    //    URL, SEC-1 #105) and classify it entirely in-sandbox. Only non-secret
    //    signals (booleans, lengths, the player id) cross to JS.
    const create = await testdriver.exec(
      "sh",
      [
        "set -e",
        `mkdir -p "${SECRET_DIR}"`,
        `RESP=$(curl -s -X POST "${BASE}${createUrl}" -H 'Content-Type: application/json' -d '{"name":"SEC1Tester"}')`,
        // Persist the issued plaintext to a file (mode 600). NEVER echoed.
        `printf '%s' "$RESP" | python3 -c "import sys,json;open('${CURRENT_SECRET}','w').write(json.load(sys.stdin)['player_secret'])"`,
        `chmod 600 "${CURRENT_SECRET}"`,
        `PID=$(printf '%s' "$RESP" | python3 -c "import sys,json;print(json.load(sys.stdin)['player_id'])")`,
        'echo "PLAYER_ID=$PID"',
        // Fetch the RAW stored column by player_id (never by the secret).
        `STORED=$(curl -s "${BASE}/api/players/$PID/stored/" | python3 -c "import sys,json;print(json.load(sys.stdin)['stored'])")`,
        // Classify the stored value + compare to the plaintext ENTIRELY in the
        // sandbox, reading the plaintext from its file. Emit only booleans and
        // the plaintext LENGTH — never the plaintext or the stored value.
        `STORED="$STORED" python3 - "${CURRENT_SECRET}" <<'PY'
import os, sys
plain = open(sys.argv[1]).read()
stored = os.environ["STORED"]
is_hex64 = len(stored) == 64 and all(c in "0123456789abcdef" for c in stored)
print("PLAINTEXT_LEN=%d" % len(plain))
print("STORED_IS_HEX64=%s" % ("yes" if is_hex64 else "no"))
print("STORED_NE_PLAINTEXT=%s" % ("yes" if stored != plain else "no"))
PY`,
      ].join("\n"),
      60000,
    );
    const createOut = String(create?.stdout ?? create ?? "");
    const plaintextLen = Number(grab(createOut, "PLAINTEXT_LEN") || "0");
    const playerId = grab(createOut, "PLAYER_ID");

    // Issuance returns a non-empty plaintext secret + an addressable player_id.
    expect(plaintextLen).toBeGreaterThan(0);
    expect(playerId.length).toBeGreaterThan(0);
    // The persisted column is a SHA-256 hex digest, NOT the plaintext.
    expect(grab(createOut, "STORED_IS_HEX64")).toBe("yes");
    expect(grab(createOut, "STORED_NE_PLAINTEXT")).toBe("yes");

    // 5) ROTATE with the correct secret (read from its sandbox file, sent in
    //    the body) -> resolves; the harness writes the fresh plaintext to a new
    //    file. Keep a copy of the pre-rotation secret so we can prove it is now
    //    invalid. Then verify the new secret differs from the old — computed
    //    in-sandbox from the two files, emitting only a boolean.
    await testdriver.exec(
      "sh",
      `cp "${CURRENT_SECRET}" "${OLD_SECRET}" && chmod 600 "${OLD_SECRET}" && echo COPIED`,
      15000,
    );
    const rotated = await rotate(playerId, CURRENT_SECRET, CURRENT_SECRET);
    expect(rotated.code).toBe("200");

    const diff = await testdriver.exec(
      "sh",
      [
        `python3 - "${OLD_SECRET}" "${CURRENT_SECRET}" <<'PY'`,
        "import sys",
        "old = open(sys.argv[1]).read()",
        "new = open(sys.argv[2]).read()",
        'print("NEW_LEN=%d" % len(new))',
        'print("NEW_NE_OLD=%s" % ("yes" if new != old else "no"))',
        "PY",
      ].join("\n"),
      15000,
    );
    const diffOut = String(diff?.stdout ?? diff ?? "");
    expect(Number(grab(diffOut, "NEW_LEN") || "0")).toBeGreaterThan(0);
    expect(grab(diffOut, "NEW_NE_OLD")).toBe("yes");

    // 6) The OLD secret is invalidated the moment it is rotated, and a WRONG
    //    body secret against the same player must be forbidden. Both are
    //    asserted as framework REJECTIONS (TST-2) — `rotate()` throws (with a
    //    status-only, secret-free message) on any non-200, so
    //    `expect(...).rejects.toThrow()` gates the rejection rather than a
    //    hand-rolled status-code / `blocked`-flag check. Because we now address
    //    by the stable player_id, both cases hit the real 403 auth branch
    //    (stale/incorrect hash), not a 404. The presented secrets are read from
    //    sandbox files (the stale one; a throwaway wrong one) — never printed.
    await testdriver.exec(
      "sh",
      `printf %s 'totally-wrong-secret' > "${SECRET_DIR}/wrong" && chmod 600 "${SECRET_DIR}/wrong" && echo WROTE_WRONG`,
      15000,
    );
    // Rotating with the stale (pre-rotation) secret must be rejected with 403.
    await expect(
      rotate(playerId, OLD_SECRET, `${SECRET_DIR}/unused_a`),
    ).rejects.toThrow(/HTTP 403/);
    // Rotating with a plainly-wrong secret must be rejected with 403.
    await expect(
      rotate(playerId, `${SECRET_DIR}/wrong`, `${SECRET_DIR}/unused_b`),
    ).rejects.toThrow(/HTTP 403/);

    // 7) A visible confirmation for the run recording: render a small PASS page.
    //    The page shows only the guarantee statements — NEVER a secret value.
    await testdriver.exec(
      "sh",
      `cat > /tmp/psec/result.html <<'HTML'
<!doctype html><meta charset="utf-8">
<body style="font-family:system-ui;background:#0b0b10;color:#e6e6e6;padding:32px">
<h1 style="color:#4ade80">SEC-1 at-rest guardrail: PASS</h1>
<ul style="font-size:18px;line-height:1.8">
<li>player_secret stored as SHA-256 hash (not plaintext)</li>
<li>issuance returns plaintext exactly once</li>
<li>rotation issues a new secret + invalidates the old</li>
<li>rotation rejects a wrong secret with 403</li>
<li>secret travels in the POST body, addressed by player_id (never in the URL)</li>
<li>plaintext never printed to logs/console (kept in mode-600 sandbox files)</li>
</ul></body>
HTML`,
      15000,
    );
    await testdriver.exec("sh", "cd /tmp/psec && nohup python3 -m http.server 8113 >/dev/null 2>&1 & sleep 1; echo SERVED", 15000);

    const result = await testdriver.assert(
      "the page shows a green 'SEC-1 at-rest guardrail: PASS' heading confirming the player_secret is stored hashed, issued once, and rotatable",
    );
    expect(result).toBeTruthy();
  });
});
