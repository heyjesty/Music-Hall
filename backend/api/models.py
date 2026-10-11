from django.contrib.auth.models import AbstractUser
from django.db import models
from django.utils import timezone


class CustomUser(AbstractUser):
    profile_photo = models.URLField(blank=True, null=True, help_text="URL to profile photo")
    music_preferences = models.JSONField(default=list, blank=True, help_text="List of genres/moods")

    def __str__(self):
        return self.username


class Track(models.Model):
    SOURCE_CHOICES = [
        ('audius', 'Audius'),
        ('itunes', 'Apple Music preview'),
    ]

    source = models.CharField(max_length=20, choices=SOURCE_CHOICES)
    external_id = models.CharField(max_length=100)
    title = models.CharField(max_length=255)
    artist = models.CharField(max_length=255)
    duration = models.IntegerField(help_text="Playable duration in milliseconds")
    stream_url = models.URLField(max_length=1000)
    album_art = models.URLField(max_length=500, blank=True, null=True)
    is_preview = models.BooleanField(default=False, help_text="True for 30-second previews")
    added_by = models.ForeignKey(CustomUser, on_delete=models.SET_NULL, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=['source', 'external_id'], name='unique_track_per_source'),
        ]

    def __str__(self):
        return f"{self.title} by {self.artist}"


class Room(models.Model):
    THEME_CHOICES = [
        ('SAD', 'Sad'),
        ('ROMANTIC', 'Romantic'),
        ('ENERGETIC', 'Energetic'),
        ('CALM', 'Calm'),
        ('PARTY', 'Party'),
    ]

    name = models.CharField(max_length=255)
    theme = models.CharField(max_length=50, choices=THEME_CHOICES, default='CALM')
    description = models.TextField(blank=True)
    admin = models.ForeignKey(CustomUser, on_delete=models.CASCADE, related_name='administered_rooms')

    # Server-authoritative playback state. The live position is
    # position_ms + (now - state_changed_at) while is_playing.
    current_track = models.ForeignKey(Track, on_delete=models.SET_NULL, null=True, blank=True, related_name='+')
    current_added_by = models.ForeignKey(CustomUser, on_delete=models.SET_NULL, null=True, blank=True,
                                         related_name='+')
    is_playing = models.BooleanField(default=False)
    position_ms = models.IntegerField(default=0)
    state_changed_at = models.DateTimeField(default=timezone.now)
    # Increments every time the current track changes, so stale "track ended"
    # reports from clients can be ignored.
    play_seq = models.PositiveIntegerField(default=0)

    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.name} - {self.theme}"

    def current_position_ms(self, now=None):
        if not self.current_track:
            return 0
        position = self.position_ms
        if self.is_playing:
            now = now or timezone.now()
            position += int((now - self.state_changed_at).total_seconds() * 1000)
        return max(0, min(position, self.current_track.duration))


class Membership(models.Model):
    ROLE_CHOICES = [
        ('ADMIN', 'Admin'),
        ('MEMBER', 'Member')
    ]
    STATUS_CHOICES = [
        ('PENDING', 'Pending'),
        ('APPROVED', 'Approved'),
        ('REJECTED', 'Rejected')
    ]

    user = models.ForeignKey(CustomUser, on_delete=models.CASCADE, related_name='memberships')
    room = models.ForeignKey(Room, on_delete=models.CASCADE, related_name='memberships')
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default='MEMBER')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='PENDING')
    joined_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('user', 'room')


class Playlist(models.Model):
    """A room's upcoming queue, played first-in first-out by added_at."""

    STATUS_CHOICES = [
        ('PENDING', 'Pending'),
        ('APPROVED', 'Approved'),
    ]

    room = models.ForeignKey(Room, on_delete=models.CASCADE, related_name='playlist')
    track = models.ForeignKey(Track, on_delete=models.CASCADE)
    added_by = models.ForeignKey(CustomUser, on_delete=models.SET_NULL, null=True, blank=True)
    approval_status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='APPROVED')
    added_at = models.DateTimeField(auto_now_add=True)


class ChatMessage(models.Model):
    room = models.ForeignKey(Room, on_delete=models.CASCADE, related_name='messages')
    user = models.ForeignKey(CustomUser, on_delete=models.CASCADE)
    content = models.TextField()
    timestamp = models.DateTimeField(auto_now_add=True)


class Invitation(models.Model):
    room = models.ForeignKey(Room, on_delete=models.CASCADE, related_name='invitations')
    token = models.CharField(max_length=64, unique=True)
    expires_at = models.DateTimeField()
    created_by = models.ForeignKey(CustomUser, on_delete=models.CASCADE)
    created_at = models.DateTimeField(auto_now_add=True)


class ListeningHistory(models.Model):
    user = models.ForeignKey(CustomUser, on_delete=models.CASCADE, related_name='listening_history')
    track = models.ForeignKey(Track, on_delete=models.CASCADE)
    room = models.ForeignKey(Room, on_delete=models.SET_NULL, null=True, blank=True)
    timestamp = models.DateTimeField(auto_now_add=True)


class UploadedMusic(models.Model):
    STATUS_CHOICES = [
        ('PENDING', 'Pending'),
        ('APPROVED', 'Approved'),
        ('REJECTED', 'Rejected'),
    ]

    user = models.ForeignKey(CustomUser, on_delete=models.CASCADE, related_name='uploaded_music')
    file = models.FileField(upload_to='music_uploads/')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='PENDING')
    uploaded_at = models.DateTimeField(auto_now_add=True)
