from django.views import View
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.utils.decorators import method_decorator

from game_engine.models import Player, Room, Tile, BingoClaim


@method_decorator(csrf_exempt, name='dispatch')
class TestCleanupView(View):
    """Test-only endpoint to truncate all game state before E2E runs.

    SECURITY: unauthenticated by design (E2E calls it before any player
    exists) and it deletes all rows. Safety comes from ROUTING, not from
    this view: it is registered only when a settings module sets
    ALLOW_TEST_CLEANUP = True (see game_engine/urls.py). With the default
    production settings the route does not exist at all.

    Do not add authentication checks here as the primary control — that
    would break E2E. Add or tighten the routing gate instead.
    """

    def post(self, request):
        BingoClaim.objects.all().delete()
        Tile.objects.all().delete()
        Player.objects.all().delete()
        Room.objects.all().delete()
        return JsonResponse({"status": "cleaned"})
