#!/usr/bin/env python3
"""
Seed test data for E2E live backend tests.
Creates verified players, rooms, and game state.
"""
import os
import sys
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'sound_royale_api.settings_e2e')
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
django.setup()

from django.contrib.auth.models import User
from game_engine.models import Player, Room


def seed():
    """Create test data for E2E tests."""
    print("Seeding test data...")

    # Create verified players for leaderboard
    players_data = [
        {"name": "VerifiedProducer", "elo_rating": 1340, "elo_wins": 8, "elo_losses": 2, "is_discord_verified": True},
        {"name": "BeatMaster99", "elo_rating": 1280, "elo_wins": 6, "elo_losses": 3, "is_discord_verified": True},
        {"name": "SampleKing", "elo_rating": 1240, "elo_wins": 5, "elo_losses": 4, "is_discord_verified": True},
        {"name": "DrumQueen", "elo_rating": 1200, "elo_wins": 4, "elo_losses": 5, "is_discord_verified": True},
    ]

    for pdata in players_data:
        room = Room.objects.create(match_type='casual', status='finished')
        user = User.objects.create_user(
            username=f"seed_{pdata['name'].lower()}",
            password='testpass123'
        )
        Player.objects.create(
            room=room,
            user=user,
            name=pdata['name'],
            elo_rating=pdata['elo_rating'],
            elo_wins=pdata['elo_wins'],
            elo_losses=pdata['elo_losses'],
            is_discord_verified=pdata.get('is_discord_verified', False),
        )
        print(f"  Created {pdata['name']} (ELO {pdata['elo_rating']})")

    print(f"Seeded {len(players_data)} players")


if __name__ == '__main__':
    seed()
