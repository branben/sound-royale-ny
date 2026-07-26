"""Regression test for the WebSocket auth -> broadcast path.

Guards against the prod incident where `channels==4.0.0` was paired with
`daphne==4.2.2`: daphne's WebSocketProtocol referenced `self.handshake_deferred`
(introduced in channels>=4.1.0), so every `self.accept()` raised AttributeError,
the socket closed with 1011, and rooms hung on "Reconnecting…".

IMPORTANT: the version-mismatch crash only manifests when daphne is actually in the
path (a real daphne server). `WebsocketCommunicator` drives the consumer's ASGI app
directly and never instantiates daphne's `WebSocketProtocol`, so it CANNOT reproduce
the `handshake_deferred` crash. The durable guard against that specific regression is
the `channels==4.1.0` pin in `requirements.txt`. This test adds app-level behavior
coverage for the WS auth -> broadcast path (which had zero tests), and the
`test_channels_version_floor` assertion documents the daphne/channels contract so a
silent downgrade of `channels` to <4.1.0 fails loudly in CI.
"""
import channels
from django.test import TestCase, override_settings

from channels.routing import ProtocolTypeRouter, URLRouter
from channels.testing import WebsocketCommunicator

from game_engine.auth import WebSocketPlayerAuthMiddlewareStack
from game_engine.models import Room
from game_engine.routing import websocket_urlpatterns
from game_engine.test_auth_helper import make_player

CHANNELS_MIN_SAFE = (4, 1, 0)  # daphne 4.2.x requires handshake_deferred (channels>=4.1.0)


@override_settings(
    CHANNEL_LAYERS={
        "default": {
            "BACKEND": "channels.layers.InMemoryChannelLayer",
            "CONFIG": {},
        }
    }
)
class WebSocketAuthBroadcastTestCase(TestCase):
    def setUp(self):
        self.room = Room.objects.create(
            code="AUTH", name="Auth Room", status=Room.Status.LOBBY
        )
        self.producer = make_player(
            room=self.room,
            name="AuthProducer",
            is_spectator=False,
            is_host=True,
        )

    def _build_communicator(self):
        application = ProtocolTypeRouter(
            {
                "websocket": WebSocketPlayerAuthMiddlewareStack(
                    URLRouter(websocket_urlpatterns)
                )
            }
        )
        return WebsocketCommunicator(application, f"/ws/game/{self.room.code}/")

    async def test_post_handshake_auth_receives_game_state_update(self):
        """Auth handshake must push game_state_update (the broadcast the UI renders from)."""
        communicator = self._build_communicator()
        connected, _ = await communicator.connect()
        self.assertTrue(connected, "WebSocket failed to connect")

        # Post-handshake auth exactly like gameSocket.ts sendAuthMessage()
        await communicator.send_json_to(
            {
                "type": "auth",
                "player_id": str(self.producer.id),
                "player_secret": self.producer.plain_secret,
            }
        )

        # Drain frames until we see the game_state_update the UI needs to render the
        # board. Do NOT accept player_joined as a substitute — finalize_connection
        # sends player_joined before broadcast_game_state, so a consumer that stopped
        # emitting game_state_update would otherwise still pass. Stop on close/timeout.
        received_game_state = False
        for _ in range(30):
            try:
                resp = await communicator.receive_output(timeout=1)
            except Exception:
                break
            if resp.get("type") == "websocket.close":
                break
            if resp.get("type") != "websocket.send":
                continue
            import json as _json

            res = _json.loads(resp["text"])
            if res.get("type") == "game_state_update":
                received_game_state = True
                break

        self.assertTrue(
            received_game_state,
            "game_state_update was not broadcast after auth — board cannot render "
            "(the 1011 'Reconnecting…' defect)",
        )

        await communicator.disconnect()

    async def test_invalid_secret_closes_with_4003(self):
        """A bad secret must close with code 4003, not hang or crash."""
        communicator = self._build_communicator()
        connected, _ = await communicator.connect()
        self.assertTrue(connected)

        await communicator.send_json_to(
            {
                "type": "auth",
                "player_id": str(self.producer.id),
                "player_secret": "not-the-real-secret",
            }
        )

        # Expect an explicit websocket.close frame with code 4003 (GameConsumer
        # closes 4003 on auth failure). A timeout (socket stays open) must FAIL —
        # that would mean invalid-auth connections hang instead of being rejected.
        close_frame = None
        try:
            for _ in range(10):
                resp = await communicator.receive_output(timeout=1)
                if resp.get("type") == "websocket.close":
                    close_frame = resp
                    break
                if resp.get("type") != "websocket.send":
                    continue
        except Exception:
            pass

        self.assertIsNotNone(close_frame, "Invalid-secret auth must close the socket")
        self.assertEqual(
            close_frame.get("code"),
            4003,
            "Invalid-secret auth must close with 4003, got "
            f"{close_frame.get('code') if close_frame else 'no close frame'}",
        )
        await communicator.disconnect()

    def test_channels_version_floor(self):
        """Document the daphne/channels contract: channels must be >= 4.1.0.

        This is the real guard against the prod `handshake_deferred` crash. If
        someone downgrades channels below 4.1.0 (incompatible with daphne 4.2.x),
        this fails loudly instead of silently breaking every WS connection on prod.
        """
        version = tuple(int(p) for p in channels.__version__.split(".")[:3])
        self.assertGreaterEqual(
            version,
            CHANNELS_MIN_SAFE,
            f"channels {channels.__version__} is incompatible with daphne 4.2.x "
            "(needs handshake_deferred, introduced in channels 4.1.0). Pin "
            "channels>=4.1.0 in requirements.txt.",
        )
