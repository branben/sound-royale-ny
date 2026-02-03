from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import RoomViewSet, PlayerViewSet, TileViewSet

router = DefaultRouter()
router.register(r'rooms', RoomViewSet)
router.register(r'players', PlayerViewSet)
router.register(r'tiles', TileViewSet)

urlpatterns = [
    path('api/', include(router.urls)),
]