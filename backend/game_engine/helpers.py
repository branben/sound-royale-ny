from .models import VerifiedUser
from django.db.models import Sum


def _normalize_email(email):
    return (email or "").strip().lower()


def _current_verified_user(request):
    user_id = request.session.get("verified_user_id")
    if not user_id:
        return None
    try:
        return VerifiedUser.objects.get(id=user_id)
    except VerifiedUser.DoesNotExist:
        request.session.pop("verified_user_id", None)
        return None


def _protected_display_name_owner(name):
    if not name:
        return None
    return VerifiedUser.objects.filter(display_name__iexact=name.strip()).first()


def update_verified_user_elo_cache(verified_user):
    """
    Update VerifiedUser.elo_rating cache from ledger SUM.
    Used for data integrity verification; normal updates use incremental cache in transaction.
    """
    total_delta = verified_user.elo_deltas.aggregate(Sum('delta'))['delta__sum'] or 0
    verified_user.elo_rating = 1200 + total_delta  # Baseline 1200
    verified_user.elo_wins = verified_user.elo_deltas.filter(match_result='win').count()
    verified_user.elo_losses = verified_user.elo_deltas.filter(match_result='loss').count()
    verified_user.elo_matches = verified_user.elo_deltas.count()
    verified_user.save()
