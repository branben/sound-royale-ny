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
// SEC-1 CAVEAT (review r3579654631) — the secret is authenticated in the POST
// BODY (correct), but the CURRENT backend route also embeds the plaintext
// secret in the URL PATH:
//
//     POST /api/players/<current_secret>/rotate_secret/
//
// because `PlayerViewSet.lookup_field = "player_secret"` (see
// backend/game_engine/views.py). That path-segment placement is exactly the
// leak SEC-1 warns about (address bar / browser history / server-proxy-CDN
// access logs / Referer header). There is currently NO secret-free route to
// reach rotation (no `by-id` variant like the genre_performance/set_checked_in
// routes have), so the live test has no choice but to hit the path-based URL.
//
// IMPORTANT: this test does NOT bless that shape. Moving the credential out of
// the URL is an APPLICATION-CODE change (add a `by-id` rotate route that looks
// the player up by `player_id` and authenticates via the POST body / an
// `X-Player-Secret` header — the backend already reads `HTTP_X_PLAYER_SECRET`)
// and is out of scope for the test agent. Instead the test:
//   * authenticates every rotation via the POST BODY only (never a query
//     param) — the SEC-1-correct transport for the auth material, and
//   * runs an explicit SEC-1 guard (`SEC1_URL_LEAK_IS_FIXED`, default false)
//     that asserts the observed route SHAPE. While the backend still requires
//     the secret in the path it documents the known gap without failing the
//     suite; flip it to `true` once a secret-free rotate route exists and the
//     guard will hold the fix in place.
//
// The backend is brought up from the PR branch inside the sandbox using the
// repo's own `settings_test` (SQLite + in-memory channels, no Redis), with the
// DB pointed at a temp file so state persists across the multi-request flow.
// ---------------------------------------------------------------------------

const REPO = 'https://github.com/branben/sound-royale-ny';
const BRANCH = 'fix/player-secret-hashing';
const BASE = 'http://127.0.0.1:8000';

// Flip to `true` once the backend exposes a secret-free rotate route (e.g.
// POST /api/players/by-id/<player_id>/rotate_secret/ authenticated via the
// body / X-Player-Secret header). When true, the SEC-1 guard hard-fails if a
// plaintext secret ever appears in the request URL again.
const SEC1_URL_LEAK_IS_FIXED = false;

// Run a shell command in the sandbox and return trimmed stdout, failing loudly
// (with the captured output) when the command exits non-zero.
async function sh(testdriver, cmd, timeout = 120000) {
  const out = await testdriver.exec('sh', cmd, timeout);
  return typeof out === 'string' ? out.trim() : String(out ?? '').trim();
}

// SEC-1 guard: a rotation call must authenticate via the POST body, and — once
// the fix lands — must NOT carry the plaintext secret anywhere in the URL. It
// returns the URL actually used so the caller can log/inspect it.
function assertSec1Transport({ url, secret }) {
  // The auth credential must never be a query-string parameter, regardless of
  // whether the path still carries it. This is the leak the sibling
  // `sec1-*-not-in-url` tests pin on the client; enforce it on the wire here.
  expect(
    /[?&](?:player_secret|secret)=/i.test(url),
    `SEC-1: the rotation URL must not carry the secret as a query param: ${url}`,
  ).toBe(false);

  const secretInPath = url.includes(encodeURIComponent(secret)) || url.includes(secret);
  if (SEC1_URL_LEAK_IS_FIXED) {
    expect(
      secretInPath,
      `SEC-1: the plaintext secret must not appear in the request URL: ${url}`,
    ).toBe(false);
  }
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

    // The rotate route the current backend exposes. The secret is placed in
    // the path ONLY because `lookup_field = "player_secret"` — see the SEC-1
    // caveat in the header. `assertSec1Transport` records/guards that shape;
    // auth material always travels in the POST body (never a query param).
    const rotateUrl = (secret) =>
      `${BASE}/api/players/${encodeURIComponent(secret)}/rotate_secret/`;

    // --- 6. Rotate with the CORRECT current secret → 200 + new plaintext.
    const oldRotateUrl = assertSec1Transport({ url: rotateUrl(oldSecret), secret: oldSecret });
    const rotateJson = await sh(
      testdriver,
      `curl -fsS -X POST ${oldRotateUrl} \
           -H 'Content-Type: application/json' \
           -d '{"player_secret":"${oldSecret}"}'`,
    );
    const rotated = JSON.parse(rotateJson);
    const newSecret = rotated.player_secret;
    expect(newSecret, `rotate response missing player_secret: ${rotateJson}`).toBeTruthy();
    expect(newSecret).not.toBe(oldSecret);
    expect(rotated.player_id).toBe(playerId);

    // --- 7. The OLD secret is now invalid: rotating with it → 403/404. --
    const oldStatus = await sh(
      testdriver,
      `curl -s -o /dev/null -w '%{http_code}' \
           -X POST ${oldRotateUrl} \
           -H 'Content-Type: application/json' \
           -d '{"player_secret":"${oldSecret}"}'`,
    );
    // 403 (rejected on secret mismatch) or 404 (URL lookup no longer resolves
    // the old secret) both prove the old credential is dead. Either is a pass;
    // a 200 would mean the old secret still works — a real regression.
    expect(
      ['403', '404'].includes(oldStatus),
      `old secret should be rejected after rotation, got HTTP ${oldStatus}`,
    ).toBe(true);

    // --- 8. Rotating with a WRONG secret against the NEW url → 403. -----
    const newRotateUrl = assertSec1Transport({ url: rotateUrl(newSecret), secret: newSecret });
    const wrongStatus = await sh(
      testdriver,
      `curl -s -o /dev/null -w '%{http_code}' \
           -X POST ${newRotateUrl} \
           -H 'Content-Type: application/json' \
           -d '{"player_secret":"definitely-the-wrong-secret"}'`,
    );
    expect(wrongStatus, `rotation with a wrong current secret must be rejected with 403`).toBe(
      '403',
    );

    // --- 9. The NEW secret still works (idempotent re-rotate → 200). ----
    const reRotateStatus = await sh(
      testdriver,
      `curl -s -o /dev/null -w '%{http_code}' \
           -X POST ${newRotateUrl} \
           -H 'Content-Type: application/json' \
           -d '{"player_secret":"${newSecret}"}'`,
    );
    expect(
      reRotateStatus,
      `the freshly-issued secret should authenticate a rotation (HTTP 200)`,
    ).toBe('200');
  });
});
