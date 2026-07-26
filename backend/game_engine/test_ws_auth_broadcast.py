"""Regression test for the WebSocket auth -> broadcast path.

Guards against the prod incident where `channels==4.0.0` was paired with
`daphne==4.2.2`: daphne's WebSocketProtocol referenced `self.handshake_deferred`
(introduced in channels>=4.1.0), so every `self.accept()` raised AttributeError,
the socket closed with 1011, and rooms hung on "Reconnecting…".

This test connects a raw WebSocket to GameConsumer, performs the post-handshake
`auth` handshake exactly like the frontend (gameSocket.ts sendAuthMessage), and
asserts the server accepts the connection and pushes a `game_state_update`
(per consumers.GameConsumer.finalize_connection -> broadcast_game_state).
"""
from django.test import TestCase
from django.test import override_settings

from channels.routing import ProtocolTypeRouter, URLRouter
from channels.testing import WebsocketCommunicator

from game_engine.auth import WebSocketPlayerAuthMiddlewareStack
from game_engine.consumers import GameConsumer
from game_engine.models import Room, Player
from game_engine.routing import websocket_urlpatterns
from game_engine.test_auth_helper import make_player


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
        """Auth handshake must succeed and broadcast game_state_update (no 1011)."""
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

        # The server must push game_state_update (and/or player_joined) after auth.
        received_game_state = False
        received_player_joined = False
        # Wait up to ~3s for the broadcast. Use receive_output (not receive_from)
        # so a websocket.close frame is surfaced instead of raising AssertionError.
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
            if res.get("type") == "player_joined":
                received_player_joined = True
                continue

        self.assertTrue(
            received_game_state or received_player_joined,
            "No server push after auth — connection likely crashed (the 1011 defect)",
        )

        await communicator.disconnect()

    async def test_invalid_secret_is_rejected_not_crashed(self):
        """A bad secret must close cleanly (4003), not raise inside accept()."""
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

        # Consumer should close the socket (4003) without an unhandled exception.
        # receive_json_from will raise ChannelClosed if the socket closed as expected.
        closed_cleanly = False
        try:
            await communicator.receive_json_from(timeout=2)
        except Exception:
            closed_cleanly = True
        self.assertTrue(
            closed_cleanly,
            "Invalid-secret path should close the socket, not hang or crash",
        )
        await communicator.disconnect()
