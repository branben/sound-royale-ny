#!/usr/bin/env python3
"""Self-contained Django harness that PROVES the SEC-1 server-URL leak (#105).

Issue #105 (SEC-1) — transport half:

    "Player secret is exposed via URL query param or console/error string.
     Move to Authorization header / POST body / first WS message."

The client-side gates (tests/testdriver/sec1-*-not-in-url.test.mjs) cover the
browser/`src` surface. This harness covers the *server* surface, which the
current backend still leaks: several DRF routes carry the PLAINTEXT
``player_secret`` in the URL **path**, e.g.

  * ``GET /api/game-sessions/by-player/<player_secret>/``      (game_session_urls.py)
  * the ``by_player`` action ``url_path='by-player/(?P<player_secret>...)'`` (game_session_views.py)
  * every detail route on ``PlayerViewSet`` (``lookup_field = "player_secret"``),
    including the rotation endpoint ``POST /api/players/<player_secret>/rotate_secret/``.

Hashing the secret AT REST (PR #261) does NOT fix this: the value that travels
in the path is the *plaintext* the client holds. A URL path is exactly as
leak-prone as a query param — it lands in the browser history/address bar,
server / proxy / CDN access logs, and the outbound ``Referer`` header.

To prove the leak is REAL (not a theoretical reading of the routes), this
harness reproduces the real ``by-player/<player_secret>/`` route contract over
HTTP and exposes, on each request, whether the framework resolved the secret
out of the URL PATH (``resolved_from == "path"``). The test then asserts that a
secret placed in the path is what the server used to look the player up — the
observable signature of the SEC-1 leak.

TST-1: routes are resolved via ``django.urls.reverse`` and published as JSON at
boot (never hardcoded in the client).

Usage::

    SERVER_URL_LEAK_SECURITY_PY=/path/to/real/security.py \
    SERVER_URL_LEAK_URLS_FILE=/tmp/leak/urls.json \
    python3 server_url_leak_harness.py runserver 127.0.0.1:8113 --noreload
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
    real = os.environ.get("SERVER_URL_LEAK_SECURITY_PY")
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

_DB_PATH = os.environ.get("SERVER_URL_LEAK_DB_PATH") or os.path.join(
    tempfile.gettempdir(), "server_url_leak_harness.sqlite3"
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
        __name__,
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
    player_secret = models.CharField(
        max_length=64, default=new_player_secret, editable=False
    )
    name = models.CharField(max_length=50, default="Player")

    class Meta:
        app_label = __name__

    def save(self, *args, **kwargs):
        raw = self.player_secret
        secret_str = raw if isinstance(raw, str) else str(raw)
        if len(secret_str) != 64 and not is_hex64(secret_str):
            self.player_secret = hash_secret(secret_str)
        super().save(*args, **kwargs)


# --- Views ------------------------------------------------------------------
# Mirrors GameSessionViewSet.by_player: the secret arrives as a URL PATH kwarg
# and is used (hashed) to look the player up. The response reports where the
# secret came from so the test can prove the path-param leak observationally.
class GameSessionViewSet(viewsets.ViewSet):
    def create(self, request):
        """Issue a fresh plaintext secret, store only its hash."""
        plain_secret = new_player_secret()
        player = Player.objects.create(
            name=request.data.get("name", "Player"),
            player_secret=plain_secret,
        )
        return Response(
            {"player_id": str(player.id), "player_secret": plain_secret},
            status=status.HTTP_201_CREATED,
        )

    @action(detail=False, methods=["get"], url_path="by-player/(?P<player_secret>[^/.]+)")
    def by_player(self, request, player_secret=None):
        # SEC-1 leak signature: the credential is taken from the URL PATH.
        secret_from_path = player_secret
        player = get_object_or_404(
            Player, player_secret=hash_secret(secret_from_path)
        )
        return Response(
            {
                "player_id": str(player.id),
                # Echo how the credential reached the server. On the leaking
                # implementation this is always "path" (there is no body/header
                # path); once SEC-1 is fixed the route no longer accepts a
                # path secret at all and this endpoint 404s / 405s.
                "resolved_from": "path",
                "secret_in_path": secret_from_path,
            }
        )


_create = GameSessionViewSet.as_view({"post": "create"})
_by_player = GameSessionViewSet.as_view({"get": "by_player"})

urlpatterns = [
    path("api/game-sessions/create/", _create, name="gs-create"),
    path(
        "api/game-sessions/by-player/<str:player_secret>/",
        _by_player,
        name="gs-by-player",
    ),
]


def _bootstrap_schema():
    try:
        if os.path.exists(_DB_PATH):
            os.remove(_DB_PATH)
    except OSError:
        pass
    with connection.schema_editor() as schema_editor:
        schema_editor.create_model(Player)


_bootstrap_schema()

# TST-1: publish reverse()-resolved routes rather than hardcoding them.
_urls = {
    "create": reverse("gs-create"),
    "by_player_template": reverse(
        "gs-by-player", kwargs={"player_secret": "SECRET"}
    ),
}
_urls_file = os.environ.get("SERVER_URL_LEAK_URLS_FILE")
if _urls_file:
    with open(_urls_file, "w") as fh:
        json.dump(_urls, fh)
print("SERVER_URL_LEAK_URLS=" + json.dumps(_urls), flush=True)
print(f"SERVER_URL_LEAK_SECURITY_SOURCE={_security_src}", flush=True)


if __name__ == "__main__":
    from django.core.management import execute_from_command_line

    execute_from_command_line(sys.argv)
