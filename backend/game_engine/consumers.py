import json
import logging
from uuid import UUID
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from .models import Room, Player
from .serializers import GameStateSerializer

# Audit logger for security-relevant events
audit_logger = logging.getLogger("game_audit")


class GameConsumer(AsyncWebsocketConsumer):
    # Only allow these message types from authenticated clients
    ALLOWED_CLIENT_TYPES = {"vote_submitted", "bingo_achievement"}
    # Server-initiated types that clients MUST NOT send
    FORBIDDEN_CLIENT_TYPES = {
        "timer_tick",
        "turn_change",
        "victory_celebration",
        "game_update",
        "game_state_update",
        "player_joined",
        "player_left",
        "host_migrated",
    }

    async def connect(self):
        room_identifier = self.scope["url_route"]["kwargs"]["game_id"]
        room_identity = await self.get_room_identity(room_identifier)
        if not room_identity:
            await self.close(code=4404)
            return

        self.game_id = room_identity["id"]
        self.room_code = room_identity["code"]
        self.game_group_name = f"game_{self.game_id}"
        self.player_id = None

        player = self.scope.get("player")
        player_id = str(player.id) if player else None
        self.player_id = player_id

        audit_logger.info(
            "websocket_connect_attempt",
            extra={
                "room_id": self.game_id,
                "room_code": self.room_code,
                "player_id": player_id,
                "has_identity": bool(player),
                "action": "connect",
            },
        )

        # Reject unauthenticated connections
        if not player:
            audit_logger.warning(
                "websocket_unauthenticated_rejected",
                extra={
                    "room_id": self.game_id,
                    "room_code": self.room_code,
                    "action": "rejected",
                },
            )
            await self.close(code=4003)
            return

        await self.set_player_connected(player_id, True)
        audit_logger.info(
            "websocket_player_verified",
            extra={
                "room_id": self.game_id,
                "player_id": player_id,
                "action": "verified",
            },
        )

        # Join room group
        await self.channel_layer.group_add(self.game_group_name, self.channel_name)

        await self.accept()

        audit_logger.info(
            "websocket_connected",
            extra={
                "room_id": self.game_id,
                "player_id": self.player_id,
                "group_name": self.game_group_name,
                "action": "connected",
            },
        )

        # Broadcast that player is now online
        if self.player_id:
            player_payload = await self.get_player_presence_payload(self.player_id)
            if player_payload:
                await self.channel_layer.group_send(
                    self.game_group_name,
                    {"type": "player_joined", "payload": player_payload},
                )
            await self.broadcast_game_state()

    async def disconnect(self, close_code):
        # Mark player as disconnected
        if self.player_id:
            player_payload = await self.get_player_presence_payload(self.player_id)
            was_host = await self.check_if_host(self.player_id)
            await self.set_player_connected(self.player_id, False)

            # Host migration: if the disconnected player was the host, promote another producer
            if was_host:
                new_host = await self.promote_new_host()
                if new_host:
                    await self.channel_layer.group_send(
                        self.game_group_name,
                        {
                            "type": "host_migrated",
                            "payload": {
                                "newHostId": str(new_host.id),
                                "newHostName": new_host.name,
                            },
                        },
                    )

            if player_payload:
                await self.channel_layer.group_send(
                    self.game_group_name,
                    {"type": "player_left", "payload": player_payload},
                )
            await self.broadcast_game_state()

        # Leave room group
        await self.channel_layer.group_discard(self.game_group_name, self.channel_name)

    async def receive(self, text_data):
        text_data_json = json.loads(text_data)
        message_type = text_data_json.get("type")

        # Security: Reject forbidden message types that should only come from server
        if message_type in self.FORBIDDEN_CLIENT_TYPES:
            audit_logger.warning(
                "forbidden_message_type_attempt",
                extra={
                    "room_id": self.game_id,
                    "player_id": self.player_id,
                    "message_type": message_type,
                    "action": "reject",
                },
            )
            return  # Reject spoofed server messages

        # Security: Only allow specific client-initiated events from authenticated players
        if message_type in self.ALLOWED_CLIENT_TYPES:
            if not self.player_id:
                # Unauthenticated client trying to send privileged message
                audit_logger.warning(
                    "unauthenticated_client_message",
                    extra={
                        "room_id": self.game_id,
                        "message_type": message_type,
                        "action": "reject",
                    },
                )
                return  # Reject unauthenticated messages
            # Log legitimate client actions for audit
            audit_logger.info(
                "client_message_accepted",
                extra={
                    "room_id": self.game_id,
                    "player_id": self.player_id,
                    "message_type": message_type,
                },
            )

        # Broadcast the message to all clients in the room
        if message_type == "bingo_achievement":
            await self.channel_layer.group_send(
                self.game_group_name,
                {"type": "bingo_achievement", "payload": text_data_json.get("payload")},
            )
        elif message_type == "vote_submitted":
            await self.channel_layer.group_send(
                self.game_group_name,
                {"type": "vote_submitted", "payload": text_data_json.get("payload")},
            )

    async def game_state_update(self, event):
        payload = event["payload"]

        # Send message to WebSocket
        await self.send(
            text_data=json.dumps({"type": "game_state_update", "payload": payload})
        )

    @database_sync_to_async
    def get_room_identity(self, room_identifier):
        """Resolve either a public room code or database UUID to the canonical room id."""
        room = Room.objects.filter(code=room_identifier).first()
        if not room:
            try:
                UUID(str(room_identifier))
            except ValueError:
                return None
            room = Room.objects.filter(id=room_identifier).first()

        if not room:
            return None

        return {"id": str(room.id), "code": room.code}

    @database_sync_to_async
    def set_player_connected(self, player_id, is_connected):
        """Update player connection status"""
        try:
            Player.objects.filter(id=player_id).update(is_connected=is_connected)
        except Exception:
            pass

    @database_sync_to_async
    def get_game_state(self):
        """Get serialized game state for broadcasting"""
        try:
            room = Room.objects.get(id=self.game_id)
            serializer = GameStateSerializer(room)
            return serializer.data
        except Room.DoesNotExist:
            return None

    @database_sync_to_async
    def check_if_host(self, player_id):
        """Check if the given player is the current host."""
        try:
            player = Player.objects.get(id=player_id, room_id=self.game_id)
            return player.is_host
        except Player.DoesNotExist:
            return False

    @database_sync_to_async
    def promote_new_host(self):
        """Promote the first connected non-spectator producer to host. Returns the new host or None."""
        try:
            new_host = Player.objects.filter(
                room_id=self.game_id,
                is_connected=True,
                is_spectator=False,
                is_host=False,
            ).first()
            if new_host:
                new_host.is_host = True
                new_host.save(update_fields=['is_host'])
            return new_host
        except Exception:
            return None

    @database_sync_to_async
    def get_player_presence_payload(self, player_id):
        """Get non-secret player details for presence broadcasts."""
        try:
            player = Player.objects.get(id=player_id, room_id=self.game_id)
            return {
                "playerId": str(player.id),
                "playerName": player.name,
                "isSpectator": player.is_spectator,
            }
        except Player.DoesNotExist:
            return None

    async def broadcast_game_state(self):
        """Broadcast current game state to all clients in the room"""
        game_state = await self.get_game_state()
        if game_state:
            await self.channel_layer.group_send(
                self.game_group_name,
                {"type": "game_state_update", "payload": game_state},
            )

    async def vote_submitted(self, event):
        await self.send(
            text_data=json.dumps(
                {"type": "vote_submitted", "payload": event["payload"]}
            )
        )

    async def timer_tick(self, event):
        await self.send(
            text_data=json.dumps({"type": "timer_tick", "payload": event["payload"]})
        )

    async def turn_change(self, event):
        await self.send(
            text_data=json.dumps({"type": "turn_change", "payload": event["payload"]})
        )

    async def player_joined(self, event):
        await self.send(
            text_data=json.dumps({"type": "player_joined", "payload": event["payload"]})
        )

    async def player_left(self, event):
        await self.send(
            text_data=json.dumps({"type": "player_left", "payload": event["payload"]})
        )

    async def victory_celebration(self, event):
        await self.send(
            text_data=json.dumps({"type": "victory_celebration", "payload": event["payload"]})
        )

    async def host_migrated(self, event):
        await self.send(
            text_data=json.dumps({"type": "host_migrated", "payload": event["payload"]})
        )
