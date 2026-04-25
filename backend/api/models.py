from django.db import models
from django.contrib.auth.models import AbstractUser
from django.utils import timezone

class CustomUser(AbstractUser):
    profile_photo = models.URLField(blank=True, null=True, help_text="URL to profile photo")
    music_preferences = models.JSONField(default=list, blank=True, help_text="List of genres/moods")

    def __str__(self):
        return self.username

class SpotifyToken(models.Model):
    user = models.OneToOneField(CustomUser, on_delete=models.CASCADE, related_name='spotify_token')
    access_token = models.TextField()
    refresh_token = models.TextField()
    expires_at = models.DateTimeField()
    token_type = models.CharField(max_length=50, default='Bearer')
    created_at = models.DateTimeField(auto_now_add=True)

    def is_expired(self):
        return timezone.now() >= self.expires_at

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
    
    # Playback State
    current_track_id = models.CharField(max_length=255, blank=True, null=True)
    is_playing = models.BooleanField(default=False)
    timestamp_ms = models.IntegerField(default=0)
    last_sync_time = models.DateTimeField(auto_now=True)
    
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.name} - {self.theme}"

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

class Track(models.Model):
    title = models.CharField(max_length=255)
    artist = models.CharField(max_length=255)
    duration = models.IntegerField(help_text="Duration in milliseconds")
    source_url = models.URLField(max_length=500, blank=True, null=True)
    spotify_id = models.CharField(max_length=255, blank=True, null=True, unique=True)
    album_art = models.URLField(max_length=500, blank=True, null=True)
    added_by = models.ForeignKey(CustomUser, on_delete=models.SET_NULL, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.title} by {self.artist}"

class Playlist(models.Model):
    STATUS_CHOICES = [
        ('PENDING', 'Pending'),
        ('APPROVED', 'Approved'),
    ]

    room = models.ForeignKey(Room, on_delete=models.CASCADE, related_name='playlist')
    track = models.ForeignKey(Track, on_delete=models.CASCADE)
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
