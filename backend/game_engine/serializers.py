from rest_framework import serializers
from .models import Room, Player, Tile


class TileSerializer(serializers.ModelSerializer):
    """Serializer for Tile model - matches React frontend Tile interface"""

    class Meta:
        model = Tile
        fields = ["id", "genre", "status", "audio_url", "position"]
        read_only_fields = ["id"]


class PlayerSerializer(serializers.ModelSerializer):
    """Serializer for Player model - matches React frontend Player interface"""

    # Nested tiles serializer to include board data
    tiles = TileSerializer(many=True, read_only=True)

    class Meta:
        model = Player
        fields = [
            "id",
            "name",
            "avatar",
            "room",
            "is_spectator",
            "is_connected",
            "joined_at",
            "tiles",
        ]
        read_only_fields = ["id", "joined_at", "is_connected"]


class RoomSerializer(serializers.ModelSerializer):
    """Serializer for Room model - matches React frontend GameState interface"""

    # Nested players serializer to include all player data
    players = PlayerSerializer(many=True, read_only=True)
    # Winner details nested
    winner = PlayerSerializer(read_only=True)

    class Meta:
        model = Room
        fields = [
            "id",
            "code",
            "name",
            "status",
            "current_round",
            "winner",
            "created_at",
            "updated_at",
            "players",
        ]
        read_only_fields = ["id", "code", "created_at", "updated_at"]


class RoomDetailSerializer(serializers.ModelSerializer):
    """Detailed room serializer for specific room views"""

    # Nested players serializer to include all player data
    players = PlayerSerializer(many=True, read_only=True)
    # Winner details nested
    winner = PlayerSerializer(read_only=True)

    class Meta:
        model = Room
        fields = [
            "id",
            "code",
            "name",
            "status",
            "current_round",
            "winner",
            "created_at",
            "updated_at",
            "players",
        ]
        read_only_fields = ["id", "code", "created_at", "updated_at"]


class RoomCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating new rooms"""

    player_name = serializers.CharField(write_only=True, required=False)

    class Meta:
        model = Room
        fields = ["id", "code", "name", "status", "player_name"]

    def create(self, validated_data):
        """Create a new room with default values"""
        # player_name is used for host creation in the view, not for the room model
        data = validated_data.copy()
        data.pop("player_name", None)
        room = Room.objects.create(**data)
        return room


class PlayerCreateSerializer(serializers.ModelSerializer):
    """Serializer for players joining a room - returns player_secret on creation"""

    player_secret = serializers.UUIDField(read_only=True)
    player_name = serializers.CharField(source="name")

    class Meta:
        model = Player
        fields = ["id", "player_name", "is_spectator", "player_secret"]
        read_only_fields = ["id", "player_secret"]

    def create(self, validated_data):
        """Create a new player"""
        print(f"DEBUG PlayerCreateSerializer validated_data: {validated_data}")  # Debug
        room = self.context.get("room")
        if not room:
            raise serializers.ValidationError("Room context is required")
        player = Player.objects.create(room=room, **validated_data)
        return player


class GameStateSerializer(serializers.ModelSerializer):
    """
    Complete game state serializer that matches React frontend GameState interface.
    This transforms Room data into exact structure expected by frontend.
    """

    # Convert players dict format expected by React
    players = serializers.SerializerMethodField()
    # Get winner ID for frontend
    winner = serializers.CharField(source="winner.id", allow_null=True, read_only=True)

    class Meta:
        model = Room
        fields = [
            "id",  # This will be gameId in frontend
            "status",
            "current_round",
            "winner",
            "players",
        ]
        read_only_fields = ["id"]

    def get_players(self, obj):
        """Convert players queryset to Record<string, Player> format expected by React"""
        players_dict = {}
        for player in obj.players.all():
            # Get board data for this player
            tiles = player.tiles.all().order_by("position")

            # Convert tiles to format expected by React BoardData
            board_tiles = []
            for tile in tiles:
                tile_data = {
                    "id": str(tile.id),
                    "genre": tile.genre,
                    "status": tile.status,
                    "position": tile.position,
                }
                if tile.audio_url:
                    tile_data["audioUrl"] = tile.audio_url
                board_tiles.append(tile_data)

            # Calculate score info for players with completed tiles
            completed_tiles = [tile for tile in tiles if tile.status == "complete"]
            score_info = None

            if completed_tiles:
                from .bingo_utils import check_bingo_lines, calculate_bingo_score

                completed_lines = check_bingo_lines(board_tiles)
                if completed_lines:
                    score_info = calculate_bingo_score(player, completed_lines)

            # Structure matching React Player interface
            players_dict[str(player.id)] = {
                "id": str(player.id),
                "name": player.name,
                "avatar": player.avatar,
                "isSpectator": player.is_spectator,
                "isConnected": player.is_connected,
                "board": {"tiles": board_tiles},
                "scoreInfo": score_info,
            }

        return players_dict

    def to_representation(self, instance):
        """Transform to match React frontend GameState interface exactly"""
        data = super().to_representation(instance)
        # Rename 'id' to 'gameId' to match frontend
        data["gameId"] = data.pop("id")
        # Rename 'current_round' to 'currentRound'
        data["currentRound"] = data.pop("current_round")
        return data
