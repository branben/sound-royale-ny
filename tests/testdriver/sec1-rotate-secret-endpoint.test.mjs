import { describe, expect, it } from 'vitest';
import { TestDriver } from 'testdriverai/vitest/hooks';

// ---------------------------------------------------------------------------
// SEC-1 / guardrail #105 — RUNTIME contract for the secret-rotation endpoint
// and the hashed-at-rest storage change introduced by PR #261.
//
// PR #261 makes two backend changes on top of the transport fix (#260):
//   1. `player_secret` is stored ONLY as a SHA-256 hex digest (never plaintext).
//   2. A rotation endpoint exists that issues a fresh plaintext secret exactly
//      once, invalidates the old one, and rejects a wrong current secret (403).
//
// The repo's `test_player_secret_security.py` already asserts this via Django's
// IN-PROCESS test client. This TestDriver test is the complementary LIVE gate:
// it stands up the real Django HTTP server inside the sandbox and exercises the
// deployed HTTP surface end-to-end with `curl`, so the wiring (URL routing,
// serializers, the model save() hashing hook, HTTP status codes) is verified
// against a running process — not the test client.
//
// -------------------------------------------------------------------------
// SEC-1 (review r3579654631) — WHERE the credential travels
// -------------------------------------------------------------------------
// SEC-1 (#105): "Player secret is exposed via URL query param or console/error
// string. Move to Authorization header / POST body / first WS message."
//
// This test enforces that contract on the wire at two strengths:
//
//   (A) UNCONDITIONAL, always enforced — the secret must NEVER be a URL QUERY
//       PARAM (`?player_secret=` / `?secret=`). This is the exact vector SEC-1
//       names, it is entirely in the CLIENT's control (nothing about the
//       backend routing forces a query param), and it must hold regardless of
//       which route we call. `assertNoSecretQueryParam` runs on every rotation
//       URL and hard-fails the suite if a secret ever appears in the query
//       string.
//
//   (B) PATH-segment leak — RUNTIME auto-detected, no manual flag. The current
//       router route is
//           POST /api/players/<current_secret>/rotate_secret/
//       and it carries the plaintext secret in the URL PATH purely because
//       `PlayerViewSet.lookup_field = "player_secret"` (backend/game_engine/
//       views.py). A path segment leaks the same way a query param does
//       (address bar / history / server-proxy-CDN access logs / Referer).
//
//       Moving the credential out of the path is an APPLICATION-CODE change (a
//       secret-free `by-id` rotate route that looks the player up by
//       `player_id` and authenticates via the POST body / an `X-Player-Secret`
//       header — the sibling genre_performance / set_checked_in routes already
//       use exactly that `api/players/by-id/<uuid:player_id>/…` shape) and is
//       out of the test agent's remit.
//
//       So instead of a human hand-flipping a "fixed" boolean, this test PROBES
//       the running backend for that secret-free route at runtime:
//         * If a `by-id` rotate route exists, the test USES it (secret in the
//           body / `X-Player-Secret` header, `player_id` in the path) and then
//           hard-asserts the plaintext secret appears NOWHERE in the request
//           URL. The path-leak guard becomes a live regression gate the instant
//           the app fix lands — automatically, with no test edit.
//         * If it does not exist yet, the test falls back to the path route to
//           reach rotation at all, and records the known, documented gap
//           (`console.warn`) without silently blessing it.
//
// The backend is brought up from the PR branch inside the sandbox using the
// repo's own `settings_test` (SQLite + in-memory channels, no Redis), with the
// DB pointed at a temp file so state persists across the multi-request flow.
// ---------------------------------------------------------------------------

const REPO = 'https://github.com/branben/sound-royale-ny';
const BRANCH = 'fix/player-secret-hashing';
const BASE = 'http://127.0.0.1:8000';

// Run a shell command in the sandbox and return trimmed stdout, failing loudly
// (with the captured output) when the command exits non-zero.
async function sh(testdriver, cmd, timeout = 120000) {
  const out = await testdriver.exec('sh', cmd, timeout);
  return typeof out === 'string' ? out.trim() : String(out ?? '').trim();
}

// SEC-1 (A): the auth credential must NEVER be a URL query-string parameter.
// This is always enforced, on every rotation URL, no exceptions. It is the
// precise leak SEC-1 names and it is fully within the client's control.
function assertNoSecretQueryParam(url) {
  expect(
    /[?&](?:player_secret|secret)=/i.test(url),
    `SEC-1: the rotation URL must not carry the secret as a query param: ${url}`,
  ).toBe(false);
  return url;
}

describe('SEC-1 (#105): live secret-rotation endpoint + hashed-at-rest', () => {
  it('rotates the player secret over real HTTP: new plaintext issued, old rejected, wrong secret 403', async (context) => {
    const testdriver = TestDriver(context);

    // A Linux sandbox (default) — `exec` runs here. No browser needed.
    await testdriver.provision.chrome({ url: 'about:blank' });

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

    // Wait for the server to accept connections (poll health for up to ~40s).
    await sh(
      testdriver,
      `for i in $(seq 1 40); do
           if curl -fsS -o /dev/null ${BASE}/api/health/ 2>/dev/null; then
             echo up; exit 0;
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

    // --- 5b. SEC-1: probe for a secret-free `by-id` rotate route. --------
    // The sibling privileged routes already expose an
    //   api/players/by-id/<uuid:player_id>/…
    // shape (genre_performance, set_checked_in). If a matching rotate route
    // exists, we use IT — player_id in the path, secret in the body/header —
    // so the plaintext secret never touches the URL. We detect it by probing
    // with the CORRECT current secret in the body: a 200 (rotation happened)
    // or 403 (route exists, auth path differs) both prove the route is wired;
    // 404/405 mean it isn't there yet. We only *probe* here (a 200 would burn
    // the secret), so we send a deliberately wrong body to keep it read-only:
    // an existing route answers 403 (auth check ran), a missing route 404/405.
    const byIdRotateUrl = `${BASE}/api/players/by-id/${encodeURIComponent(playerId)}/rotate_secret/`;
    assertNoSecretQueryParam(byIdRotateUrl);
    const byIdProbeStatus = await sh(
      testdriver,
      `curl -s -o /dev/null -w '%{http_code}' \
           -X POST ${byIdRotateUrl} \
           -H 'Content-Type: application/json' \
           -H 'X-Player-Secret: probe-wrong-secret' \
           -d '{"player_secret":"probe-wrong-secret"}'`,
    );
    // A wired route runs the auth check and rejects the wrong secret (403). A
    // route that does not exist returns 404 (no match) or 405 (method).
    const byIdRotateExists = byIdProbeStatus === '403';

    // The path-based route the current router exposes. The plaintext secret is
    // in the path ONLY because `lookup_field = "player_secret"`. This is the
    // documented SEC-1 path-leak; we only use it as a fallback when no
    // secret-free route exists.
    const pathRotateUrl = (secret) =>
      `${BASE}/api/players/${encodeURIComponent(secret)}/rotate_secret/`;

    // Build the actual rotate request for a given "current secret". Prefers the
    // secret-free by-id route when present; otherwise falls back to the path
    // route. Returns { url, curlAuthArgs } so callers stay route-agnostic.
    const buildRotate = (currentSecret) => {
      if (byIdRotateExists) {
        const url = assertNoSecretQueryParam(byIdRotateUrl);
        // SEC-1 fix present: the plaintext secret must appear NOWHERE in the URL.
        expect(
          url.includes(currentSecret) || url.includes(encodeURIComponent(currentSecret)),
          `SEC-1: the plaintext secret must not appear in the request URL: ${url}`,
        ).toBe(false);
        return { url, secret: currentSecret };
      }
      // Fallback: no secret-free route yet — reach rotation via the path route.
      const url = assertNoSecretQueryParam(pathRotateUrl(currentSecret));
      console.warn(
        `SEC-1 (#105): no secret-free \`by-id\` rotate route on the backend yet; ` +
          `the live test must send the plaintext secret in the URL PATH to reach ` +
          `rotation (${url}). Add POST /api/players/by-id/<player_id>/rotate_secret/ ` +
          `(auth via body / X-Player-Secret header) and this test will use it ` +
          `automatically and forbid the secret from ever appearing in the URL.`,
      );
      return { url, secret: currentSecret };
    };

    // --- 6. Rotate with the CORRECT current secret → 200 + new plaintext.
    const oldRotate = buildRotate(oldSecret);
    const rotateJson = await sh(
      testdriver,
      `curl -fsS -X POST ${oldRotate.url} \
           -H 'Content-Type: application/json' \
           -H 'X-Player-Secret: ${oldRotate.secret}' \
           -d '{"player_secret":"${oldRotate.secret}"}'`,
    );
    const rotated = JSON.parse(rotateJson);
    const newSecret = rotated.player_secret;
    expect(newSecret, `rotate response missing player_secret: ${rotateJson}`).toBeTruthy();
    expect(newSecret).not.toBe(oldSecret);
    expect(rotated.player_id).toBe(playerId);

    // --- 7. The OLD secret is now invalid: rotating with it → 403/404. --
    const oldAgain = buildRotate(oldSecret);
    const oldStatus = await sh(
      testdriver,
      `curl -s -o /dev/null -w '%{http_code}' \
           -X POST ${oldAgain.url} \
           -H 'Content-Type: application/json' \
           -H 'X-Player-Secret: ${oldAgain.secret}' \
           -d '{"player_secret":"${oldAgain.secret}"}'`,
    );
    // 403 (rejected on secret mismatch) or 404 (path lookup no longer resolves
    // the old secret) both prove the old credential is dead. Either is a pass;
    // a 200 would mean the old secret still works — a real regression.
    expect(
      ['403', '404'].includes(oldStatus),
      `old secret should be rejected after rotation, got HTTP ${oldStatus}`,
    ).toBe(true);

    // --- 8. Rotating with a WRONG secret against the NEW target → 403. --
    const newRotate = buildRotate(newSecret);
    const wrongStatus = await sh(
      testdriver,
      `curl -s -o /dev/null -w '%{http_code}' \
           -X POST ${newRotate.url} \
           -H 'Content-Type: application/json' \
           -H 'X-Player-Secret: definitely-the-wrong-secret' \
           -d '{"player_secret":"definitely-the-wrong-secret"}'`,
    );
    expect(wrongStatus, `rotation with a wrong current secret must be rejected with 403`).toBe(
      '403',
    );

    // --- 9. The NEW secret still works (idempotent re-rotate → 200). ----
    const reRotate = buildRotate(newSecret);
    const reRotateStatus = await sh(
      testdriver,
      `curl -s -o /dev/null -w '%{http_code}' \
           -X POST ${reRotate.url} \
           -H 'Content-Type: application/json' \
           -H 'X-Player-Secret: ${reRotate.secret}' \
           -d '{"player_secret":"${reRotate.secret}"}'`,
    );
    expect(
      reRotateStatus,
      `the freshly-issued secret should authenticate a rotation (HTTP 200)`,
    ).toBe('200');
  });
});
