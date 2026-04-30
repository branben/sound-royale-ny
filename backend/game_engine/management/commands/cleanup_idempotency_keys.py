from django.core.management.base import BaseCommand
from django.utils import timezone
from game_engine.models import EloIdempotencyKey


class Command(BaseCommand):
    help = 'Clean up expired idempotency keys'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            dest='dry_run',
            help='Dry run: show what would be deleted without actually deleting',
        )

    def handle(self, *args, **options):
        dry_run = options.get('dry_run', False)
        
        # Find expired keys
        expired_keys = EloIdempotencyKey.objects.filter(
            expires_at__lt=timezone.now()
        )
        
        count = expired_keys.count()
        
        if dry_run:
            self.stdout.write(f'Dry run: Would delete {count} expired idempotency keys')
            for key in expired_keys[:10]:  # Show first 10
                self.stdout.write(f'  - {key.key} (expired: {key.expires_at})')
            if count > 10:
                self.stdout.write(f'  ... and {count - 10} more')
        else:
            deleted_count, _ = expired_keys.delete()
            self.stdout.write(f'Deleted {deleted_count} expired idempotency keys')
