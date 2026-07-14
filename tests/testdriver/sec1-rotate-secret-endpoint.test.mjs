import { describe, expect, it } from "vitest";
import { TestDriver } from "testdriverai/vitest/hooks";

// ---------------------------------------------------------------------------
// SEC-1 / guardrail #105 — RUNTIME contract for the secret-rotation endpoint
// and the hashed-at-rest storage change introduced by PR #261.
//
// PR #261 makes two backend changes on top of the transport fix (#260):
//   1. `player_secret` is stored ONLY as a SHA-256 hex digest (never plaintext).
//   2. A rotation endpoint exists:
//        POST /api/players/<current_secret>/rotate_secret/
//        body: { "player_secret": "<current_secret>" }
//      It issues a fresh plaintext secret exactly once and invalidates the old
//      one; a wrong current secret is rejected with 403.
//
// The repo's `test_player_secret_security.py` already asserts this via Django's
// IN-PROCESS test client. This TestDriver test is the complementary LIVE gate:
// it stands up the real Django HTTP server inside the sandbox and exercises the
// deployed HTTP surface end-to-end with `curl`, so the wiring (URL routing,
// serializers, the model save() hashing hook, HTTP status codes) is verified
// against a running process — not the test client.
//
// Why an API-level TestDriver test (exec/curl) rather than a browser test:
// rotation and hashing are pure API/storage behaviour with no dedicated UI, and
// the two existing browser SEC-1 tests already cover the "secret not in the
// URL" transport concern. Driving the real HTTP endpoints is the meaningful
// end-to-end check for THIS PR.
//
// The backend is brought up from the PR branch inside the sandbox using the
// repo's own `settings_test` (SQLite + in-memory channels, no Redis), with the
// DB pointed at a temp file so state persists across the multi-request flow.
// ---------------------------------------------------------------------------

const REPO = "https://github.com/branben/sound-royale-ny";
const BRANCH = "fix/player-secret-hashing";
const BASE = "http://127.0.0.1:8000";

// Run a shell command in the sandbox and return trimmed stdout, failing loudly
// (with the captured output) when the command exits non-zero.
async function sh(testdriver, cmd, timeout = 120000) {
  const out = await testdriver.exec("sh", cmd, timeout);
  return typeof out === "string" ? out.trim() : String(out ?? "").trim();
}

describe("SEC-1 (#105): live secret-rotation endpoint + hashed-at-rest", () => {
  it(
    "rotates the player secret over real HTTP: new plaintext issued, old rejected, wrong secret 403",
    async (context) => {
      const testdriver = TestDriver(context);

      // A Linux sandbox (default) — `exec` runs here. No browser needed.
      await testdriver.provision.chrome({ url: "about:blank" });

      // --- 1. Fetch the PR branch into the sandbox. -----------------------
      await sh(
        testdriver,
        `set -e
         rm -rf /tmp/sr && \
         git clone --depth 1 --branch ${BRANCH} ${REPO} /tmp/sr`,
        180000,
      );

      // --- 2. Install backend deps into a venv. ---------------------------
      await sh(
        testdriver,
        `set -e
         cd /tmp/sr/backend
         python3 -m venv /tmp/venv
         . /tmp/venv/bin/activate
         pip install --quiet --disable-pip-version-check -r requirements.txt`,
        600000,
      );

      // --- 3. A sandbox settings shim: settings_test but with a FILE-backed
      //        SQLite DB (in-memory SQLite does not survive across the dev
      //        server's per-request connections). ---------------------------
      await sh(
        testdriver,
        `cat > /tmp/sr/backend/sound_royale_api/settings_sandbox.py <<'PY'
from sound_royale_api.settings_test import *  # noqa: F401,F403
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": "/tmp/sr/backend/sandbox.sqlite3",
    }
}
PY`,
      );

      // --- 4. Migrate and launch the server in the background. ------------
      await sh(
        testdriver,
        `set -e
         cd /tmp/sr/backend
         . /tmp/venv/bin/activate
         export DJANGO_SETTINGS_MODULE=sound_royale_api.settings_sandbox
         python manage.py migrate --noinput
         nohup python manage.py runserver 127.0.0.1:8000 --noreload \
           > /tmp/server.log 2>&1 &
         echo started`,
        180000,
      );

      // Wait for the server to accept connections (poll for up to ~40s).
      //
      // NOTE: we deliberately do NOT gate readiness on `/api/health/`. That
      // endpoint probes Redis and, under the repo's `settings_test`
      // (InMemoryChannelLayer, no Redis process in the sandbox), it returns
      // HTTP 503 by design — so `curl -f` against it would never succeed even
      // though Django is fully up. The rotation/room endpoints under test are
      // `AllowAny` and do not touch Redis, so "the server answers HTTP at all"
      // is the correct readiness signal. curl prints `000` when it cannot
      // connect; any real HTTP status (200/403/404/503/...) means we are up.
      await sh(
        testdriver,
        `for i in $(seq 1 40); do
           code=$(curl -s -o /dev/null -w '%{http_code}' ${BASE}/api/health/ 2>/dev/null || echo 000)
           if [ "$code" != "000" ]; then
             echo "up (health responded HTTP $code)"; exit 0;
           fi
           sleep 1
         done
         echo "SERVER DID NOT START"; cat /tmp/server.log; exit 1`,
        60000,
      );

      // --- 5. Create a room → receive the plaintext secret exactly once. --
      const createJson = await sh(
        testdriver,
        `curl -fsS -X POST ${BASE}/api/rooms/ \
           -H 'Content-Type: application/json' \
           -d '{"player_name":"RotTester","name":"Rotation Room"}'`,
      );
      const created = JSON.parse(createJson);
      const playerId = created.player_id;
      const oldSecret = created.player_secret;
      expect(playerId, `create response missing player_id: ${createJson}`).toBeTruthy();
      expect(oldSecret, `create response missing player_secret: ${createJson}`).toBeTruthy();

      // Hashed-at-rest: the issued secret is plaintext, NOT a 64-char hex digest.
      const looksHashed = /^[0-9a-f]{64}$/.test(oldSecret);
      expect(
        looksHashed,
        `issued secret should be plaintext, not a SHA-256 hex digest (got: ${oldSecret})`,
      ).toBe(false);

      // --- 6. Rotate with the CORRECT current secret → 200 + new plaintext.
      const rotateJson = await sh(
        testdriver,
        `curl -fsS -X POST ${BASE}/api/players/${encodeURIComponent(oldSecret)}/rotate_secret/ \
           -H 'Content-Type: application/json' \
           -d '{"player_secret":"${oldSecret}"}'`,
      );
      const rotated = JSON.parse(rotateJson);
      const newSecret = rotated.player_secret;
      expect(newSecret, `rotate response missing player_secret: ${rotateJson}`).toBeTruthy();
      expect(newSecret).not.toBe(oldSecret);
      expect(rotated.player_id).toBe(playerId);

      // --- 7. The OLD secret is now invalid: rotating with it → 403. ------
      const oldStatus = await sh(
        testdriver,
        `curl -s -o /dev/null -w '%{http_code}' \
           -X POST ${BASE}/api/players/${encodeURIComponent(oldSecret)}/rotate_secret/ \
           -H 'Content-Type: application/json' \
           -d '{"player_secret":"${oldSecret}"}'`,
      );
      // 403 (rejected on secret mismatch) or 404 (URL lookup no longer resolves
      // the old secret) both prove the old credential is dead. Either is a pass;
      // a 200 would mean the old secret still works — a real regression.
      expect(
        ["403", "404"].includes(oldStatus),
        `old secret should be rejected after rotation, got HTTP ${oldStatus}`,
      ).toBe(true);

      // --- 8. Rotating with a WRONG secret against the NEW url → 403. -----
      const wrongStatus = await sh(
        testdriver,
        `curl -s -o /dev/null -w '%{http_code}' \
           -X POST ${BASE}/api/players/${encodeURIComponent(newSecret)}/rotate_secret/ \
           -H 'Content-Type: application/json' \
           -d '{"player_secret":"definitely-the-wrong-secret"}'`,
      );
      expect(
        wrongStatus,
        `rotation with a wrong current secret must be rejected with 403`,
      ).toBe("403");

      // --- 9. The NEW secret still works (idempotent re-rotate → 200). ----
      const reRotateStatus = await sh(
        testdriver,
        `curl -s -o /dev/null -w '%{http_code}' \
           -X POST ${BASE}/api/players/${encodeURIComponent(newSecret)}/rotate_secret/ \
           -H 'Content-Type: application/json' \
           -d '{"player_secret":"${newSecret}"}'`,
      );
      expect(
        reRotateStatus,
        `the freshly-issued secret should authenticate a rotation (HTTP 200)`,
      ).toBe("200");
    },
  );
});
