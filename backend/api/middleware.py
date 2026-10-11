from urllib.parse import parse_qs

from channels.db import database_sync_to_async
from django.contrib.auth.models import AnonymousUser


@database_sync_to_async
def get_user_from_token(raw_token):
    from rest_framework_simplejwt.authentication import JWTAuthentication
    from rest_framework_simplejwt.exceptions import AuthenticationFailed, InvalidToken, TokenError

    auth = JWTAuthentication()
    try:
        validated = auth.get_validated_token(raw_token)
        return auth.get_user(validated)
    except (InvalidToken, TokenError, AuthenticationFailed):
        return AnonymousUser()


class JWTAuthMiddleware:
    """Authenticate WebSocket connections using a `?token=<jwt>` query param.

    Browsers cannot set an Authorization header on WebSocket handshakes, so the
    frontend passes its access token in the query string instead.
    """

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        query = parse_qs(scope.get('query_string', b'').decode())
        token = query.get('token', [None])[0]
        if token:
            scope['user'] = await get_user_from_token(token)
        elif 'user' not in scope:
            scope['user'] = AnonymousUser()
        return await self.app(scope, receive, send)
