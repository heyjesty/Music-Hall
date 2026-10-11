from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

from .models import ChatMessage, CustomUser, Membership, Playlist, Room, Track


@admin.register(CustomUser)
class CustomUserAdmin(UserAdmin):
    fieldsets = UserAdmin.fieldsets + (('Music Hall', {'fields': ('profile_photo', 'music_preferences')}),)


@admin.register(Room)
class RoomAdmin(admin.ModelAdmin):
    list_display = ('name', 'theme', 'admin', 'created_at')
    list_filter = ('theme',)
    search_fields = ('name',)


@admin.register(Track)
class TrackAdmin(admin.ModelAdmin):
    list_display = ('title', 'artist', 'spotify_id')
    search_fields = ('title', 'artist')


admin.site.register(Membership)
admin.site.register(Playlist)
admin.site.register(ChatMessage)
