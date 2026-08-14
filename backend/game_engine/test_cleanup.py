from django.views import View
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.utils.decorators import method_decorator

from game_engine.models import Player, Room, Tile, BingoClaim


@method_decorator(csrf_exempt, name='dispatch')
class TestCleanupView(View):
    """Test-only endpoint to truncate all game state before E2E runs.

    This is deliberately NOT protected by authentication — it is only
    mounted when DJANGO_SETTINGS_MODULE is settings_e2e, and even then
    only listens on 127.0.0.1 via the Daphne startup in CI.
    """

    def post(self, request):
        BingoClaim.objects.all().delete()
        Tile.objects.all().delete()
        Player.objects.all().delete()
        Room.objects.all().delete()
        return JsonResponse({"status": "cleaned"})
