import logging
from datetime import timedelta
from urllib.parse import urlencode

import requests
from django.conf import settings
from django.core import signing
from django.shortcuts import redirect
from django.utils import timezone
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import CustomUser, SpotifyToken
from .spotify import SPOTIFY_TOKEN_URL, spotify_credentials

logger = logging.getLogger(__name__)

SPOTIFY_AUTHORIZE_URL = 'https://accounts.spotify.com/authorize'
SPOTIFY_SCOPES = 'user-read-playback-state user-modify-playback-state streaming user-read-email user-read-private'
STATE_SALT = 'spotify-oauth-state'
STATE_MAX_AGE = 600  # seconds


def frontend_redirect(**params):
    return redirect(f'{settings.FRONTEND_URL}/spotify/callback?{urlencode(params)}')


class SpotifyLoginView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        client_id, _, redirect_uri = spotify_credentials()
        if not client_id:
            return Response({'error': 'Spotify is not configured on the server.'},
                            status=status.HTTP_503_SERVICE_UNAVAILABLE)

        # Signed, time-limited state so the callback can't be forged for another user.
        state = signing.dumps({'uid': request.user.id}, salt=STATE_SALT)
        url = requests.Request('GET', SPOTIFY_AUTHORIZE_URL, params={
            'scope': SPOTIFY_SCOPES,
            'response_type': 'code',
            'redirect_uri': redirect_uri,
            'client_id': client_id,
            'state': state,
        }).prepare().url
        return Response({'url': url})


class SpotifyCallbackView(APIView):
    permission_classes = [permissions.AllowAny]
    authentication_classes = []

    def get(self, request):
        if request.query_params.get('error'):
            return frontend_redirect(status='error', reason=request.query_params['error'])

        try:
            payload = signing.loads(request.query_params.get('state', ''), salt=STATE_SALT, max_age=STATE_MAX_AGE)
            user = CustomUser.objects.get(id=payload['uid'])
        except (signing.BadSignature, KeyError, CustomUser.DoesNotExist):
            return frontend_redirect(status='error', reason='invalid_state')

        code = request.query_params.get('code')
        if not code:
            return frontend_redirect(status='error', reason='missing_code')

        client_id, client_secret, redirect_uri = spotify_credentials()
        try:
            data = requests.post(SPOTIFY_TOKEN_URL, data={
                'grant_type': 'authorization_code',
                'code': code,
                'redirect_uri': redirect_uri,
                'client_id': client_id,
                'client_secret': client_secret,
            }, timeout=10).json()
        except (requests.RequestException, ValueError):
            logger.exception('Spotify token exchange failed')
            return frontend_redirect(status='error', reason='token_exchange_failed')

        access_token = data.get('access_token')
        if not access_token:
            logger.warning('Spotify token exchange returned no access token: %s', data.get('error'))
            return frontend_redirect(status='error', reason='token_exchange_failed')

        SpotifyToken.objects.update_or_create(user=user, defaults={
            'access_token': access_token,
            'refresh_token': data.get('refresh_token', ''),
            'token_type': data.get('token_type', 'Bearer'),
            'expires_at': timezone.now() + timedelta(seconds=data.get('expires_in', 3600)),
        })
        return frontend_redirect(status='success')


class SpotifyTokenRefreshView(APIView):
    """Return a valid access token for the Web Playback SDK, refreshing if needed."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        token = SpotifyToken.objects.filter(user=request.user).first()
        if not token:
            return Response({'error': 'Spotify is not connected'}, status=status.HTTP_404_NOT_FOUND)

        # Hand out the current token if it still has a few minutes left.
        if token.expires_at - timezone.now() > timedelta(minutes=5):
            return Response({'access_token': token.access_token})

        client_id, client_secret, _ = spotify_credentials()
        try:
            data = requests.post(SPOTIFY_TOKEN_URL, data={
                'grant_type': 'refresh_token',
                'refresh_token': token.refresh_token,
                'client_id': client_id,
                'client_secret': client_secret,
            }, timeout=10).json()
        except (requests.RequestException, ValueError):
            logger.exception('Spotify token refresh failed')
            data = {}

        access_token = data.get('access_token')
        if not access_token:
            return Response({'error': 'Failed to refresh Spotify token. Please reconnect Spotify.'},
                            status=status.HTTP_400_BAD_REQUEST)

        token.access_token = access_token
        if data.get('refresh_token'):
            token.refresh_token = data['refresh_token']
        token.expires_at = timezone.now() + timedelta(seconds=data.get('expires_in', 3600))
        token.save()
        return Response({'access_token': access_token})
