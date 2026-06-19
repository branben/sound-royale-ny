"""
ASGI config for sound_royale_api project.

It exposes the ASGI callable as a module-level variable named ``application``.

For more information on this file, see
https://docs.djangoproject.com/en/5.2/howto/deployment/asgi/
"""

import os
from django.core.asgi import get_asgi_application
from channels.routing import ProtocolTypeRouter, URLRouter
from game_engine.auth import WebSocketPlayerAuthMiddlewareStack
from game_engine.routing import websocket_urlpatterns

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'sound_royale_api.settings')

application = ProtocolTypeRouter({
    "http": get_asgi_application(),
    "websocket": WebSocketPlayerAuthMiddlewareStack(
        URLRouter(
            websocket_urlpatterns
        )
    ),
})
