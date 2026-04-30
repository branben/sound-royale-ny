from django.core.management.base import BaseCommand
from game_engine.models import VerifiedUser


class Command(BaseCommand):
    help = 'Verify and fix ELO cache integrity by recalculating from ledger'

    def add_arguments(self, parser):
        parser.add_argument(
            '--fix',
            action='store_true',
            dest='fix',
            help='Fix discrepancies by updating cache from ledger',
        )
        parser.add_argument(
            '--user-id',
            type=str,
            help='Only check specific user by ID',
        )

    def handle(self, *args, **options):
        from game_engine.views import update_verified_user_elo_cache
        
        fix = options.get('fix', False)
        user_id = options.get('user_id')
        
        if user_id:
            users = VerifiedUser.objects.filter(id=user_id)
        else:
            users = VerifiedUser.objects.all()
        
        discrepancies = 0
        
        for user in users:
            # Calculate expected ELO from ledger
            from django.db.models import Sum
            total_delta = user.elo_deltas.aggregate(Sum('delta'))['delta__sum'] or 0
            expected_elo = 1200 + total_delta
            expected_wins = user.elo_deltas.filter(match_result='win').count()
            expected_losses = user.elo_deltas.filter(match_result='loss').count()
            expected_matches = user.elo_deltas.count()
            
            # Check for discrepancies
            has_discrepancy = (
                user.elo_rating != expected_elo or
                user.elo_wins != expected_wins or
                user.elo_losses != expected_losses or
                user.elo_matches != expected_matches
            )
            
            if has_discrepancy:
                discrepancies += 1
                self.stdout.write(
                    f'Discrepancy for {user.display_name} (ID: {user.id}):'
                )
                self.stdout.write(f'  ELO: {user.elo_rating} -> {expected_elo}')
                self.stdout.write(f'  Wins: {user.elo_wins} -> {expected_wins}')
                self.stdout.write(f'  Losses: {user.elo_losses} -> {expected_losses}')
                self.stdout.write(f'  Matches: {user.elo_matches} -> {expected_matches}')
                
                if fix:
                    update_verified_user_elo_cache(user)
                    self.stdout.write(f'  Fixed!')
                else:
                    self.stdout.write(f'  (use --fix to correct)')
        
        if discrepancies == 0:
            self.stdout.write('No discrepancies found.')
        else:
            self.stdout.write(f'Found {discrepancies} discrepancies.')
            if not fix:
                self.stdout.write('Run with --fix to correct them.')
