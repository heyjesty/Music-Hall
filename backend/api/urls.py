from django.http import JsonResponse
from django.urls import include, path
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from .views import (ChatMessageViewSet, InvitationViewSet, ListeningHistoryViewSet, MembershipViewSet,
                    MusicSearchView, MusicSuggestionsView, RandomRoomView, RoomViewSet, UploadedMusicViewSet,
                    UserViewSet)

router = DefaultRouter()
router.register(r'users', UserViewSet, basename='user')
router.register(r'rooms', RoomViewSet, basename='room')
router.register(r'memberships', MembershipViewSet, basename='membership')
router.register(r'messages', ChatMessageViewSet, basename='message')
router.register(r'invitations', InvitationViewSet, basename='invitation')
router.register(r'history', ListeningHistoryViewSet, basename='history')
router.register(r'uploads', UploadedMusicViewSet, basename='upload')

urlpatterns = [
    path('', include(router.urls)),
    path('health/', lambda request: JsonResponse({'status': 'ok'}), name='health'),
    path('auth/login/', TokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('auth/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('music/search/', MusicSearchView.as_view(), name='music-search'),
    path('music/suggestions/', MusicSuggestionsView.as_view(), name='music-suggestions'),
    path('random-room/', RandomRoomView.as_view(), name='random-room'),
]
