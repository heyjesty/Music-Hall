import logging
import os
from datetime import timedelta

import requests
import spotipy
from django.utils import timezone
from spotipy.cache_handler import MemoryCacheHandler
from spotipy.oauth2 import SpotifyClientCredentials

from .models import SpotifyToken

logger = logging.getLogger(__name__)

SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token'
DEFAULT_REDIRECT_URI = 'http://127.0.0.1:8000/api/spotify/callback/'

# Room themes (and a few generic moods) mapped to Spotify search queries.
MOOD_QUERIES = {
    'happy': 'happy hits',
    'sad': 'sad songs',
    'romantic': 'love songs',
    'energetic': 'workout energy',
    'calm': 'chill acoustic',
    'party': 'party dance',
    'night': 'late night chill',
    'sleep': 'sleep ambient',
    'workout': 'workout energy',
}


def spotify_credentials():
    return (
        os.environ.get('SPOTIPY_CLIENT_ID'),
        os.environ.get('SPOTIPY_CLIENT_SECRET'),
        os.environ.get('SPOTIPY_REDIRECT_URI', DEFAULT_REDIRECT_URI),
    )


def serialize_track(track):
    images = track.get('album', {}).get('images') or []
    return {
        'id': track['id'],
        'uri': track['uri'],
        'title': track['name'],
        'artist': ', '.join(artist['name'] for artist in track['artists']),
        'album_art': images[0]['url'] if images else None,
        'duration': track['duration_ms'],
    }


class SpotifyService:
    """Thin wrapper around spotipy.

    Uses the user's own OAuth token when available (needed for playback), and
    falls back to app client credentials for public catalogue search. If
    Spotify isn't configured at all, search returns demo tracks so the UI is
    still usable.
    """

    def __init__(self, user=None):
        self.user = user
        self.sp = None
        self.has_user_token = False

        if user is not None and user.is_authenticated:
            token = SpotifyToken.objects.filter(user=user).first()
            if token:
                if token.is_expired():
                    self._refresh(token)
                self.sp = spotipy.Spotify(auth=token.access_token, requests_timeout=10)
                self.has_user_token = True

        if self.sp is None:
            client_id, client_secret, _ = spotify_credentials()
            if client_id and client_secret:
                auth_manager = SpotifyClientCredentials(
                    client_id=client_id,
                    client_secret=client_secret,
                    cache_handler=MemoryCacheHandler(),  # never write tokens to disk
                )
                self.sp = spotipy.Spotify(auth_manager=auth_manager, requests_timeout=10)
            else:
                logger.info('Spotify credentials not configured; using demo tracks')

    @staticmethod
    def _refresh(token):
        client_id, client_secret, _ = spotify_credentials()
        try:
            res = requests.post(SPOTIFY_TOKEN_URL, data={
                'grant_type': 'refresh_token',
                'refresh_token': token.refresh_token,
                'client_id': client_id,
                'client_secret': client_secret,
            }, timeout=10)
        except requests.RequestException:
            logger.exception('Spotify token refresh failed')
            return
        if res.status_code != 200:
            logger.warning('Spotify token refresh rejected: %s', res.status_code)
            return
        data = res.json()
        token.access_token = data['access_token']
        if data.get('refresh_token'):
            token.refresh_token = data['refresh_token']
        token.expires_at = timezone.now() + timedelta(seconds=data.get('expires_in', 3600))
        token.save()

    # Playback (requires the user's own token and Spotify Premium)

    def transfer_playback(self, device_id):
        if not self.has_user_token:
            return False
        try:
            self.sp.transfer_playback(device_id, force_play=False)
            return True
        except spotipy.SpotifyException as e:
            logger.warning('Transfer playback failed: %s', e)
            return False

    def start_playback(self, device_id, track_uris, position_ms=None):
        if any('mock' in uri for uri in track_uris):
            return True  # Demo tracks: nothing to play on Spotify.
        if not self.has_user_token:
            return False
        try:
            self.sp.start_playback(device_id=device_id, uris=track_uris, position_ms=position_ms)
            return True
        except spotipy.SpotifyException as e:
            logger.warning('Start playback failed: %s', e)
            return False

    # Catalogue

    def search_tracks(self, query, limit=10):
        if not self.sp:
            return self._demo_tracks(query)
        try:
            results = self.sp.search(q=query, type='track', limit=limit)
            return [serialize_track(t) for t in results['tracks']['items'] if t]
        except (spotipy.SpotifyException, requests.RequestException) as e:
            logger.warning('Spotify search failed: %s', e)
            return self._demo_tracks(query)

    def get_mood_tracks(self, mood, limit=10):
        mood = (mood or 'happy').lower()
        query = MOOD_QUERIES.get(mood, mood)
        if not self.sp:
            return self._demo_tracks(mood.title())
        try:
            results = self.sp.search(q=query, type='track', limit=limit)
            return [serialize_track(t) for t in results['tracks']['items'] if t]
        except (spotipy.SpotifyException, requests.RequestException) as e:
            logger.warning('Spotify mood search failed: %s', e)
            return self._demo_tracks(mood.title())

    @staticmethod
    def _demo_tracks(label):
        art = 'https://i.scdn.co/image/ab67616d0000b2737645df1993437e6b0bfec353'
        return [
            {'id': f'mock-{i}', 'uri': f'spotify:track:mock-{i}', 'title': f'{label} Demo {i}',
             'artist': 'Music Hall', 'album_art': art, 'duration': 180000}
            for i in (1, 2, 3)
        ]
