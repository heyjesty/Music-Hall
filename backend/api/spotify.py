import os
import spotipy
import requests
from django.utils import timezone
from .models import SpotifyToken

def load_env_file(path='.env'):
    if os.path.exists(path):
        with open(path, 'r') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#'):
                    key, value = line.split('=', 1)
                    os.environ[key.strip()] = value.strip()

# Load backend/.env if it exists
load_env_file(os.path.join(os.path.dirname(os.path.dirname(__file__)), '.env'))

class SpotifyService:
    def __init__(self, user=None):
        self.user = user
        self.is_mock = True
        self.sp = None
        
        print(f"DEBUG: Initializing SpotifyService for user: {user}")
        
        if user and user.is_authenticated:
            token = SpotifyToken.objects.filter(user=user).first()
            if token:
                print(f"DEBUG: Found SpotifyToken for user {user.username}")
                if token.is_expired():
                    print("DEBUG: Token is expired, attempting refresh...")
                    try:
                        payload = {
                            'grant_type': 'refresh_token',
                            'refresh_token': token.refresh_token,
                            'client_id': os.environ.get('SPOTIPY_CLIENT_ID'),
                            'client_secret': os.environ.get('SPOTIPY_CLIENT_SECRET'),
                        }
                        res = requests.post('https://accounts.spotify.com/api/token', data=payload)
                        if res.status_code == 200:
                            data = res.json()
                            token.access_token = data.get('access_token')
                            if data.get('refresh_token'):
                                token.refresh_token = data.get('refresh_token')
                            token.expires_at = timezone.now() + timezone.timedelta(seconds=data.get('expires_in', 3600))
                            token.save()
                            print("DEBUG: Token refreshed successfully")
                        else:
                            print(f"DEBUG: Refresh failed: {res.text}")
                    except Exception as e:
                        print(f"DEBUG: Refresh error: {e}")
                
                try:
                    self.sp = spotipy.Spotify(auth=token.access_token)
                    # Test connection
                    self.sp.current_user()
                    self.is_mock = False
                    print("DEBUG: Spotify client initialized with user token")
                except Exception as e:
                    print(f"DEBUG: User token failed: {e}")
                    self.sp = None
        
        # Fallback to client credentials for public search if no user token or user token failed
        if not self.sp:
            client_id = os.environ.get('SPOTIPY_CLIENT_ID')
            client_secret = os.environ.get('SPOTIPY_CLIENT_SECRET')
            print(f"DEBUG: Falling back to client credentials. ID present: {bool(client_id)}")
            if client_id and client_secret:
                try:
                    from spotipy.oauth2 import SpotifyClientCredentials
                    auth_manager = SpotifyClientCredentials(client_id=client_id, client_secret=client_secret)
                    self.sp = spotipy.Spotify(auth_manager=auth_manager)
                    self.is_mock = False
                    print("DEBUG: Spotify client initialized with client credentials")
                except Exception as e:
                    print(f"DEBUG: Client credentials failed: {e}")
            else:
                print("DEBUG: Missing SPOTIPY_CLIENT_ID or SPOTIPY_CLIENT_SECRET")

    def transfer_playback(self, device_id):
        if self.is_mock or not self.sp:
            return False
        try:
            self.sp.transfer_playback(device_id, force_play=True)
            return True
        except Exception as e:
            print(f"DEBUG: Transfer playback failed: {e}")
            return False

    def start_playback(self, device_id, track_uris=None):
        # Handle mock tracks
        if any("mock" in uri for uri in (track_uris or [])):
            print(f"DEBUG: Simulating playback for mock tracks: {track_uris}")
            return True

        if not self.sp:
            print("DEBUG: Playback failed - no Spotify client initialized")
            return False

        try:
            print(f"DEBUG: Starting playback on device {device_id} for {track_uris}")
            # Ensure URIs are correct
            self.sp.start_playback(device_id=device_id, uris=track_uris)
            return True
        except Exception as e:
            print(f"DEBUG: Play track failed: {e}")
            return False

    def search_tracks(self, query, limit=10):
        if not self.sp:
            return self._get_mock_search_results(query)
        
        try:
            print(f"DEBUG: Searching Spotify for: {query}")
            results = self.sp.search(q=query, type='track', limit=limit)
            tracks = []
            for track in results['tracks']['items']:
                tracks.append({
                    "id": track['id'],
                    "uri": track['uri'],
                    "title": track['name'],
                    "artist": ", ".join([artist['name'] for artist in track['artists']]),
                    "album_art": track['album']['images'][0]['url'] if track['album']['images'] else None,
                    "duration": track['duration_ms']
                })
            print(f"DEBUG: Found {len(tracks)} tracks")
            return tracks
        except Exception as e:
            print(f"DEBUG: Spotify Search error: {e}")
            return self._get_mock_search_results(query)

    def _get_mock_search_results(self, query):
        return [
            {"id": "mock1", "uri": "spotify:track:0VjIj9STC1uCfIpIenY9oR", "title": f"Mock: {query} Mix", "artist": "Miki Matsubara", "album_art": "https://i.scdn.co/image/ab67616d0000b2737645df1993437e6b0bfec353", "duration": 312000},
            {"id": "mock2", "uri": "spotify:track:4cOdK9w7Zp7Yv3vc9nuYdy", "title": f"Mock: {query} Vibe", "artist": "The Weeknd", "album_art": "https://i.scdn.co/image/ab67616d0000b273c5649addda9f0dac29cff191", "duration": 200000},
        ]

    def get_track_details(self, track_id):
        if not self.sp or track_id.startswith('mock'):
            return {
                "id": track_id,
                "uri": f"spotify:track:{track_id}",
                "title": f"Simulated: {track_id}",
                "artist": "Mock Artist",
                "album_art": "https://i.scdn.co/image/ab67616d0000b2737645df1993437e6b0bfec353",
                "duration": 180000
            }
        
        try:
            track = self.sp.track(track_id)
            return {
                "id": track['id'],
                "uri": track['uri'],
                "title": track['name'],
                "artist": ", ".join([artist['name'] for artist in track['artists']]),
                "album_art": track['album']['images'][0]['url'] if track['album']['images'] else None,
                "duration": track['duration_ms']
            }
        except Exception as e:
            print(f"DEBUG: Spotify Track info error: {e}")
            return None

    def get_mood_tracks(self, mood, limit=10):
        if not self.sp:
            return self._get_mock_mood_tracks(mood)
        
        # Mapping music categories or just searching by keyword
        mood_queries = {
            'happy': 'genre:pop happy',
            'sad': 'genre:acoustic sad',
            'night': 'genre:chill night',
            'sleep': 'genre:ambient sleep',
            'party': 'genre:dance party',
            'workout': 'genre:rock workout'
        }
        
        query = mood_queries.get(mood.lower(), mood)
        try:
            print(f"DEBUG: Mood fetch for: {mood} (query: {query})")
            results = self.sp.search(q=query, type='track', limit=limit)
            tracks = []
            for track in results['tracks']['items']:
                tracks.append({
                    "id": track['id'],
                    "uri": track['uri'],
                    "title": track['name'],
                    "artist": ", ".join([artist['name'] for artist in track['artists']]),
                    "album_art": track['album']['images'][0]['url'] if track['album']['images'] else None,
                    "duration": track['duration_ms']
                })
            print(f"DEBUG: Found {len(tracks)} mood tracks")
            return tracks
        except Exception as e:
            print(f"DEBUG: Spotify Mood Discovery error: {e}")
            return self._get_mock_mood_tracks(mood)

    def _get_mock_mood_tracks(self, mood):
        mood = mood.lower()
        famous_tracks = {
            'happy': [
                {"id": "mock-h1", "uri": "spotify:track:60Sdxu7pIbkEiiPb06mGqb", "title": "Happy", "artist": "Pharrell Williams", "album_art": "https://i.scdn.co/image/ab67616d0000b27339798ca9647244910243454b", "duration": 232000},
                {"id": "mock-h2", "uri": "spotify:track:1W85uXn0R8QjQ7O6p7sS5s", "title": "Can't Stop the Feeling!", "artist": "Justin Timberlake", "album_art": "https://i.scdn.co/image/ab67616d0000b27376c944f6f1f33f67566270b2", "duration": 236000}
            ],
            'sad': [
                {"id": "mock-s1", "uri": "spotify:track:6habFovpe7vVn2u6RM069T", "title": "Someone Like You", "artist": "Adele", "album_art": "https://i.scdn.co/image/ab67616d0000b2732115abe64e434685f09628d0", "duration": 285000},
                {"id": "mock-s2", "uri": "spotify:track:7fBv71oPcfXNOqN9vS9qXj", "title": "Fix You", "artist": "Coldplay", "album_art": "https://i.scdn.co/image/ab67616d0000b27390df03772242004245c36398", "duration": 295000}
            ],
            'night': [
                {"id": "mock-n1", "uri": "spotify:track:7MXVkv9YFBvUExS6S0S0S0", "title": "Starboy", "artist": "The Weeknd", "album_art": "https://i.scdn.co/image/ab67616d0000b2734718e2b124f79258be6504c0", "duration": 230000},
                {"id": "mock-n2", "uri": "spotify:track:0VjIj9STC1uCfIpIenY9oR", "title": "Stay With Me", "artist": "Miki Matsubara", "album_art": "https://i.scdn.co/image/ab67616d0000b2737645df1993437e6b0bfec353", "duration": 312000}
            ],
            'party': [
                {"id": "mock-p1", "uri": "spotify:track:49C9L4W7Zp7Yv3vc9nuYdy", "title": "Levitating", "artist": "Dua Lipa", "album_art": "https://i.scdn.co/image/ab67616d0000b273bd3f9d3787b66aa0989042e7", "duration": 203000},
                {"id": "mock-p2", "uri": "spotify:track:37Zws6p0LpYpY8O6vAsR0O", "title": "Nightcall", "artist": "Kavinsky", "album_art": "https://i.scdn.co/image/ab67616d0000b2737a6b2edc764e590412b5962f", "duration": 258000}
            ],
            'workout': [
                {"id": "mock-w1", "uri": "spotify:track:57XjqcCf8pB6E0p1S6S0S0", "title": "Till I Collapse", "artist": "Eminem", "album_art": "https://i.scdn.co/image/ab67616d0000b2736ca5c90113f30c5717646736", "duration": 297000},
                {"id": "mock-w2", "uri": "spotify:track:27Zws6p0LpYpY8O6vAsR0O", "title": "Eye of the Tiger", "artist": "Survivor", "album_art": "https://i.scdn.co/image/ab67616d0000b2736ca5c90113f30c5717646736", "duration": 245000}
            ]
        }
        
        return famous_tracks.get(mood, [
            {"id": "mock-def1", "uri": "spotify:track:mock1", "title": "General Vibe 1", "artist": "Music Hall Artist", "album_art": "https://i.scdn.co/image/ab67616d0000b2737645df1993437e6b0bfec353", "duration": 180000},
            {"id": "mock-def2", "uri": "spotify:track:mock2", "title": "General Vibe 2", "artist": "Music Hall Artist", "album_art": "https://i.scdn.co/image/ab67616d0000b2737645df1993437e6b0bfec353", "duration": 180000},
        ])
