from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import RoomViewSet, PlayerViewSet, TileViewSet
from .webhooks import LinearWebhookView

router = DefaultRouter()
router.register(r'rooms', RoomViewSet)
router.register(r'players', PlayerViewSet)
router.register(r'tiles', TileViewSet)

urlpatterns = [
    path('api/', include(router.urls)),
    path('webhooks/linear/', LinearWebhookView.as_view(), name='linear-webhook'),
]