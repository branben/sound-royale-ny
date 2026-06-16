from django.db import IntegrityError
from django.db.models import Prefetch
from rest_framework import serializers
from .models import Room, Player, Tile, Round, Vote, ThemeRotation


class TileSerializer(serializers.ModelSerializer):
    """Serializer for Tile model - matches React frontend Tile interface"""

    class Meta:
        model = Tile
        fields = ["id", "genre", "status", "audio_url", "position"]
        read_only_fields = ["id"]


class TileCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating tiles with comprehensive validation"""

    room = serializers.PrimaryKeyRelatedField(
        queryset=Room.objects.all(), required=False
    )

    class Meta:
        model = Tile
        fields = ["genre", "position", "player", "room"]
    
    def validate(self, attrs):
        """
        Comprehensive validation for tile creation
        """
        player = attrs['player']
        position = attrs['position']
        genre = attrs['genre']
        room = attrs.get('room', player.room)
        if not room:
            raise serializers.ValidationError("room is required when player has no room")
        attrs['room'] = room
        
        # Validation 1: Position must be within valid range (0-8)
        if not 0 <= position <= 8:
            raise serializers.ValidationError(
                f"Position {position} is invalid. Must be between 0 and 8."
            )
        
        # Validation 2: Check for duplicate position in same room
        existing_tile = Tile.objects.filter(
            player__room=room, 
            position=position
        ).first()
        
        if existing_tile:
            raise serializers.ValidationError(
                f"Position {position} is already occupied in this room by {existing_tile.player.name}."
            )
        
        # Validation 3: Check genre uniqueness for this player
        used_genres = Tile.objects.filter(
            player=player
        ).values_list('genre', flat=True)
        
        if genre in used_genres:
            raise serializers.ValidationError(
                f"Genre '{genre}' is already used by player {player.name}. Each player can only use each genre once."
            )
        
        # Validation 4: Ensure genre is valid
        valid_genres = [choice[0] for choice in Tile.Genre.choices]
        if genre not in valid_genres:
            raise serializers.ValidationError(
                f"Invalid genre '{genre}'. Valid genres are: {', '.join(valid_genres)}."
            )
        
        # Validation 5: Player must not be a spectator
        if player.is_spectator:
            raise serializers.ValidationError(
                f"Spectators cannot have tiles. Player {player.name} is a spectator."
            )
        
        # Validation 6: Room must be in appropriate state for tile creation
        if room.status not in [Room.Status.LOBBY, Room.Status.PLAYING]:
            raise serializers.ValidationError(
                f"Cannot create tiles in room with status '{room.status}'. Room must be in LOBBY or PLAYING state."
            )
        
        return attrs
    
    def create(self, validated_data):
        """
        Create tile with proper error handling
        """
        try:
            tile = Tile.objects.create(**validated_data)
            return tile
        except IntegrityError as e:
            if "NOT NULL constraint failed" in str(e):
                # Check which required field is missing
                required_fields = ['player', 'position', 'genre']
                missing_fields = []
                
                for field in required_fields:
                    if field not in validated_data or validated_data[field] is None:
                        missing_fields.append(field)
                
                if missing_fields:
                    raise serializers.ValidationError(
                        f"Missing required fields: {', '.join(missing_fields)}"
                    )
                else:
                    raise serializers.ValidationError(
                        "Database constraint violation. Check all required fields."
                    )
            elif "UNIQUE constraint failed" in str(e):
                raise serializers.ValidationError(
                    "This tile already exists or violates uniqueness constraints."
                )
            else:
                # Re-raise unknown database errors
                raise serializers.ValidationError(
                    "Failed to create tile due to database constraint violation."
                )


class VoteSerializer(serializers.ModelSerializer):
    """Serializer for Vote model"""

    voter_name = serializers.CharField(source="voter.name", read_only=True)
    voted_for_name = serializers.CharField(source="voted_for.name", read_only=True)

    class Meta:
        model = Vote
        fields = [
            "id",
            "round",
            "voter",
            "voter_name",
            "voted_for",
            "voted_for_name",
            "created_at",
        ]
        read_only_fields = ["id", "created_at"]


class RoundSerializer(serializers.ModelSerializer):
    """Serializer for Round model"""

    votes = VoteSerializer(many=True, read_only=True)
    winner_name = serializers.CharField(
        source="winner.name", read_only=True, allow_null=True
    )

    class Meta:
        model = Round
        fields = [
            "id",
            "room",
            "round_number",
            "current_tile_genre",
            "timer_duration",
            "timer_started_at",
            "timer_ends_at",
            "voting_open",
            "votes_recorded",
            "winner",
            "winner_name",
            "votes",
            "created_at",
        ]
        read_only_fields = ["id", "created_at"]


class PlayerSerializer(serializers.ModelSerializer):
    """Serializer for Player model - matches React frontend Player interface"""

    # Nested tiles serializer to include board data
    tiles = TileSerializer(many=True, read_only=True)
    scoreInfo = serializers.SerializerMethodField()
    current_title = serializers.CharField(read_only=True)
    is_discord_verified = serializers.SerializerMethodField()
    discord_username = serializers.SerializerMethodField()
    discord_avatar_url = serializers.SerializerMethodField()

    class Meta:
        model = Player
        fields = [
            "id",
            "name",
            "avatar",
            "room",
            "is_spectator",
            "is_host",
            "is_connected",
            "is_ready",
            "joined_at",
            "tiles",
            "elo_rating",
            "elo_wins",
            "elo_losses",
            "elo_matches",
            "is_checked_in",
            "earned_jackpot",
            "earned_sweeper",
            "current_title",
            "is_discord_verified",
            "discord_username",
            "discord_avatar_url",
            "scoreInfo",
        ]
        read_only_fields = [
            "id",
            "joined_at",
            "is_connected",
            "elo_rating",
            "elo_wins",
            "elo_losses",
            "elo_matches",
            "earned_jackpot",
            "earned_sweeper",
            "current_title",
            "is_discord_verified",
            "discord_username",
            "discord_avatar_url",
        ]

    def get_is_discord_verified(self, obj):
        return obj.discord_identity_id is not None

    def get_discord_username(self, obj):
        if not obj.discord_identity:
            return None
        return obj.discord_identity.discord_username

    def get_discord_avatar_url(self, obj):
        if not obj.discord_identity:
            return None
        return obj.discord_identity.discord_avatar_url

    def get_scoreInfo(self, obj):
        completed_tiles = [
            tile for tile in obj.tiles.all().order_by("position")
            if tile.status == Tile.Status.COMPLETE
        ]
        if not completed_tiles:
            return None

        from .bingo_utils import check_bingo_lines, calculate_bingo_score

        completed_lines = check_bingo_lines(completed_tiles)
        if not completed_lines:
            return None

        return calculate_bingo_score(obj, completed_lines)


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
        fields = ["id", "code", "name", "status", "player_name", "theme", "custom_genres", "total_rounds"]

    def create(self, validated_data):
        """Create a new room with default values"""
        # player_name is used for host creation in the view, not for the room model
        data = validated_data.copy()
        data.pop("player_name", None)
        room = Room.objects.create(**data)
        return room


class ThemeRotationSerializer(serializers.ModelSerializer):
    """Serializer for editable public theme rotations."""

    class Meta:
        model = ThemeRotation
        fields = ["key", "name", "description", "genres", "created_at", "updated_at"]
        read_only_fields = ["key", "created_at", "updated_at"]

    def validate_genres(self, value):
        if not isinstance(value, list):
            raise serializers.ValidationError("Genres must be a list")
        cleaned = [str(genre).strip() for genre in value if str(genre).strip()]
        if len(cleaned) != 9:
            raise serializers.ValidationError("Exactly 9 genres are required")
        if len(set(genre.lower() for genre in cleaned)) != 9:
            raise serializers.ValidationError("Genres must be unique")
        return cleaned

    def validate_description(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Description is required")
        return value

    def validate_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Name is required")
        return value


class PlayerCreateSerializer(serializers.ModelSerializer):
    """Serializer for players joining a room - returns player_secret on creation"""

    player_secret = serializers.UUIDField(read_only=True)
    name = serializers.CharField()

    class Meta:
        model = Player
        fields = ["id", "name", "is_spectator", "is_host", "player_secret"]
        read_only_fields = ["id", "player_secret", "is_host"]

    def create(self, validated_data):
        """Create a new player"""
        room = self.context.get("room")
        if not room:
            raise serializers.ValidationError("Room context is required")
        player = Player.objects.create(room=room, **validated_data)
        return player


class GenrePerformanceSerializer(serializers.Serializer):
    """Serializer for genre performance data with FIFA-style grades"""

    genre = serializers.CharField()
    wins = serializers.IntegerField()
    total_rounds = serializers.IntegerField()
    win_rate = serializers.FloatField()
    grade = serializers.CharField()
    is_legacy = serializers.BooleanField(required=False, default=False)


class GameStateSerializer(serializers.ModelSerializer):
    """
    Complete game state serializer that matches React frontend GameState interface.
    This transforms Room data into exact structure expected by frontend.
    """

    # Convert players dict format expected by React
    players = serializers.SerializerMethodField()
    # Get winner ID for frontend
    winner = serializers.CharField(source="winner.id", allow_null=True, read_only=True)
    # Include current round state
    round_state = serializers.SerializerMethodField()
    # Include spectator count
    spectator_count = serializers.SerializerMethodField()

    class Meta:
        model = Room
        fields = [
            "id",  # This will be gameId in frontend
            "status",
            "current_round",
            "winner",
            "players",
            "round_state",
            "spectator_count",
        ]
        read_only_fields = ["id"]

    def get_round_state(self, obj):
        """Get the current round state for the room"""
        current_round = Round.objects.filter(
            room=obj,
            round_number=obj.current_round,
        ).first()
        if not current_round:
            return None

        votes_list = []
        for vote in current_round.votes.select_related("voter", "voted_for").all():
            votes_list.append(
                {
                    "id": str(vote.id),
                    "voter": str(vote.voter.id),
                    "voterName": vote.voter.name,
                    "votedFor": str(vote.voted_for.id),
                    "votedForName": vote.voted_for.name,
                }
            )

        return {
            "roundNumber": current_round.round_number,
            "currentTileGenre": current_round.current_tile_genre,
            "timerDuration": current_round.timer_duration,
            "timerEndsAt": current_round.timer_ends_at.isoformat()
            if current_round.timer_ends_at
            else None,
            "votingOpen": current_round.voting_open,
            "votesRecorded": current_round.votes_recorded,
            "votes": votes_list,
            "winner": str(current_round.winner.id) if current_round.winner else None,
        }

    def get_spectator_count(self, obj):
        """Get the count of spectators in the room"""
        return obj.players.filter(is_spectator=True).count()

    def get_players(self, obj):
        """Convert players queryset to Record<string, Player> format expected by React"""
        players_dict = {}
        players_qs = obj.players.all().prefetch_related(
            Prefetch("tiles", queryset=Tile.objects.order_by("position"))
        )
        for player in players_qs:
            tiles = player.tiles.all()

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
                "isDiscordVerified": player.discord_identity_id is not None,
                "discordUsername": player.discord_identity.discord_username if player.discord_identity else None,
                "discordAvatarUrl": player.discord_identity.discord_avatar_url if player.discord_identity else None,
                "isSpectator": player.is_spectator,
                "isHost": player.is_host,
                "isConnected": player.is_connected,
                "isReady": player.is_ready,
                "eloRating": player.elo_rating,
                "eloWins": player.elo_wins,
                "eloLosses": player.elo_losses,
                "eloMatches": player.elo_matches,
                "isCheckedIn": player.is_checked_in,
                "currentTitle": player.current_title,
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
        # Rename 'round_state' to 'roundState'
        data["roundState"] = data.pop("round_state")
        # Rename 'spectator_count' to 'spectatorCount'
        data["spectatorCount"] = data.pop("spectator_count")
        return data
