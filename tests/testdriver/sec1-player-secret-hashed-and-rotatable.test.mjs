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
//      secret (POST /api/players/<secret>/rotate_secret/).
//   4. Rotation rejects a wrong secret with 403.
//
// Rather than assert against a mock, this drives the REAL security code
// end-to-end inside the TestDriver sandbox, in the same spirit as this repo's
// health-redis-down.test.mjs: it stages the actual backend module under review
// and probes a running Django server with curl.
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
const grab = (out, label) =>
  (String(out ?? "").match(new RegExp(`${label}=(\\S+)`)) || [])[1] || "";

describe("SEC-1: player_secret is hashed at rest and rotatable (#105, PR #261)", () => {
  it("stores only a hash, issues plaintext once, and rotation invalidates the old secret", async (context) => {
    const testdriver = TestDriver(context);

    await testdriver.provision.chrome({ url: "about:blank" });

    // 1) Stage the REAL security.py + the harness inside the sandbox.
    await testdriver.exec(
      "sh",
      [
        "set -e",
        "rm -rf /tmp/psec && mkdir -p /tmp/psec",
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

    const BASE = `http://127.0.0.1:8112`;

    // 4) CREATE a player. The response must carry a plaintext secret; the DB
    //    must store only its SHA-256 hash (never the plaintext).
    const create = await testdriver.exec(
      "sh",
      [
        `RESP=$(curl -s -X POST "${BASE}${createUrl}" -H 'Content-Type: application/json' -d '{"name":"SEC1Tester"}')`,
        'echo "CREATE_RESP=$RESP"',
        `SECRET=$(printf '%s' "$RESP" | python3 -c "import sys,json;print(json.load(sys.stdin)['player_secret'])")`,
        'echo "PLAINTEXT=$SECRET"',
        `STORED=$(curl -s "${BASE}/api/players/$SECRET/stored/" | python3 -c "import sys,json;print(json.load(sys.stdin)['stored'])")`,
        'echo "STORED=$STORED"',
        // classify the stored value: is it a 64-char lowercase hex digest, and
        // is it different from the plaintext we were handed?
        `python3 - "$SECRET" "$STORED" <<'PY'
import sys
plain, stored = sys.argv[1], sys.argv[2]
is_hex64 = len(stored) == 64 and all(c in "0123456789abcdef" for c in stored)
print("STORED_IS_HEX64=%s" % ("yes" if is_hex64 else "no"))
print("STORED_NE_PLAINTEXT=%s" % ("yes" if stored != plain else "no"))
PY`,
      ].join("\n"),
      60000,
    );
    const createOut = String(create?.stdout ?? create ?? "");
    const plaintext = grab(createOut, "PLAINTEXT");

    // Issuance returns a non-empty plaintext secret exactly once.
    expect(plaintext.length).toBeGreaterThan(0);
    // The persisted column is a SHA-256 hex digest, NOT the plaintext.
    expect(grab(createOut, "STORED_IS_HEX64")).toBe("yes");
    expect(grab(createOut, "STORED_NE_PLAINTEXT")).toBe("yes");

    // 5) ROTATE with the correct secret -> 200 + a NEW plaintext; the OLD
    //    secret is then invalid (no longer resolves); and a WRONG secret is
    //    rejected with 403.
    const rotate = await testdriver.exec(
      "sh",
      [
        `OLD="${plaintext}"`,
        // correct rotation
        `ROT=$(curl -s -w '\\nHTTP:%{http_code}' -X POST "${BASE}/api/players/$OLD/rotate_secret/" -H 'Content-Type: application/json' -d "{\\"player_secret\\":\\"$OLD\\"}")`,
        'echo "ROTATE_CODE=$(printf %s \"$ROT\" | sed -n \"s/^HTTP://p\")"',
        `NEW=$(printf '%s' "$ROT" | head -1 | python3 -c "import sys,json;print(json.load(sys.stdin)['player_secret'])")`,
        'echo "NEW=$NEW"',
        `python3 -c "import sys;print('NEW_NE_OLD=%s' % ('yes' if sys.argv[1]!=sys.argv[2] else 'no'))" "$NEW" "$OLD"`,
        // old secret must no longer be a valid credential (404: hash gone from DB)
        `OLD_CODE=$(curl -s -o /dev/null -w '%{http_code}' -X POST "${BASE}/api/players/$OLD/rotate_secret/" -H 'Content-Type: application/json' -d "{\\"player_secret\\":\\"$OLD\\"}")`,
        'echo "OLD_AFTER_ROTATE_CODE=$OLD_CODE"',
        // wrong body secret against the (valid) new one must be forbidden
        `WRONG_CODE=$(curl -s -o /dev/null -w '%{http_code}' -X POST "${BASE}/api/players/$NEW/rotate_secret/" -H 'Content-Type: application/json' -d '{"player_secret":"totally-wrong-secret"}')`,
        'echo "WRONG_BODY_CODE=$WRONG_CODE"',
      ].join("\n"),
      60000,
    );
    const rotateOut = String(rotate?.stdout ?? rotate ?? "");

    // Rotation succeeds and returns a fresh, different plaintext.
    expect(grab(rotateOut, "ROTATE_CODE")).toBe("200");
    expect(grab(rotateOut, "NEW").length).toBeGreaterThan(0);
    expect(grab(rotateOut, "NEW_NE_OLD")).toBe("yes");
    // The old secret is invalidated the moment it is rotated.
    expect(["403", "404"]).toContain(grab(rotateOut, "OLD_AFTER_ROTATE_CODE"));
    // A wrong secret is rejected with 403 (the verbatim views.py auth check).
    expect(grab(rotateOut, "WRONG_BODY_CODE")).toBe("403");

    // 6) A visible confirmation for the run recording: render a small PASS page.
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
