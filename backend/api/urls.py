from django.urls import path, include
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from .views import (UserViewSet, RoomViewSet, MembershipViewSet, TrackViewSet,
                    PlaylistViewSet, ChatMessageViewSet, InvitationViewSet, 
                    ListeningHistoryViewSet, UploadedMusicViewSet,
                    SpotifySearchView, RandomRoomView, SpotifyTransferView, SpotifyPlayView,
                    SpotifyMoodTracksView, FreeMusicSearchView, FreeMusicPopularView,
                    GuestSessionView)
from .spotify_auth import SpotifyLoginView, SpotifyCallbackView, SpotifyTokenRefreshView

router = DefaultRouter()
router.register(r'users', UserViewSet)
router.register(r'rooms', RoomViewSet)
router.register(r'memberships', MembershipViewSet)
router.register(r'tracks', TrackViewSet)
router.register(r'playlists', PlaylistViewSet)
router.register(r'messages', ChatMessageViewSet)
router.register(r'invitations', InvitationViewSet)
router.register(r'history', ListeningHistoryViewSet)
router.register(r'uploads', UploadedMusicViewSet)

urlpatterns = [
    path('', include(router.urls)),
    path('auth/login/', TokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('auth/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('auth/guest-session/', GuestSessionView.as_view(), name='guest-session'),
    path('spotify/search/', SpotifySearchView.as_view(), name='spotify-search'),
    path('random-room/', RandomRoomView.as_view(), name='random-room'),
    path('spotify/login/', SpotifyLoginView.as_view(), name='spotify-login'),
    path('spotify/callback/', SpotifyCallbackView.as_view(), name='spotify-callback'),
    path('spotify/refresh/', SpotifyTokenRefreshView.as_view(), name='spotify-refresh'),
    path('spotify/transfer/', SpotifyTransferView.as_view(), name='spotify-transfer'),
    path('spotify/play/', SpotifyPlayView.as_view(), name='spotify-play'),
    path('spotify/mood-tracks/', SpotifyMoodTracksView.as_view(), name='spotify-mood-tracks'),
    path('free-music/search/', FreeMusicSearchView.as_view(), name='free-music-search'),
    path('free-music/popular/', FreeMusicPopularView.as_view(), name='free-music-popular'),
]
