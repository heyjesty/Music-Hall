from rest_framework import serializers

from . import presence
from .models import ChatMessage, CustomUser, Invitation, ListeningHistory, Membership, Room, Track, UploadedMusic


class PublicUserSerializer(serializers.ModelSerializer):
    """Minimal user info that is safe to show to other listeners."""

    class Meta:
        model = CustomUser
        fields = ('id', 'username', 'first_name', 'last_name', 'profile_photo')


class CustomUserSerializer(serializers.ModelSerializer):
    class Meta:
        model = CustomUser
        fields = ('id', 'username', 'email', 'first_name', 'last_name', 'profile_photo', 'music_preferences')
        read_only_fields = ('id', 'username')


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


class TrackSerializer(serializers.ModelSerializer):
    class Meta:
        model = Track
        fields = ('id', 'source', 'external_id', 'title', 'artist', 'duration', 'album_art', 'stream_url',
                  'is_preview', 'created_at')


class RoomSerializer(serializers.ModelSerializer):
    admin_detail = PublicUserSerializer(source='admin', read_only=True)
    member_count = serializers.SerializerMethodField()
    listener_count = serializers.SerializerMethodField()
    now_playing = serializers.SerializerMethodField()

    class Meta:
        model = Room
        fields = ('id', 'name', 'theme', 'description', 'admin', 'admin_detail', 'member_count', 'listener_count',
                  'now_playing', 'is_playing', 'created_at')
        read_only_fields = ('admin', 'is_playing')

    def get_member_count(self, obj):
        count = getattr(obj, 'approved_member_count', None)
        if count is None:
            count = obj.memberships.filter(status='APPROVED').count()
        return count

    def get_listener_count(self, obj):
        return presence.count(obj.id)

    def get_now_playing(self, obj):
        track = obj.current_track
        if not track:
            return None
        return {'title': track.title, 'artist': track.artist, 'album_art': track.album_art}


class MembershipSerializer(serializers.ModelSerializer):
    user_detail = PublicUserSerializer(source='user', read_only=True)

    class Meta:
        model = Membership
        fields = ('id', 'user', 'user_detail', 'room', 'role', 'status', 'joined_at')
        read_only_fields = ('user', 'role', 'status')


class ChatMessageSerializer(serializers.ModelSerializer):
    user_id = serializers.IntegerField(source='user.id', read_only=True)
    user_name = serializers.CharField(source='user.username', read_only=True)

    class Meta:
        model = ChatMessage
        fields = ('id', 'room', 'user_id', 'user_name', 'content', 'timestamp')


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
