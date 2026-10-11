from rest_framework import serializers

from .models import (ChatMessage, CustomUser, Invitation, ListeningHistory, Membership, Playlist, Room,
                     SpotifyToken, Track, UploadedMusic)


class PublicUserSerializer(serializers.ModelSerializer):
    """Minimal user info that is safe to show to other listeners."""

    class Meta:
        model = CustomUser
        fields = ('id', 'username', 'first_name', 'last_name', 'profile_photo')


class CustomUserSerializer(serializers.ModelSerializer):
    is_spotify_connected = serializers.SerializerMethodField()

    class Meta:
        model = CustomUser
        fields = ('id', 'username', 'email', 'first_name', 'last_name', 'profile_photo', 'music_preferences',
                  'is_spotify_connected')
        read_only_fields = ('id', 'username')

    def get_is_spotify_connected(self, obj):
        return SpotifyToken.objects.filter(user=obj).exists()


class SpotifyTokenSerializer(serializers.ModelSerializer):
    class Meta:
        model = SpotifyToken
        fields = ('access_token', 'refresh_token', 'expires_at', 'token_type')


class UserRegistrationSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8)

    class Meta:
        model = CustomUser
        fields = ('id', 'username', 'email', 'password', 'first_name', 'last_name')

    def validate_password(self, value):
        from django.contrib.auth.password_validation import validate_password
        validate_password(value)
        return value

    def create(self, validated_data):
        return CustomUser.objects.create_user(**validated_data)


class RoomSerializer(serializers.ModelSerializer):
    admin_detail = PublicUserSerializer(source='admin', read_only=True)
    member_count = serializers.SerializerMethodField()

    class Meta:
        model = Room
        fields = ('id', 'name', 'theme', 'description', 'admin', 'admin_detail', 'member_count',
                  'current_track_id', 'is_playing', 'timestamp_ms', 'last_sync_time', 'created_at')
        read_only_fields = ('admin', 'current_track_id', 'is_playing', 'timestamp_ms', 'last_sync_time')

    def get_member_count(self, obj):
        count = getattr(obj, 'approved_member_count', None)
        if count is None:
            count = obj.memberships.filter(status='APPROVED').count()
        return count


class MembershipSerializer(serializers.ModelSerializer):
    user_detail = PublicUserSerializer(source='user', read_only=True)

    class Meta:
        model = Membership
        fields = ('id', 'user', 'user_detail', 'room', 'role', 'status', 'joined_at')
        read_only_fields = ('user', 'role', 'status')


class TrackSerializer(serializers.ModelSerializer):
    class Meta:
        model = Track
        fields = ('id', 'title', 'artist', 'duration', 'source_url', 'spotify_id', 'album_art', 'added_by',
                  'created_at')
        read_only_fields = ('added_by',)


class PlaylistSerializer(serializers.ModelSerializer):
    track_detail = TrackSerializer(source='track', read_only=True)

    class Meta:
        model = Playlist
        fields = ('id', 'room', 'track', 'track_detail', 'approval_status', 'added_at')
        read_only_fields = ('approval_status',)


class ChatMessageSerializer(serializers.ModelSerializer):
    user_detail = PublicUserSerializer(source='user', read_only=True)
    user_id = serializers.IntegerField(source='user.id', read_only=True)
    user_name = serializers.CharField(source='user.username', read_only=True)

    class Meta:
        model = ChatMessage
        fields = ('id', 'room', 'user', 'user_id', 'user_name', 'user_detail', 'content', 'timestamp')
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
