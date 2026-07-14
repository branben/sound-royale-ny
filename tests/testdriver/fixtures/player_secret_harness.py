#!/usr/bin/env python3
"""Self-contained Django harness for the player_secret hashing + rotation gate.

Guardrail #105 (SEC-1), at-rest half — see PR #261. This harness exercises the
REAL security-critical code from the repo end-to-end inside the TestDriver
sandbox, without dragging in the whole ``game_engine`` app (whose ``Player``
model is entangled with Room / DiscordAccount / auth.User foreign keys).

TRANSPORT CONTRACT (SEC-1 #105)
-------------------------------
The plaintext ``player_secret`` MUST NOT travel in a URL. This harness mirrors
the repo's real ``PlayerViewSet`` routes exactly: endpoints are addressed by the
player's opaque ``pk`` in the URL, and the plaintext secret is presented in the
POST body (``request.data['player_secret']``) — never as a path/query segment.
Keeping the harness faithful to that contract means the at-rest test does not
model the very anti-pattern the sibling ``sec1-*-not-in-url`` tests forbid.

What is REAL (loaded from the repo, never re-implemented here):

  * ``backend/game_engine/security.py`` — ``hash_secret`` / ``new_player_secret``
    / ``is_hex64``. This is the literal core of "the secret is stored only as a
    SHA-256 hex digest".
  * The ``Player.save()`` hashing hook and the ``rotate_secret`` view's auth
    check are transcribed from ``models.py`` / ``views.py`` but delegate ALL
    hashing to the real ``security.py`` module above, so the security decision
    ("hash before persist", "compare hashes, 403 on mismatch") is made by the
    real code, not by a copy.

The harness registers a tiny API that mirrors the repo's real routes/behaviour
(all secret-bearing values are in the request body, addressed by pk in the URL):

  POST /api/players/                      -> create, returns {player_id, secret}
                                             (plaintext returned exactly once)
  POST /api/players/<pk>/rotate_secret/   -> rotate; requires the current secret
                                             in the BODY. 200 + new plaintext, or
                                             403 when the presented secret is
                                             wrong (matches views.py).
  GET  /api/players/<pk>/stored/          -> harness-only introspection: the RAW
                                             stored column value, so the test can
                                             prove the DB holds the hash and
                                             never the plaintext. Addressed by pk
                                             (never by the plaintext secret).

The base URLs are resolved via ``django.urls.reverse`` and published to
``PSEC_URL_FILE`` (+ echoed as ``CREATE_URL=`` on stdout) so the HTTP client
never hardcodes a path.

A file-backed SQLite DB (``PSEC_DB``) is used rather than ``:memory:`` so the
schema created at boot is visible to every request thread the dev server spawns.

Usage::

    PSEC_SECURITY_PY=/path/to/real/security.py \
    PSEC_URL_FILE=/tmp/psec/urls.txt \
    PSEC_DB=/tmp/psec/db.sqlite3 \
    python3 player_secret_harness.py runserver 127.0.0.1:8112 --noreload
"""

import importlib.util
import json
import os
import sys

import django
from django.conf import settings
from django.urls import path, reverse


def _load_real_security():
    """Import security.py from the real repo file (never re-implemented)."""
    real = os.environ.get("PSEC_SECURITY_PY")
    candidates = [real] if real else []
    candidates.append(os.path.join(os.path.dirname(__file__), "security.py"))
    for src in candidates:
        if src and os.path.isfile(src):
            spec = importlib.util.spec_from_file_location("real_security", src)
            mod = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(mod)
            return mod, src
    raise SystemExit("Could not locate the real security.py (set PSEC_SECURITY_PY)")


settings.configure(
    DEBUG=True,
    SECRET_KEY="harness-only-not-secret",
    ALLOWED_HOSTS=["*"],
    ROOT_URLCONF=__name__,
    DATABASES={
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": os.environ.get("PSEC_DB", "/tmp/psec_harness.sqlite3"),
        }
    },
    INSTALLED_APPS=[
        "django.contrib.contenttypes",
        "django.contrib.auth",
        __name__,  # this module is its own app so the harness model migrates
    ],
    LOGGING_CONFIG=None,
)

django.setup()

security, _security_src = _load_real_security()
hash_secret = security.hash_secret
new_player_secret = security.new_player_secret
is_hex64 = security.is_hex64

from django.db import models  # noqa: E402  (after settings.configure)


class Player(models.Model):
    """Minimal stand-in for game_engine.models.Player.

    The security-relevant behaviour is copied verbatim from the repo's
    ``Player.save()`` (models.py, PR #261) but every hashing decision is
    delegated to the REAL ``security.py`` loaded above.
    """

    # Default mirrors the real model: a fresh plaintext that save() then hashes.
    player_secret = models.CharField(
        max_length=64, default=new_player_secret, editable=False
    )
    name = models.CharField(max_length=50, default="")

    class Meta:
        app_label = __name__

    def save(self, *args, **kwargs):
        # --- verbatim from backend/game_engine/models.py (PR #261) ---
        raw = self.player_secret
        secret_str = raw if isinstance(raw, str) else str(raw)
        if len(secret_str) != 64 and not is_hex64(secret_str):
            self.player_secret = hash_secret(secret_str)
        # -------------------------------------------------------------
        super().save(*args, **kwargs)


from django.http import JsonResponse  # noqa: E402
from django.views.decorators.csrf import csrf_exempt  # noqa: E402


def _presented_secret(request):
    """Read the plaintext secret the way the real views.py does: from the
    request BODY (or the X-Player-Secret header) — never from the URL."""
    body = {}
    try:
        body = json.loads(request.body or b"{}")
    except (ValueError, TypeError):
        body = {}
    return body.get("player_secret") or request.META.get("HTTP_X_PLAYER_SECRET")


@csrf_exempt
def create_player(request):
    """POST /api/players/ — issue a fresh plaintext, store only the hash."""
    if request.method != "POST":
        return JsonResponse({"error": "method"}, status=405)
    try:
        body = json.loads(request.body or b"{}")
    except (ValueError, TypeError):
        body = {}
    plain = new_player_secret()
    player = Player.objects.create(player_secret=plain, name=body.get("name", ""))
    # Return the plaintext exactly once (the DB stored only the hash).
    return JsonResponse(
        {"player_id": player.pk, "player_secret": plain}, status=201
    )


@csrf_exempt
def rotate_secret(request, pk=None):
    """POST /api/players/<pk>/rotate_secret/ — mirrors views.py.

    Addressed by the player's opaque pk (like the real ``detail=True`` route);
    the current secret is presented in the BODY, never in the URL.
    """
    if request.method != "POST":
        return JsonResponse({"error": "method"}, status=405)
    try:
        player = Player.objects.get(pk=pk)
    except Player.DoesNotExist:
        return JsonResponse({"error": "not found"}, status=404)

    provided = _presented_secret(request)
    # --- verbatim auth check from backend/game_engine/views.py (PR #261) ---
    if not provided or player.player_secret != hash_secret(provided):
        return JsonResponse({"error": "Invalid player_secret"}, status=403)
    # -----------------------------------------------------------------------
    plain = new_player_secret()
    player.player_secret = plain
    player.save()  # model hashes before persisting
    return JsonResponse({"player_id": player.pk, "player_secret": plain}, status=200)


@csrf_exempt
def stored_secret(request, pk=None):
    """Harness-only: return the RAW stored column for a player, keyed by pk.

    Lets the test prove the persisted value is a hash and never the plaintext.
    Keyed by the opaque pk (never by the plaintext secret) so this diagnostic
    route does not itself put a secret in the URL.
    """
    try:
        player = Player.objects.get(pk=pk)
    except Player.DoesNotExist:
        return JsonResponse({"error": "not found"}, status=404)
    return JsonResponse({"stored": player.player_secret})


urlpatterns = [
    path("api/players/", create_player, name="player-create"),
    path(
        "api/players/<int:pk>/rotate_secret/",
        rotate_secret,
        name="player-rotate-secret",
    ),
    path(
        "api/players/<int:pk>/stored/",
        stored_secret,
        name="player-stored",
    ),
]

# Resolve routes via reverse() rather than hardcoding, then publish them.
_create_url = reverse("player-create")
_url_file = os.environ.get("PSEC_URL_FILE")
if _url_file:
    with open(_url_file, "w") as fh:
        fh.write(_create_url)
print(f"CREATE_URL={_create_url}", flush=True)
print(f"SECURITY_SOURCE={_security_src}", flush=True)


def _migrate():
    """Create the harness Player table before serving (idempotent)."""
    from django.db import connection

    existing = connection.introspection.table_names()
    table = Player._meta.db_table
    if table not in existing:
        with connection.schema_editor() as editor:
            editor.create_model(Player)


if __name__ == "__main__":
    from django.core.management import execute_from_command_line

    _migrate()
    execute_from_command_line(sys.argv)
