#!/usr/bin/env python3
"""Self-contained Django harness for the SEC-1 player-secret rotation endpoint.

Issue #105 (SEC-1), at-rest half (PR #261): ``player_secret`` is stored ONLY as
a SHA-256 hash, the plaintext is issued to the client exactly once, and a new
``POST /api/players/<player_id>/rotate_secret/`` endpoint lets a client swap its
secret (verifying the current one, invalidating it, and returning a fresh
plaintext).

This harness wraps the security-critical pieces of that feature in a minimal
Django project so the endpoint can be exercised end-to-end over HTTP inside the
TestDriver sandbox, with no Redis / channels / JWT / serializer dependencies:

  * The REAL ``backend/game_engine/security.py`` is imported directly (staged
    next to this harness as ``security.py``) — hashing / issuance / is_hex64
    are the genuine implementations, not reimplementations.
  * The ``Player`` model reproduces the real model's at-rest hashing contract
    (``models.py``): ``player_secret`` is a ``CharField(64)`` defaulting to a
    freshly issued secret, and ``save()`` hashes any non-hash plaintext before
    persisting so plaintext is never stored.
  * The ``rotate_secret`` / ``create`` view logic mirrors the real
    ``PlayerViewSet`` in ``views.py``: create issues a plaintext once; rotate
    requires the current secret (403 otherwise), issues a new plaintext, and
    invalidates the old.

SEC-1 (#105) — SECRET IS NEVER IN THE URL. A ``player_secret`` is a bearer
credential; SEC-1 requires it travel in the Authorization header / POST body /
first WS message, NEVER in a URL (path or query string, where it leaks into
access logs, the ``Referer`` header, process args, and browser history). So the
detail routes here are keyed on the player's ``id`` (a random UUIDv4 that is
NOT a credential — leaking it grants nothing without the secret), and the
current/new secret is only ever read from ``request.data`` (the POST body).
This mirrors the SEC-1 contract the client-side gate
(``sec1-player-secret-not-in-url.test.mjs``) enforces: "carrying a secret in a
POST body ... is the CORRECT SEC-1 shape".

TST-1 resilience: URLs are NOT hardcoded in the client. Routes are registered
under stable names and resolved with :func:`django.urls.reverse`; the resolved
paths are written to ``ROTATION_URLS_FILE`` (and echoed to stdout) at boot so
the HTTP client discovers them dynamically.

Usage::

    ROTATION_SECURITY_PY=/path/to/real/security.py \
    ROTATION_URLS_FILE=/tmp/rot/urls.json \
    python3 rotation_harness.py runserver 127.0.0.1:8112 --noreload
"""

import json
import os
import sys
import tempfile
import importlib.util

import django
from django.conf import settings


# --- Import the REAL security helpers (staged next to this harness). --------
def _load_security():
    real = os.environ.get("ROTATION_SECURITY_PY")
    candidates = [real] if real else []
    candidates.append(os.path.join(os.path.dirname(__file__), "security.py"))
    for src in candidates:
        if src and os.path.isfile(src):
            spec = importlib.util.spec_from_file_location("real_security", src)
            mod = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(mod)
            return mod, src
    raise SystemExit("Could not locate a security.py with hash_secret/new_player_secret")


security, _security_src = _load_security()
hash_secret = security.hash_secret
new_player_secret = security.new_player_secret
is_hex64 = security.is_hex64

# Use a FILE-backed SQLite DB (not ":memory:"). runserver serves requests on a
# different DB connection than the one that bootstraps the schema, and each
# ":memory:" connection is a *separate* empty database — so the request thread
# would see "no such table". A shared temp file is visible to every connection.
_DB_PATH = os.environ.get("ROTATION_DB_PATH") or os.path.join(
    tempfile.gettempdir(), "rotation_harness.sqlite3"
)


settings.configure(
    DEBUG=True,
    SECRET_KEY="harness-only-not-secret",
    ALLOWED_HOSTS=["*"],
    ROOT_URLCONF=__name__,
    DATABASES={
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": _DB_PATH,
        }
    },
    INSTALLED_APPS=[
        "django.contrib.contenttypes",
        "django.contrib.auth",
        "rest_framework",
        __name__,  # register this module as an app so the model is discoverable
    ],
    REST_FRAMEWORK={
        "DEFAULT_AUTHENTICATION_CLASSES": [],
        "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.AllowAny"],
    },
    LOGGING_CONFIG=None,
)

django.setup()

import uuid  # noqa: E402
from django.db import models, connection  # noqa: E402
from django.urls import path, reverse  # noqa: E402
from rest_framework import viewsets, status  # noqa: E402
from rest_framework.decorators import action  # noqa: E402
from rest_framework.response import Response  # noqa: E402
from django.shortcuts import get_object_or_404  # noqa: E402


# --- Player model — mirrors the at-rest hashing contract from models.py. ----
class Player(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    # Stored as SHA-256 hex of the issued plaintext secret (guardrail #105).
    player_secret = models.CharField(
        max_length=64, default=new_player_secret, editable=False
    )
    name = models.CharField(max_length=50, default="Player")

    class Meta:
        app_label = __name__

    def save(self, *args, **kwargs):
        # Hash the secret on assignment so plaintext is never persisted.
        # If the value is already a 64-char lowercase hex digest, leave it
        # (e.g. loaded from DB or already hashed) to avoid double-hashing.
        raw = self.player_secret
        secret_str = raw if isinstance(raw, str) else str(raw)
        if len(secret_str) != 64 and not is_hex64(secret_str):
            self.player_secret = hash_secret(secret_str)
        super().save(*args, **kwargs)


# --- View — mirrors PlayerViewSet.create + rotate_secret from views.py. -----
#
# SEC-1 (#105): detail routes are keyed on the player's `id` (a UUID, NOT a
# credential). The current/new secret is ONLY read from the POST body
# (`request.data`) — never from the URL. This is the transport shape SEC-1
# mandates and matches the client-side "secret must not be in a URL" gate.
class PlayerViewSet(viewsets.ViewSet):
    # Look the player up by its non-secret id, so the URL carries no credential.
    lookup_field = "player_id"

    def create(self, request):
        """Issue a fresh plaintext secret, store only its hash."""
        plain_secret = new_player_secret()
        player = Player.objects.create(
            name=request.data.get("name", "Player"),
            player_secret=plain_secret,
        )
        # Plaintext returned to the client exactly once. `player_id` is a UUID
        # (safe to put in later request URLs); `player_secret` goes in the body.
        return Response(
            {"player_id": str(player.id), "player_secret": plain_secret},
            status=status.HTTP_201_CREATED,
        )

    def get_object(self):
        # Resolve by the NON-secret id from the URL. Nothing sensitive is in
        # the path — the secret arrives in the request body and is checked below.
        return get_object_or_404(Player, id=self.kwargs[self.lookup_field])

    @action(detail=True, methods=["post"])
    def rotate_secret(self, request, player_id=None):
        """Rotate the player's secret. Requires the current secret (#105).

        The current secret is read from the POST body (SEC-1) — never the URL —
        and compared against the stored hash. On success a fresh plaintext is
        issued and the old secret is invalidated.
        """
        player = self.get_object()

        provided_secret = request.data.get("player_secret")
        if not provided_secret or player.player_secret != hash_secret(provided_secret):
            return Response(
                {"error": "Invalid player_secret"},
                status=status.HTTP_403_FORBIDDEN,
            )

        plain_secret = new_player_secret()
        player.player_secret = plain_secret
        player.save()  # model hashes before persisting

        return Response(
            {"player_id": str(player.id), "player_secret": plain_secret},
            status=status.HTTP_200_OK,
        )


# --- Debug helper: expose the stored (hashed) value so the test can prove ----
# the plaintext is NOT what is persisted. This is HARNESS-ONLY (never exists in
# the real app); it lets the test assert the at-rest contract directly. It is
# also keyed on the non-secret `player_id` (SEC-1) — the plaintext secret it
# checks against travels in the POST body, not the URL.
class _DebugViewSet(viewsets.ViewSet):
    lookup_field = "player_id"

    def check(self, request, player_id=None):
        player = get_object_or_404(Player, id=player_id)
        provided_secret = request.data.get("player_secret")
        return Response(
            {
                "player_id": str(player.id),
                "stored_secret": player.player_secret,
                "stored_is_hash": is_hex64(player.player_secret),
                # True iff the body secret hashes to the stored value — proves
                # the plaintext is verifiable without ever being persisted.
                "matches_stored": bool(provided_secret)
                and player.player_secret == hash_secret(provided_secret),
            }
        )


_create = PlayerViewSet.as_view({"post": "create"})
_rotate = PlayerViewSet.as_view({"post": "rotate_secret"})
# Debug uses POST so the secret-to-verify can ride in the body, never the URL.
_debug = _DebugViewSet.as_view({"post": "check"})

urlpatterns = [
    path("api/players/", _create, name="player-create"),
    path(
        "api/players/<str:player_id>/rotate_secret/",
        _rotate,
        name="player-rotate-secret",
    ),
    path(
        "api/players/<str:player_id>/_debug/",
        _debug,
        name="player-debug",
    ),
]


def _bootstrap_schema():
    """(Re)create a clean table for the harness Player model on the shared DB.

    Runs at import time so BOTH the management process and runserver's request
    threads (separate connections to the same file DB) see the table.
    """
    # Start from a clean file so repeated boots don't accumulate rows.
    try:
        if os.path.exists(_DB_PATH):
            os.remove(_DB_PATH)
    except OSError:
        pass
    with connection.schema_editor() as schema_editor:
        schema_editor.create_model(Player)


_bootstrap_schema()

# TST-1: publish reverse()-resolved routes rather than hardcoding them.
# The detail templates interpolate PLAYER_ID (a non-secret UUID), never a secret.
_urls = {
    "create": reverse("player-create"),
    # rotate/debug are parameterized on the NON-secret player id; publish a
    # template the client fills in with the id it got back from create.
    "rotate_template": reverse(
        "player-rotate-secret", kwargs={"player_id": "PLAYER_ID"}
    ),
    "debug_template": reverse("player-debug", kwargs={"player_id": "PLAYER_ID"}),
}
_urls_file = os.environ.get("ROTATION_URLS_FILE")
if _urls_file:
    with open(_urls_file, "w") as fh:
        json.dump(_urls, fh)
print("ROTATION_URLS=" + json.dumps(_urls), flush=True)
print(f"ROTATION_SECURITY_SOURCE={_security_src}", flush=True)
print(f"ROTATION_DB_PATH={_DB_PATH}", flush=True)


if __name__ == "__main__":
    from django.core.management import execute_from_command_line

    execute_from_command_line(sys.argv)
