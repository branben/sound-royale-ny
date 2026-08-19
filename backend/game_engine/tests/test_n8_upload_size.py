"""Test N8: Server must reject oversized uploads with 413 BEFORE reading the body."""
import pytest
from rest_framework.test import APIRequestFactory
from unittest.mock import patch, MagicMock


@pytest.mark.django_db
def test_upload_rejects_oversized_with_413():
    """Server must reject uploads >10MB with HTTP 413 before reading body."""
    from game_engine.views import TileViewSet
    from rest_framework.request import Request
    from django.test import RequestFactory as DjangoFactory

    django_factory = DjangoFactory()
    django_request = django_factory.post(
        "/api/tiles/1/play_tile/",
        data={"player_id": "test-id"},
        content_type="multipart/form-data",
    )
    django_request.META["CONTENT_LENGTH"] = str(11 * 1024 * 1024)

    # Wrap in DRF Request
    request = Request(django_request)
    request._full_data = {"player_id": "test-id"}

    view = TileViewSet()
    view.request = request
    view.kwargs = {"pk": "1"}

    # Mock get_object to avoid DB lookup
    with patch.object(view, "get_object") as mock_get:
        mock_tile = MagicMock()
        mock_tile.room.status = "playing"
        mock_tile.status = "empty"
        mock_tile.player_id = "test-id"
        mock_tile.genre = "hip-hop"
        mock_get.return_value = mock_tile

        response = view.play_tile(request, pk="1")

    assert response.status_code == 413, (
        f"Expected 413 (Request Entity Too Large), got {response.status_code}"
    )


@pytest.mark.django_db
def test_upload_accepts_valid_size():
    """Server must accept uploads <=10MB."""
    from game_engine.views import TileViewSet
    from rest_framework.request import Request
    from django.test import RequestFactory as DjangoFactory

    django_factory = DjangoFactory()
    django_request = django_factory.post(
        "/api/tiles/1/play_tile/",
        data={"player_id": "test-id"},
        content_type="multipart/form-data",
    )
    django_request.META["CONTENT_LENGTH"] = str(5 * 1024 * 1024)  # 5MB

    # Wrap in DRF Request
    request = Request(django_request)
    request._full_data = {"player_id": "test-id"}

    view = TileViewSet()
    view.request = request
    view.kwargs = {"pk": "1"}

    with patch.object(view, "get_object") as mock_get, \
         patch("game_engine.views.Player.objects.get") as mock_player_get:
        mock_tile = MagicMock()
        mock_tile.room.status = "playing"
        mock_tile.status = "empty"
        mock_tile.player_id = "test-id"
        mock_tile.genre = "hip-hop"
        mock_get.return_value = mock_tile
        mock_player_get.return_value = MagicMock()

        # Should not return 413
        response = view.play_tile(request, pk="1")
        assert response.status_code != 413, "5MB upload should not be rejected"
