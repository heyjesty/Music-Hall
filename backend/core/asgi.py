"""
ASGI config for core project.

Serves HTTP through Django and WebSockets through Channels.
"""

import os

from django.core.asgi import get_asgi_application

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')

# Initialise Django before importing anything that touches models.
django_asgi_app = get_asgi_application()

from channels.auth import AuthMiddlewareStack  # noqa: E402
from channels.routing import ProtocolTypeRouter, URLRouter  # noqa: E402

import api.routing  # noqa: E402
from api.middleware import JWTAuthMiddleware  # noqa: E402

application = ProtocolTypeRouter({
    'http': django_asgi_app,
    'websocket': AuthMiddlewareStack(
        JWTAuthMiddleware(URLRouter(api.routing.websocket_urlpatterns))
    ),
})
