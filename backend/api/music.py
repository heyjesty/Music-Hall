"""Music catalogue: search and resolve playable tracks from free sources.

- Audius (https://audius.org): full-length tracks, free to stream, no API key.
- iTunes Search API: 30-second previews of mainstream songs, no API key.

Every track that ends up in a room is resolved here on the server, so clients
can only queue real catalogue items, never arbitrary URLs.
"""

import hashlib
import logging
from concurrent.futures import ThreadPoolExecutor

import requests
from django.core.cache import cache

logger = logging.getLogger(__name__)

APP_NAME = 'MusicHall'
AUDIUS_API = 'https://api.audius.co/v1'
ITUNES_API = 'https://itunes.apple.com'
PREVIEW_DURATION_MS = 30_000
TIMEOUT = 8
CACHE_SECONDS = 300

THEME_GENRES = {
    'CALM': 'Lo-Fi',
    'PARTY': 'Electronic',
    'ENERGETIC': 'Hip-Hop/Rap',
    'ROMANTIC': 'R&B/Soul',
    'SAD': 'Acoustic',
}


class TrackNotFound(Exception):
    pass


def _get_json(url, params):
    res = requests.get(url, params=params, timeout=TIMEOUT)
    res.raise_for_status()
    return res.json()


def _cached(key, fn):
    key = 'music:' + hashlib.sha1(key.encode()).hexdigest()
    value = cache.get(key)
    if value is None:
        value = fn()
        cache.set(key, value, CACHE_SECONDS)
    return value


# Audius

def _audius_playable(t):
    return (t.get('is_streamable', True) and not t.get('is_stream_gated')
            and (t.get('access') or {}).get('stream', True) and not t.get('is_delete'))


def _audius_track(t):
    artwork = t.get('artwork') or {}
    return {
        'source': 'audius',
        'external_id': t['id'],
        'title': t['title'],
        'artist': (t.get('user') or {}).get('name') or 'Unknown artist',
        'duration': int(t.get('duration') or 0) * 1000,
        'album_art': artwork.get('480x480') or artwork.get('150x150'),
        'stream_url': f'{AUDIUS_API}/tracks/{t["id"]}/stream?app_name={APP_NAME}',
        'is_preview': False,
    }


def _audius_list(path, params):
    data = _get_json(f'{AUDIUS_API}{path}', {**params, 'app_name': APP_NAME}).get('data') or []
    return [_audius_track(t) for t in data if _audius_playable(t) and t.get('duration')]


# iTunes

def _itunes_track(t):
    art = t.get('artworkUrl100')
    return {
        'source': 'itunes',
        'external_id': str(t['trackId']),
        'title': t['trackName'],
        'artist': t.get('artistName') or 'Unknown artist',
        'duration': PREVIEW_DURATION_MS,
        'album_art': art.replace('100x100bb', '600x600bb') if art else None,
        'stream_url': t['previewUrl'],
        'is_preview': True,
    }


def _itunes_search(query, limit):
    data = _get_json(f'{ITUNES_API}/search', {'term': query, 'entity': 'song', 'limit': limit})
    return [_itunes_track(t) for t in data.get('results', []) if t.get('previewUrl') and t.get('trackId')]


# Public API

def search(query, limit=12):
    """Full tracks from Audius plus previews of popular songs from iTunes."""

    def run():
        with ThreadPoolExecutor(max_workers=2) as pool:
            audius = pool.submit(_audius_list, '/tracks/search', {'query': query, 'limit': limit})
            itunes = pool.submit(_itunes_search, query, limit)
            results = []
            for future, name in ((audius, 'Audius'), (itunes, 'iTunes')):
                try:
                    results.extend(future.result())
                except (requests.RequestException, ValueError, KeyError):
                    logger.warning('%s search failed for %r', name, query, exc_info=True)
            return results

    return _cached(f'search:{query.lower()}:{limit}', run)


def suggestions(theme, limit=12):
    genre = THEME_GENRES.get((theme or '').upper(), 'Lo-Fi')

    def run():
        try:
            return _audius_list('/tracks/trending', {'genre': genre, 'limit': limit})
        except (requests.RequestException, ValueError, KeyError):
            logger.warning('Audius trending failed for %s', genre, exc_info=True)
            return []

    return _cached(f'suggest:{genre}:{limit}', run)


def resolve(source, external_id):
    """Look a track up by id and return its metadata, or raise TrackNotFound."""
    try:
        if source == 'audius':
            data = _get_json(f'{AUDIUS_API}/tracks/{external_id}', {'app_name': APP_NAME}).get('data')
            if data and _audius_playable(data) and data.get('duration'):
                return _audius_track(data)
        elif source == 'itunes':
            results = _get_json(f'{ITUNES_API}/lookup', {'id': external_id, 'entity': 'song'}).get('results', [])
            for t in results:
                if t.get('previewUrl') and str(t.get('trackId')) == str(external_id):
                    return _itunes_track(t)
    except (requests.RequestException, ValueError, KeyError):
        logger.warning('Failed to resolve %s:%s', source, external_id, exc_info=True)
    raise TrackNotFound(f'{source}:{external_id}')
