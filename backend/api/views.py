import logging
import random
from datetime import timedelta

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.db.models import Count, Min, Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.crypto import get_random_string
from rest_framework import mixins, permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import ChatMessage, CustomUser, Invitation, ListeningHistory, Membership, Playlist, Room, Track, UploadedMusic
from .serializers import (ChatMessageSerializer, CustomUserSerializer, InvitationSerializer, ListeningHistorySerializer,
                          MembershipSerializer, PlaylistSerializer, RoomSerializer, TrackSerializer,
                          UploadedMusicSerializer, UserRegistrationSerializer)
from .spotify import SpotifyService

logger = logging.getLogger(__name__)

CHAT_HISTORY_LIMIT = 100


def broadcast_queue_update(room_id):
    channel_layer = get_channel_layer()
    if channel_layer is None:
        return
    try:
        async_to_sync(channel_layer.group_send)(f'room_{room_id}', {'type': 'queue_update_broadcast'})
    except Exception:  # Broadcasting is best-effort; clients also poll.
        logger.exception('Failed to broadcast queue update for room %s', room_id)


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
    serializer_class = RoomSerializer
    permission_classes = [permissions.IsAuthenticatedOrReadOnly, IsRoomAdminOrReadOnly]

    def get_queryset(self):
        return (Room.objects.select_related('admin')
                .annotate(approved_member_count=Count('memberships', filter=Q(memberships__status='APPROVED')))
                .order_by('-created_at'))

    def perform_create(self, serializer):
        room = serializer.save(admin=self.request.user)
        Membership.objects.create(user=self.request.user, room=room, role='ADMIN', status='APPROVED')

    @action(detail=True, methods=['post'], permission_classes=[permissions.IsAuthenticated])
    def join(self, request, pk=None):
        room = self.get_object()
        membership, created = Membership.objects.get_or_create(
            user=request.user, room=room, defaults={'role': 'MEMBER', 'status': 'APPROVED'})
        return Response(MembershipSerializer(membership).data,
                        status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)


class MembershipViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = MembershipSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        qs = Membership.objects.select_related('user')
        room_id = room_id_param(self.request)
        if room_id:
            return qs.filter(room_id=room_id)
        return qs.filter(user=self.request.user)


class TrackViewSet(viewsets.ModelViewSet):
    queryset = Track.objects.all().order_by('-created_at')
    serializer_class = TrackSerializer
    permission_classes = [permissions.IsAuthenticatedOrReadOnly]

    def perform_create(self, serializer):
        serializer.save(added_by=self.request.user)


class PlaylistViewSet(viewsets.ModelViewSet):
    """A room's queue, ordered first-in first-out by `added_at`."""

    serializer_class = PlaylistSerializer
    permission_classes = [permissions.IsAuthenticatedOrReadOnly]
    http_method_names = ['get', 'post', 'delete', 'head', 'options']

    def get_queryset(self):
        qs = Playlist.objects.select_related('track').order_by('added_at', 'id')
        room_id = room_id_param(self.request)
        if room_id:
            qs = qs.filter(room_id=room_id)
        return qs

    def create(self, request, *args, **kwargs):
        data = request.data.copy()
        spotify_id = data.get('track_id')
        if spotify_id and not data.get('track'):
            # Adding a Spotify track by metadata: find or create the local Track row.
            track, _ = Track.objects.get_or_create(
                spotify_id=spotify_id,
                defaults={
                    'title': data.get('title') or 'Unknown Track',
                    'artist': data.get('artist') or 'Unknown Artist',
                    'duration': int(data.get('duration') or 0),
                    'album_art': data.get('album_art') or None,
                    'added_by': request.user,
                },
            )
            data['track'] = track.id

        serializer = self.get_serializer(data=data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        broadcast_queue_update(serializer.instance.room_id)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    def perform_destroy(self, instance):
        if instance.room.admin_id != self.request.user.id:
            raise PermissionDenied('Only the room admin can remove tracks from the queue.')
        room_id = instance.room_id
        instance.delete()
        broadcast_queue_update(room_id)

    @action(detail=True, methods=['post'])
    def move_to_top(self, request, pk=None):
        item = self.get_object()
        if item.room.admin_id != request.user.id:
            raise PermissionDenied('Only the room admin can reorder the queue.')

        earliest = Playlist.objects.filter(room_id=item.room_id).aggregate(first=Min('added_at'))['first']
        if earliest and earliest < item.added_at:
            # added_at is auto_now_add, so update() is needed to overwrite it.
            Playlist.objects.filter(pk=item.pk).update(added_at=earliest - timedelta(seconds=1))
        broadcast_queue_update(item.room_id)
        return Response({'status': 'moved to top'})


class ChatMessageViewSet(mixins.ListModelMixin, mixins.CreateModelMixin, viewsets.GenericViewSet):
    serializer_class = ChatMessageSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return ChatMessage.objects.select_related('user').order_by('timestamp')

    def list(self, request, *args, **kwargs):
        room_id = room_id_param(request)
        if not room_id:
            return Response({'error': 'room query parameter is required'}, status=status.HTTP_400_BAD_REQUEST)
        recent = list(self.get_queryset().filter(room_id=room_id).order_by('-timestamp')[:CHAT_HISTORY_LIMIT])
        recent.reverse()
        return Response(self.get_serializer(recent, many=True).data)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


class InvitationViewSet(viewsets.ModelViewSet):
    serializer_class = InvitationSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return Invitation.objects.filter(created_by=self.request.user)

    def perform_create(self, serializer):
        room = serializer.validated_data['room']
        if room.admin_id != self.request.user.id:
            raise PermissionDenied('Only the room admin can create invitations.')
        serializer.save(created_by=self.request.user, token=get_random_string(32),
                        expires_at=timezone.now() + timedelta(days=1))

    @action(detail=False, methods=['post'])
    def join(self, request):
        token = request.data.get('token')
        if not token:
            return Response({'error': 'Token is required'}, status=status.HTTP_400_BAD_REQUEST)

        invitation = Invitation.objects.filter(token=token, expires_at__gt=timezone.now()).first()
        if not invitation:
            return Response({'error': 'Invalid or expired token'}, status=status.HTTP_404_NOT_FOUND)

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


class SpotifyTransferView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        device_id = request.data.get('device_id')
        if not device_id:
            return Response({'error': 'Device ID required'}, status=status.HTTP_400_BAD_REQUEST)

        if SpotifyService(request.user).transfer_playback(device_id):
            return Response({'status': 'transferred'})
        return Response({'error': 'Failed to transfer playback'}, status=status.HTTP_502_BAD_GATEWAY)


class SpotifyPlayView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        track_id = request.data.get('track_id')
        device_id = request.data.get('device_id')
        if not track_id:
            return Response({'error': 'Track ID required'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            position_ms = max(0, int(request.data.get('position_ms') or 0)) or None
        except (TypeError, ValueError):
            position_ms = None

        track_uri = track_id if track_id.startswith('spotify:track:') else f'spotify:track:{track_id}'
        if not SpotifyService(request.user).start_playback(device_id, [track_uri], position_ms):
            return Response({'error': 'Failed to start playback. Is Spotify Premium connected and the player active?'},
                            status=status.HTTP_502_BAD_GATEWAY)

        self._record_history(request, track_uri.split(':')[-1])
        return Response({'status': 'playing'})

    def _record_history(self, request, spotify_id):
        track = Track.objects.filter(spotify_id=spotify_id).first()
        if not track and request.data.get('title'):
            track = Track.objects.create(
                spotify_id=spotify_id,
                title=request.data['title'],
                artist=request.data.get('artist') or 'Unknown Artist',
                duration=int(request.data.get('duration') or 0),
                album_art=request.data.get('album_art') or None,
                added_by=request.user,
            )
        if not track:
            return
        room_id = request.data.get('room')
        room = Room.objects.filter(id=room_id).first() if room_id else None
        ListeningHistory.objects.create(user=request.user, track=track, room=room)


class SpotifySearchView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        query = request.query_params.get('q', '').strip()
        if not query:
            return Response({'error': 'No query provided'}, status=status.HTTP_400_BAD_REQUEST)
        return Response(SpotifyService(user=request.user).search_tracks(query))


class SpotifyMoodTracksView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        mood = request.query_params.get('mood', 'happy')
        return Response(SpotifyService(request.user).get_mood_tracks(mood))


class RandomRoomView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        room_ids = list(Room.objects.values_list('id', flat=True))
        if not room_ids:
            room = Room.objects.create(name='Global Lounge', theme='PARTY',
                                       description='A room for anyone, anytime.', admin=request.user)
            Membership.objects.create(user=request.user, room=room, role='ADMIN', status='APPROVED')
            return Response({'room_id': room.id})

        room = get_object_or_404(Room, id=random.choice(room_ids))
        membership, created = Membership.objects.get_or_create(
            user=request.user, room=room, defaults={'role': 'MEMBER', 'status': 'APPROVED'})
        if not created and membership.status != 'APPROVED':
            membership.status = 'APPROVED'
            membership.save(update_fields=['status'])
        return Response({'room_id': room.id})
