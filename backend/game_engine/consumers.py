import json
from urllib.parse import parse_qs
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from .models import Room, Player
from .serializers import GameStateSerializer


class GameConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.game_id = self.scope["url_route"]["kwargs"]["game_id"]
        self.game_group_name = f"game_{self.game_id}"
        self.player_id = None

        # Parse query parameters for player identification
        query_string = self.scope.get("query_string", b"").decode()
        query_params = parse_qs(query_string)
        player_id = query_params.get("player_id", [None])[0]
        player_secret = query_params.get("secret", [None])[0]

        # Verify player if credentials provided
        if player_id and player_secret:
            player = await self.verify_player(player_id, player_secret)
            if player:
                self.player_id = player_id
                await self.set_player_connected(player_id, True)

        # Join room group
        await self.channel_layer.group_add(self.game_group_name, self.channel_name)

        await self.accept()

        # Broadcast that player is now online
        if self.player_id:
            await self.broadcast_game_state()

    async def disconnect(self, close_code):
        # Mark player as disconnected
        if self.player_id:
            await self.set_player_connected(self.player_id, False)
            await self.broadcast_game_state()

        # Leave room group
        await self.channel_layer.group_discard(self.game_group_name, self.channel_name)

    async def receive(self, text_data):
        text_data_json = json.loads(text_data)
        message_type = text_data_json.get("type")

        if message_type == "game_update":
            await self.channel_layer.group_send(
                self.game_group_name,
                {"type": "game_state_update", "payload": text_data_json.get("payload")},
            )
        elif message_type == "bingo_achievement":
            await self.channel_layer.group_send(
                self.game_group_name,
                {"type": "bingo_achievement", "payload": text_data_json.get("payload")},
            )
        elif message_type == "victory_celebration":
            await self.channel_layer.group_send(
                self.game_group_name,
                {
                    "type": "victory_celebration",
                    "payload": text_data_json.get("payload"),
                },
            )
        elif message_type == "vote_submitted":
            await self.channel_layer.group_send(
                self.game_group_name,
                {
                    "type": "vote_submitted",
                    "payload": text_data_json.get("payload"),
                },
            )
        elif message_type == "timer_tick":
            await self.channel_layer.group_send(
                self.game_group_name,
                {
                    "type": "timer_tick",
                    "payload": text_data_json.get("payload"),
                },
            )
        elif message_type == "turn_change":
            await self.channel_layer.group_send(
                self.game_group_name,
                {
                    "type": "turn_change",
                    "payload": text_data_json.get("payload"),
                },
            )
        elif message_type == "player_joined":
            await self.channel_layer.group_send(
                self.game_group_name,
                {
                    "type": "player_joined",
                    "payload": text_data_json.get("payload"),
                },
            )
        elif message_type == "player_left":
            await self.channel_layer.group_send(
                self.game_group_name,
                {
                    "type": "player_left",
                    "payload": text_data_json.get("payload"),
                },
            )

    async def game_state_update(self, event):
        payload = event["payload"]

        # Send message to WebSocket
        await self.send(
            text_data=json.dumps({"type": "game_state_update", "payload": payload})
        )

    @database_sync_to_async
    def verify_player(self, player_id, player_secret):
        """Verify player credentials and return player if valid"""
        try:
            player = Player.objects.get(
                id=player_id, player_secret=player_secret, room_id=self.game_id
            )
            return player
        except Player.DoesNotExist:
            return None

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
