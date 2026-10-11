import logging
import random
from datetime import timedelta

from django.db.models import Count, Q
from django.utils import timezone
from django.utils.crypto import get_random_string
from rest_framework import mixins, permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from . import music, playback
from .models import ChatMessage, CustomUser, Invitation, ListeningHistory, Membership, Room, Track, UploadedMusic
from .serializers import (ChatMessageSerializer, CustomUserSerializer, InvitationSerializer, ListeningHistorySerializer,
                          MembershipSerializer, RoomSerializer, UploadedMusicSerializer, UserRegistrationSerializer)

logger = logging.getLogger(__name__)

CHAT_HISTORY_LIMIT = 100


def room_id_param(request):
    value = request.query_params.get('room')
    return int(value) if value and value.isdigit() else None


class IsRoomAdminOrReadOnly(permissions.BasePermission):
    def has_object_permission(self, request, view, obj):
        if request.method in permissions.SAFE_METHODS:
            return True
        return obj.admin_id == request.user.id


class UserViewSet(mixins.CreateModelMixin, viewsets.GenericViewSet):
    """Registration plus the current user's own profile (`/users/me/`)."""

    queryset = CustomUser.objects.all()

    def get_serializer_class(self):
        if self.action == 'create':
            return UserRegistrationSerializer
        return CustomUserSerializer

    def get_permissions(self):
        if self.action == 'create':
            return [permissions.AllowAny()]
        return [permissions.IsAuthenticated()]

    @action(detail=False, methods=['get', 'patch'])
    def me(self, request):
        if request.method == 'PATCH':
            serializer = self.get_serializer(request.user, data=request.data, partial=True)
            serializer.is_valid(raise_exception=True)
            serializer.save()
            return Response(serializer.data)
        return Response(self.get_serializer(request.user).data)


class RoomViewSet(viewsets.ModelViewSet):
    """Rooms, plus the playback and queue controls inside a room.

    Anyone signed in can add songs. Only the room's host can play/pause, skip,
    play a song immediately, reorder or remove queued songs, or close the room.
    """

    serializer_class = RoomSerializer
    permission_classes = [permissions.IsAuthenticatedOrReadOnly, IsRoomAdminOrReadOnly]

    def get_queryset(self):
        qs = (Room.objects.select_related('admin', 'current_track')
              .annotate(approved_member_count=Count('memberships', filter=Q(memberships__status='APPROVED')))
              .order_by('-created_at'))
        if self.request.query_params.get('mine') == '1' and self.request.user.is_authenticated:
            qs = qs.filter(admin=self.request.user)
        return qs

    def perform_create(self, serializer):
        room = serializer.save(admin=self.request.user)
        Membership.objects.create(user=self.request.user, room=room, role='ADMIN', status='APPROVED')

    def perform_destroy(self, instance):
        room_id = instance.id
        instance.delete()
        playback.send_to_room(room_id, {'type': 'room_closed'})

    # Helpers

    def _room_for_member(self, request, pk):
        room = self.get_object()
        Membership.objects.get_or_create(user=request.user, room=room,
                                         defaults={'role': 'MEMBER', 'status': 'APPROVED'})
        return room

    def _require_host(self, room, request):
        if room.admin_id != request.user.id:
            raise PermissionDenied('Only the room host can do that.')

    def _track_from_request(self, request):
        source = request.data.get('source')
        external_id = str(request.data.get('external_id') or '').strip()
        if source not in dict(Track.SOURCE_CHOICES) or not external_id:
            raise ValidationError({'detail': 'A valid source and external_id are required.'})
        try:
            return playback.get_or_create_track(source, external_id, request.user)
        except music.TrackNotFound:
            raise ValidationError({'detail': 'That track is not available to play.'})

    def _state(self, room_id):
        room = Room.objects.select_related('current_track', 'current_added_by').get(id=room_id)
        return Response(playback.room_state(room))

    # Actions

    @action(detail=True, methods=['post'], permission_classes=[permissions.IsAuthenticated])
    def join(self, request, pk=None):
        room = self.get_object()
        membership, created = Membership.objects.get_or_create(
            user=request.user, room=room, defaults={'role': 'MEMBER', 'status': 'APPROVED'})
        return Response(MembershipSerializer(membership).data,
                        status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)

    @action(detail=True, methods=['get'], permission_classes=[permissions.IsAuthenticated])
    def state(self, request, pk=None):
        room = self.get_object()
        playback.advance_if_finished(room.id)
        return self._state(room.id)

    @action(detail=True, methods=['post'], url_path='queue', permission_classes=[permissions.IsAuthenticated])
    def add_to_queue(self, request, pk=None):
        room = self._room_for_member(request, pk)
        track = self._track_from_request(request)
        playback.add_to_queue(room.id, track, request.user)
        return self._state(room.id)

    @action(detail=True, methods=['delete'], url_path=r'queue/(?P<item_id>\d+)',
            permission_classes=[permissions.IsAuthenticated])
    def remove_from_queue(self, request, pk=None, item_id=None):
        room = self.get_object()
        self._require_host(room, request)
        if not playback.remove_from_queue(room.id, int(item_id)):
            return Response({'detail': 'Not in the queue.'}, status=status.HTTP_404_NOT_FOUND)
        return self._state(room.id)

    @action(detail=True, methods=['post'], url_path=r'queue/(?P<item_id>\d+)/top',
            permission_classes=[permissions.IsAuthenticated])
    def move_to_top(self, request, pk=None, item_id=None):
        room = self.get_object()
        self._require_host(room, request)
        if not playback.move_to_top(room.id, int(item_id)):
            return Response({'detail': 'Not in the queue.'}, status=status.HTTP_404_NOT_FOUND)
        return self._state(room.id)

    @action(detail=True, methods=['post'], url_path='play-now', permission_classes=[permissions.IsAuthenticated])
    def play_now(self, request, pk=None):
        room = self.get_object()
        self._require_host(room, request)
        track = self._track_from_request(request)
        playback.play_now(room.id, track, request.user)
        return self._state(room.id)

    @action(detail=True, methods=['post'], url_path='playback', permission_classes=[permissions.IsAuthenticated])
    def control_playback(self, request, pk=None):
        room = self.get_object()
        self._require_host(room, request)
        command = request.data.get('action')
        if command == 'play':
            playback.set_playing(room.id, True)
        elif command == 'pause':
            playback.set_playing(room.id, False)
        elif command == 'skip':
            playback.skip(room.id)
        else:
            raise ValidationError({'detail': "action must be 'play', 'pause' or 'skip'."})
        return self._state(room.id)


class MembershipViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = MembershipSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        qs = Membership.objects.select_related('user')
        room_id = room_id_param(self.request)
        if room_id:
            return qs.filter(room_id=room_id)
        return qs.filter(user=self.request.user)


class ChatMessageViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    """Recent chat history for a room. New messages are sent over the WebSocket."""

    serializer_class = ChatMessageSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return ChatMessage.objects.select_related('user')

    def list(self, request, *args, **kwargs):
        room_id = room_id_param(request)
        if not room_id:
            return Response({'detail': 'room query parameter is required'}, status=status.HTTP_400_BAD_REQUEST)
        recent = list(self.get_queryset().filter(room_id=room_id).order_by('-timestamp', '-id')[:CHAT_HISTORY_LIMIT])
        recent.reverse()
        return Response(self.get_serializer(recent, many=True).data)


class InvitationViewSet(viewsets.ModelViewSet):
    serializer_class = InvitationSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return Invitation.objects.filter(created_by=self.request.user)

    def perform_create(self, serializer):
        room = serializer.validated_data['room']
        if room.admin_id != self.request.user.id:
            raise PermissionDenied('Only the room host can create invitations.')
        serializer.save(created_by=self.request.user, token=get_random_string(32),
                        expires_at=timezone.now() + timedelta(days=1))

    @action(detail=False, methods=['post'])
    def join(self, request):
        token = request.data.get('token')
        if not token:
            return Response({'detail': 'Token is required'}, status=status.HTTP_400_BAD_REQUEST)

        invitation = Invitation.objects.filter(token=token, expires_at__gt=timezone.now()).first()
        if not invitation:
            return Response({'detail': 'Invalid or expired token'}, status=status.HTTP_404_NOT_FOUND)

        membership, created = Membership.objects.get_or_create(
            user=request.user, room=invitation.room, defaults={'role': 'MEMBER', 'status': 'APPROVED'})
        if not created and membership.status != 'APPROVED':
            membership.status = 'APPROVED'
            membership.save(update_fields=['status'])

        return Response({'message': 'Successfully joined room', 'room_id': invitation.room_id})


class ListeningHistoryViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = ListeningHistorySerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return (ListeningHistory.objects.filter(user=self.request.user)
                .select_related('track').order_by('-timestamp')[:50])


class UploadedMusicViewSet(viewsets.ModelViewSet):
    serializer_class = UploadedMusicSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return UploadedMusic.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


class MusicSearchView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        query = request.query_params.get('q', '').strip()
        if not query:
            return Response({'detail': 'No query provided'}, status=status.HTTP_400_BAD_REQUEST)
        return Response(music.search(query[:100]))


class MusicSuggestionsView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        return Response(music.suggestions(request.query_params.get('theme', 'CALM')))


class RandomRoomView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        room_ids = list(Room.objects.values_list('id', flat=True))
        if not room_ids:
            room = Room.objects.create(name='Global Lounge', theme='PARTY',
                                       description='A room for anyone, anytime.', admin=request.user)
            Membership.objects.create(user=request.user, room=room, role='ADMIN', status='APPROVED')
            return Response({'room_id': room.id})
        return Response({'room_id': random.choice(room_ids)})
