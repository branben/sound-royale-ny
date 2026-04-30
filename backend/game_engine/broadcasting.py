from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync
from django.utils import timezone
from django.db import transaction
from .models import Room, Tile, Round
from .serializers import GameStateSerializer
from .bingo_utils import check_bingo_lines, calculate_bingo_score, check_tie_breaker
import random
import threading
import logging

logger = logging.getLogger(__name__)

_active_timers = {}


def broadcast_game_update(room):
    """
    Helper to broadcast game state updates to the room's channel group.
    """
    channel_layer = get_channel_layer()
    serializer = GameStateSerializer(room)
    async_to_sync(channel_layer.group_send)(
        f"game_{room.code}", {"type": "game_state_update", "payload": serializer.data}
    )


def broadcast_timer_tick(room):
    """
    Broadcast a timer_tick message to the room's channel group.
    """
    channel_layer = get_channel_layer()
    current_round = Round.objects.filter(room=room).first()
    if not current_round or not current_round.timer_ends_at:
        return

    now = timezone.now()
    if current_round.timer_ends_at <= now:
        time_remaining = 0
    else:
        time_remaining = int((current_round.timer_ends_at - now).total_seconds())

    async_to_sync(channel_layer.group_send)(
        f"game_{room.code}",
        {"type": "timer_tick", "payload": {"timeRemaining": time_remaining}},
    )


def _advance_casual_round(room, current_round):
    """
    Auto-advance a casual round (< 3 spectators).
    Checks bingo for all producers and either ends the game or
    creates the next round. Tiles remain as-is — manual plays
    drive bingo progress in casual mode.
    """
    producers = room.players.filter(is_spectator=False)

    with transaction.atomic():
        # Check bingo for all producers
        bingo_winners = []
        for producer in producers:
            completed_tiles = list(
                Tile.objects.filter(player=producer, status=Tile.Status.COMPLETE)
            )
            if len(completed_tiles) >= 3:
                completed_lines = check_bingo_lines(completed_tiles)
                if completed_lines:
                    score_info = calculate_bingo_score(producer, completed_lines)
                    bingo_winners.append((producer, score_info))

        if bingo_winners:
            if len(bingo_winners) == 1:
                winner, _score = bingo_winners[0]
                room.status = Room.Status.FINISHED
                room.winner = winner
                room.save()
                broadcast_game_update(room)
                return
            else:
                # Tie-breaker among multiple bingo winners
                winner = check_tie_breaker(bingo_winners)
                if winner:
                    room.status = Room.Status.FINISHED
                    room.winner = winner
                    room.save()
                    broadcast_game_update(room)
                    return

        # No bingo — advance to next round
        used_genres = set(
            Round.objects.filter(room=room).values_list("current_tile_genre", flat=True)
        )
        available_genres = [g for g in Tile.Genre.values if g not in used_genres]
        if not available_genres:
            available_genres = list(Tile.Genre.values)

        next_genre = random.choice(available_genres)
        next_round_number = room.current_round + 1

        timer_started = timezone.now()
        timer_ends = timer_started + timezone.timedelta(seconds=60)

        new_round = Round.objects.create(
            room=room,
            round_number=next_round_number,
            current_tile_genre=next_genre,
            timer_duration=60,
            timer_started_at=timer_started,
            timer_ends_at=timer_ends,
        )
        room.current_round = next_round_number
        room.save()

    broadcast_game_update(room)
    broadcast_timer_tick(room)


def start_timer_broadcast(room_id, duration):
    """
    Start broadcasting timer ticks every second for the given room.
    Uses a daemon thread that stops when the process exits.
    """
    if room_id in _active_timers:
        existing = _active_timers[room_id]
        if existing.is_alive():
            return
        # Dead thread — clean up slot before starting new one
        _active_timers.pop(room_id, None)

    def run_timer():
        try:
            room = Room.objects.get(id=room_id)
            while True:
                import time

                time.sleep(1)
                if room.status != "playing":
                    break
                current_round = Round.objects.filter(room=room).first()
                if not current_round or not current_round.timer_ends_at:
                    break
                now = timezone.now()
                if current_round.timer_ends_at <= now and not current_round.voting_open:
                    # Only process expiry once — after voting opens the round waits for votes
                    broadcast_timer_tick(room)
                    spectator_count = room.players.filter(is_spectator=True).count()
                    if spectator_count >= 3:
                        current_round.voting_open = True
                        current_round.save()
                        broadcast_game_update(room)
                    elif spectator_count < 3:
                        # Casual mode: auto-complete tiles and advance
                        _advance_casual_round(room, current_round)
                    # Timer loop continues — next iteration picks up new round
                elif not current_round.voting_open:
                    broadcast_timer_tick(room)
        except Exception as e:
            logger.error(
                f"Error in timer thread for room {room_id}: {e}", exc_info=True
            )
        finally:
            _active_timers.pop(room_id, None)

    thread = threading.Thread(target=run_timer, daemon=True)
    thread.start()
    _active_timers[room_id] = thread
