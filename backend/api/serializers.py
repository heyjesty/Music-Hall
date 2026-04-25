from rest_framework import serializers
from .models import CustomUser, Room, Membership, Track, Playlist, ChatMessage, Invitation, ListeningHistory, UploadedMusic, SpotifyToken

class CustomUserSerializer(serializers.ModelSerializer):
    is_spotify_connected = serializers.SerializerMethodField()

    class Meta:
        model = CustomUser
        fields = ('id', 'username', 'email', 'first_name', 'last_name', 'profile_photo', 'music_preferences', 'is_spotify_connected')

    def get_is_spotify_connected(self, obj):
        return hasattr(obj, 'spotify_token')

class SpotifyTokenSerializer(serializers.ModelSerializer):
    class Meta:
        model = SpotifyToken
        fields = ('access_token', 'refresh_token', 'expires_at', 'token_type')

class UserRegistrationSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True)

    class Meta:
        model = CustomUser
        fields = ('id', 'username', 'email', 'password', 'first_name', 'last_name')

    def create(self, validated_data):
        user = CustomUser.objects.create_user(**validated_data)
        return user

# MembershipSerializer must be declared BEFORE RoomSerializer which nests it
class MembershipSerializer(serializers.ModelSerializer):
    user_detail = CustomUserSerializer(source='user', read_only=True)

    class Meta:
        model = Membership
        fields = ('id', 'user', 'user_detail', 'room', 'role', 'status', 'joined_at')
        read_only_fields = ('user',)

class RoomSerializer(serializers.ModelSerializer):
    admin_detail = CustomUserSerializer(source='admin', read_only=True)
    memberships = MembershipSerializer(many=True, read_only=True)

    class Meta:
        model = Room
        fields = ('id', 'name', 'theme', 'description', 'admin', 'admin_detail',
                  'memberships', 'current_track_id', 'is_playing', 'timestamp_ms',
                  'last_sync_time', 'created_at')
        read_only_fields = ('admin',)

class TrackSerializer(serializers.ModelSerializer):
    class Meta:
        model = Track
        fields = ('id', 'title', 'artist', 'duration', 'source_url', 'spotify_id', 'album_art', 'added_by', 'created_at')
        read_only_fields = ('added_by',)

class PlaylistSerializer(serializers.ModelSerializer):
    track_detail = TrackSerializer(source='track', read_only=True)

    class Meta:
        model = Playlist
        fields = ('id', 'room', 'track', 'track_detail', 'approval_status', 'added_at')

class ChatMessageSerializer(serializers.ModelSerializer):
    user_detail = CustomUserSerializer(source='user', read_only=True)

    class Meta:
        model = ChatMessage
        fields = ('id', 'room', 'user', 'user_detail', 'content', 'timestamp')
        read_only_fields = ('user',)

class InvitationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Invitation
        fields = '__all__'
        read_only_fields = ('created_by', 'token', 'expires_at')

class ListeningHistorySerializer(serializers.ModelSerializer):
    track_detail = TrackSerializer(source='track', read_only=True)

    class Meta:
        model = ListeningHistory
        fields = ('id', 'user', 'track', 'track_detail', 'room', 'timestamp')
        read_only_fields = ('user',)

class UploadedMusicSerializer(serializers.ModelSerializer):
    class Meta:
        model = UploadedMusic
        fields = '__all__'
        read_only_fields = ('user', 'status')
