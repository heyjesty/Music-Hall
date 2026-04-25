from rest_framework import viewsets, permissions, status
from rest_framework.response import Response
from rest_framework.decorators import action
from rest_framework.views import APIView
import random
import requests as http_requests
from django.utils.crypto import get_random_string
from django.utils import timezone
from datetime import timedelta
from .models import CustomUser, Room, Membership, Track, Playlist, ChatMessage, Invitation, ListeningHistory, UploadedMusic
from .serializers import (CustomUserSerializer, UserRegistrationSerializer, RoomSerializer, 
                          MembershipSerializer, TrackSerializer, PlaylistSerializer, 
                          ChatMessageSerializer, InvitationSerializer, ListeningHistorySerializer, UploadedMusicSerializer)
from .spotify import SpotifyService
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from rest_framework_simplejwt.tokens import RefreshToken


class GuestSessionView(APIView):
    """Passwordless guest session — create or retrieve user by username, return JWT."""
    permission_classes = [permissions.AllowAny]
    authentication_classes = []

    def post(self, request):
        username = request.data.get('username', '').strip()
        name = request.data.get('name', '').strip()
        if not username:
            return Response({'error': 'Username is required'}, status=status.HTTP_400_BAD_REQUEST)
        if not name:
            return Response({'error': 'Name is required'}, status=status.HTTP_400_BAD_REQUEST)

        # Sanitize username — only alphanumeric and underscores
        import re
        username = re.sub(r'[^\w]', '_', username)[:30]

        user, created = CustomUser.objects.get_or_create(
            username=username,
            defaults={
                'first_name': name.split()[0] if name else name,
                'last_name': ' '.join(name.split()[1:]) if len(name.split()) > 1 else '',
                'is_active': True,
            }
        )
        # Update name if user already exists
        if not created and name:
            user.first_name = name.split()[0]
            user.last_name = ' '.join(name.split()[1:]) if len(name.split()) > 1 else ''
            user.save(update_fields=['first_name', 'last_name'])

        refresh = RefreshToken.for_user(user)
        return Response({
            'access': str(refresh.access_token),
            'refresh': str(refresh),
            'user': {
                'id': user.id,
                'username': user.username,
                'name': name or user.get_full_name() or user.username,
            }
        }, status=status.HTTP_200_OK)
class UserViewSet(viewsets.ModelViewSet):
    queryset = CustomUser.objects.all()
    
    def get_serializer_class(self):
        if self.action == 'create':
            return UserRegistrationSerializer
        return CustomUserSerializer

    def get_permissions(self):
        if self.action == 'create':
            return [permissions.AllowAny()]
        return [permissions.IsAuthenticated()]

    @action(detail=False, methods=['get'])
    def me(self, request):
        serializer = self.get_serializer(request.user)
        return Response(serializer.data)

class RoomViewSet(viewsets.ModelViewSet):
    queryset = Room.objects.all()
    serializer_class = RoomSerializer
    permission_classes = [permissions.AllowAny]

    def perform_create(self, serializer):
        room = serializer.save(admin=self.request.user)
        Membership.objects.create(user=self.request.user, room=room, role='ADMIN', status='APPROVED')

class MembershipViewSet(viewsets.ModelViewSet):
    queryset = Membership.objects.all()
    serializer_class = MembershipSerializer
    permission_classes = [permissions.AllowAny]

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

class TrackViewSet(viewsets.ModelViewSet):
    queryset = Track.objects.all()
    serializer_class = TrackSerializer
    permission_classes = [permissions.AllowAny]

    def perform_create(self, serializer):
        serializer.save(added_by=self.request.user)

class PlaylistViewSet(viewsets.ModelViewSet):
    queryset = Playlist.objects.all()
    serializer_class = PlaylistSerializer
    permission_classes = [permissions.AllowAny]

    def create(self, request, *args, **kwargs):
        # Check if we're adding a free/itunes track via metadata (no 'track' FK provided)
        track_id_str = request.data.get('track_id')
        if track_id_str and not request.data.get('track'):
            # Upsert a Track row keyed by spotify_id (we reuse the field for any external id)
            track, created = Track.objects.get_or_create(
                spotify_id=str(track_id_str),
                defaults={
                    'title': request.data.get('title', 'Unknown Track'),
                    'artist': request.data.get('artist', 'Unknown Artist'),
                    'duration': request.data.get('duration', 0),
                    'album_art': request.data.get('album_art'),
                    'added_by': request.user if request.user.is_authenticated else None,
                }
            )
            data = request.data.copy()
            data['track'] = track.id
            room_id = data.get('room')
            serializer = self.get_serializer(data=data)
            serializer.is_valid(raise_exception=True)
            self.perform_create(serializer)

            # Broadcast queue update to all room members
            if room_id:
                channel_layer = get_channel_layer()
                async_to_sync(channel_layer.group_send)(
                    f'room_{room_id}',
                    {'type': 'queue_update_broadcast'}
                )

            headers = self.get_success_headers(serializer.data)
            return Response(serializer.data, status=status.HTTP_201_CREATED, headers=headers)

        # Default path (track FK already provided)
        response = super().create(request, *args, **kwargs)
        # Still broadcast queue update
        room_id = request.data.get('room')
        if room_id:
            channel_layer = get_channel_layer()
            async_to_sync(channel_layer.group_send)(
                f'room_{room_id}',
                {'type': 'queue_update_broadcast'}
            )
        return response

    @action(detail=True, methods=['post'])
    def move_to_top(self, request, pk=None):
        playlist_item = self.get_object()
        room = playlist_item.room
        # Find the current min position or just set to a very small number
        # Actually, for FIFO we use created_at, so we might need to update created_at
        from django.utils import timezone
        playlist_item.created_at = timezone.now() - timezone.timedelta(days=1) # Set to 'oldest' to be first in ASC
        playlist_item.save()
        
        # Broadcast update
        channel_layer = get_channel_layer()
        async_to_sync(channel_layer.group_send)(
            f"room_{room.id}",
            {
                "type": "queue_update_broadcast",
                "message": "Queue reordered"
            }
        )
        return Response({"status": "moved to top"})

class ChatMessageViewSet(viewsets.ModelViewSet):
    queryset = ChatMessage.objects.all()
    serializer_class = ChatMessageSerializer
    permission_classes = [permissions.AllowAny]

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

class InvitationViewSet(viewsets.ModelViewSet):
    queryset = Invitation.objects.all()
    serializer_class = InvitationSerializer
    permission_classes = [permissions.IsAuthenticated]

    def perform_create(self, serializer):
        token = get_random_string(32)
        expires_at = timezone.now() + timedelta(days=1)
        serializer.save(created_by=self.request.user, token=token, expires_at=expires_at)

    @action(detail=False, methods=['post'])
    def join(self, request):
        token = request.data.get('token')
        if not token:
            return Response({'error': 'Token is required'}, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            invitation = Invitation.objects.get(token=token, expires_at__gt=timezone.now())
        except Invitation.DoesNotExist:
            return Response({'error': 'Invalid or expired token'}, status=status.HTTP_404_NOT_FOUND)
        
        membership, created = Membership.objects.get_or_create(
            user=request.user, 
            room=invitation.room,
            defaults={'role': 'MEMBER', 'status': 'APPROVED'}
        )
        
        if not created and membership.status != 'APPROVED':
            membership.status = 'APPROVED'
            membership.save()

        return Response({'message': 'Successfully joined room', 'room_id': invitation.room.id}, status=status.HTTP_200_OK)

class ListeningHistoryViewSet(viewsets.ModelViewSet):
    queryset = ListeningHistory.objects.all()
    serializer_class = ListeningHistorySerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return self.queryset.filter(user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

class UploadedMusicViewSet(viewsets.ModelViewSet):
    queryset = UploadedMusic.objects.all()
    serializer_class = UploadedMusicSerializer
    permission_classes = [permissions.IsAuthenticated]

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

class SpotifyTransferView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        user = request.user
        device_id = request.data.get('device_id')
        if not device_id:
            return Response({"error": "Device ID required"}, status=400)
            
        sp_service = SpotifyService(user)
        success = sp_service.transfer_playback(device_id)
        if success:
            return Response({"status": "transferred"})
        return Response({"error": "Failed to transfer playback"}, status=500)

class SpotifyPlayView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        user = request.user
        track_id = request.data.get('track_id')
        device_id = request.data.get('device_id')
        
        if not track_id:
            return Response({"error": "Track ID required"}, status=400)
            
        sp_service = SpotifyService(user)
        # Check if it's a URI or ID
        track_uri = track_id if track_id.startswith('spotify:track:') else f"spotify:track:{track_id}"
        
        success = sp_service.start_playback(device_id, [track_uri])
        if success:
            return Response({"status": "playing"})
        return Response({"error": "Failed to start playback. Is your Spotify app open and active?"}, status=500)

class SpotifySearchView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        query = request.query_params.get('q', '')
        if not query:
            return Response({'error': 'No query provided'}, status=status.HTTP_400_BAD_REQUEST)
        
        service = SpotifyService(user=request.user)
        tracks = service.search_tracks(query)
        return Response(tracks)

class SpotifyMoodTracksView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        mood = request.query_params.get('mood', 'happy')
        sp_service = SpotifyService(request.user)
        results = sp_service.get_mood_tracks(mood)
        return Response(results)

class RandomRoomView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        rooms = list(Room.objects.all())
        if request.user and request.user.is_authenticated:
            if not rooms:
                room = Room.objects.create(
                    name="Global Lounge",
                    theme="PARTY",
                    description="Auto-generated Random Music Hall",
                    admin=request.user
                )
                Membership.objects.create(user=request.user, room=room, role='ADMIN', status='APPROVED')
            else:
                room = random.choice(rooms)
                membership, created = Membership.objects.get_or_create(
                    user=request.user, room=room,
                    defaults={'role': 'MEMBER', 'status': 'APPROVED'}
                )
                if not created and membership.status != 'APPROVED':
                    membership.status = 'APPROVED'
                    membership.save()
        else:
            if not rooms:
                return Response({'error': 'No rooms available'}, status=404)
            room = random.choice(rooms)
        
        return Response({'room_id': room.id})


class FreeMusicSearchView(APIView):
    permission_classes = [permissions.AllowAny]
    authentication_classes = []

    def get(self, request):
        query = request.query_params.get('q', '')
        if not query:
            return Response({'error': 'Query required'}, status=400)
        try:
            url = (
                f'https://itunes.apple.com/search'
                f'?term={query}&media=music&entity=song&limit=20'
            )
            res = http_requests.get(url, timeout=10, headers={'User-Agent': 'Mozilla/5.0'})
            data = res.json()
            tracks = []
            for item in data.get('results', []):
                preview = item.get('previewUrl', '')
                if not preview:
                    continue
                tracks.append({
                    'id': str(item.get('trackId', '')),
                    'title': item.get('trackName', 'Unknown'),
                    'artist': item.get('artistName', 'Unknown'),
                    'album': item.get('collectionName', ''),
                    'album_art': item.get('artworkUrl100', '').replace('100x100', '300x300'),
                    'preview_url': preview,
                    'duration': int(item.get('trackTimeMillis', 30000)) // 1000,
                    'source': 'itunes',
                })
            return Response(tracks)
        except Exception as e:
            return Response({'error': str(e)}, status=500)


class FreeMusicPopularView(APIView):
    permission_classes = [permissions.AllowAny]
    authentication_classes = []

    MOOD_MAP = {
        'PARTY': 'dance pop hits',
        'CHILL': 'chill relaxing',
        'STUDY': 'study focus instrumental',
        'WORKOUT': 'workout energy gym',
        'HAPPY': 'happy upbeat feel good',
        'SAD': 'sad emotional ballad',
        'ROCK': 'rock classic hits',
        'JAZZ': 'jazz smooth',
    }

    def get(self, request):
        mood = request.query_params.get('mood', 'HAPPY').upper()
        query = self.MOOD_MAP.get(mood, mood.lower())
        try:
            url = (
                f'https://itunes.apple.com/search'
                f'?term={query}&media=music&entity=song&limit=10'
            )
            res = http_requests.get(url, timeout=10, headers={'User-Agent': 'Mozilla/5.0'})
            data = res.json()
            tracks = []
            for item in data.get('results', []):
                preview = item.get('previewUrl', '')
                if not preview:
                    continue
                tracks.append({
                    'id': str(item.get('trackId', '')),
                    'title': item.get('trackName', 'Unknown'),
                    'artist': item.get('artistName', 'Unknown'),
                    'album': item.get('collectionName', ''),
                    'album_art': item.get('artworkUrl100', '').replace('100x100', '300x300'),
                    'preview_url': preview,
                    'duration': int(item.get('trackTimeMillis', 30000)) // 1000,
                    'source': 'itunes',
                })
            return Response(tracks)
        except Exception as e:
            return Response({'error': str(e)}, status=500)
