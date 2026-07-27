"""T3 — Real-daphne WebSocket handshake regression test.

This is the durable guard for the prod incident where a double `self.accept()`
in GameConsumer crashed on daphne 4.x (`handshake_deferred` AttributeError ->
1011 -> rooms hung on "Reconnecting…").

CRITICAL: `WebsocketCommunicator` drives the consumer's ASGI app directly and
NEVER instantiates daphne's `WebSocketProtocol`, so it CANNOT reproduce the
`handshake_deferred` crash. Only a REAL daphne server in the path triggers it.
That is why this test boots daphne on a local port and connects over a real
socket — the same path prod uses.

This test runs inside the GAIA gate (pytest), so a reintroduction of the
double-accept (or any daphne-incompatible consumer change) will fail CI.
"""
import asyncio
import json
import os
import socket
import tempfile
import threading

from django.test import TransactionTestCase, override_settings

from channels.layers import InMemoryChannelLayer
from channels.routing import ProtocolTypeRouter, URLRouter
from game_engine.auth import WebSocketPlayerAuthMiddlewareStack
from game_engine.models import Room
from game_engine.routing import websocket_urlpatterns
from game_engine.test_auth_helper import make_player

# Use an in-memory channel layer (no Redis needed for the handshake test).
CHANNEL_LAYERS = {
    "default": {"BACKEND": "channels.layers.InMemoryChannelLayer", "CONFIG": {}}
}

# daphne runs in a SEPARATE thread with its own DB connection, so the test
# database must be a real on-disk file (not ":memory:", which is per-connection
# and triggers "database table is locked" / invisible rows across threads).
_TMP_DB = os.path.join(tempfile.gettempdir(), "sr_daphne_test.sqlite3")
if os.path.exists(_TMP_DB):
    os.remove(_TMP_DB)

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": _TMP_DB,
        # Let concurrent writers (daphne runs in a separate thread with its own
        # connection) wait instead of raising "database table is locked".
        "OPTIONS": {"timeout": 30},
    }
}


def _free_port():
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.bind(("", 0))
    port = s.getsockname()[1]
    s.close()
    return port


@override_settings(CHANNEL_LAYERS=CHANNEL_LAYERS, DATABASES=DATABASES)
class RealDaphneHandshakeTestCase(TransactionTestCase):
    """A real daphne server must accept the post-handshake auth and broadcast."""

    def tearDown(self):
        if os.path.exists(_TMP_DB):
            os.remove(_TMP_DB)

    def _build_app(self):
        return WebSocketPlayerAuthMiddlewareStack(
            ProtocolTypeRouter({"websocket": URLRouter(websocket_urlpatterns)})
        )

    def _run_daphne(self, port, ready):
        from daphne.server import Server

        server = Server(
            application=self._build_app(),
            endpoints=[f"tcp:port={port}:interface=127.0.0.1"],
        )
        ready.set()
        server.run()

    def test_real_daphne_handshake_broadcasts_game_state(self):
        """Full daphne path: connect + auth must yield game_state_update (no 1011)."""
        room = Room.objects.create(
            code="HSHA1", name="Daphne", match_type=Room.MatchType.CASUAL
        )
        producer = make_player(room, name="QA", is_host=True)
        room.players.add(producer)

        port = _free_port()
        ready = threading.Event()
        t = threading.Thread(target=self._run_daphne, args=(port, ready), daemon=True)
        t.start()
        ready.wait(timeout=10)

        async def drive():
            try:
                import websockets
            except ImportError:
                self.skipTest(
                    "websockets client lib not installed — T3 needs it to drive a "
                    "real daphne handshake. Install websockets to run this guard "
                    "(it is NOT a prod dependency)."
                )
            url = f"ws://127.0.0.1:{port}/ws/game/{room.code}/?player_id={producer.id}"
            frames = []
            async with websockets.connect(url, max_size=None) as ws:
                await ws.send(
                    json.dumps(
                        {
                            "type": "auth",
                            "player_id": str(producer.id),
                            "player_secret": producer.plain_secret,
                        }
                    )
                )
                for _ in range(10):
                    try:
                        msg = json.loads(await asyncio.wait_for(ws.recv(), timeout=5))
                    except Exception:
                        break
                    frames.append(msg.get("type"))
                    if msg.get("type") == "game_state_update":
                        break
            return frames

        frames = asyncio.run(drive())
        self.assertIn(
            "game_state_update",
            frames,
            "Real daphne handshake did not broadcast game_state_update — the "
            "1011 'Reconnecting…' defect (double self.accept / handshake_deferred) "
            "has regressed.",
        )
