from django.http import JsonResponse
from django.urls import include, path
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from .spotify_auth import SpotifyCallbackView, SpotifyLoginView, SpotifyTokenRefreshView
from .views import (ChatMessageViewSet, InvitationViewSet, ListeningHistoryViewSet, MembershipViewSet,
                    PlaylistViewSet, RandomRoomView, RoomViewSet, SpotifyMoodTracksView, SpotifyPlayView,
                    SpotifySearchView, SpotifyTransferView, TrackViewSet, UploadedMusicViewSet, UserViewSet)

router = DefaultRouter()
router.register(r'users', UserViewSet, basename='user')
router.register(r'rooms', RoomViewSet, basename='room')
router.register(r'memberships', MembershipViewSet, basename='membership')
router.register(r'tracks', TrackViewSet, basename='track')
router.register(r'playlists', PlaylistViewSet, basename='playlist')
router.register(r'messages', ChatMessageViewSet, basename='message')
router.register(r'invitations', InvitationViewSet, basename='invitation')
router.register(r'history', ListeningHistoryViewSet, basename='history')
router.register(r'uploads', UploadedMusicViewSet, basename='upload')

urlpatterns = [
    path('', include(router.urls)),
    path('health/', lambda request: JsonResponse({'status': 'ok'}), name='health'),
    path('auth/login/', TokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('auth/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('spotify/search/', SpotifySearchView.as_view(), name='spotify-search'),
    path('random-room/', RandomRoomView.as_view(), name='random-room'),
    path('spotify/login/', SpotifyLoginView.as_view(), name='spotify-login'),
    path('spotify/callback/', SpotifyCallbackView.as_view(), name='spotify-callback'),
    path('spotify/refresh/', SpotifyTokenRefreshView.as_view(), name='spotify-refresh'),
    path('spotify/transfer/', SpotifyTransferView.as_view(), name='spotify-transfer'),
    path('spotify/play/', SpotifyPlayView.as_view(), name='spotify-play'),
    path('spotify/mood-tracks/', SpotifyMoodTracksView.as_view(), name='spotify-mood-tracks'),
]
