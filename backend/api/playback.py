"""Server-authoritative room playback.

The room row holds the current track and where playback is. Every change is
broadcast to the room's WebSocket group as a full `room_state` event, and each
client simply plays the stream at the position it is told.
"""

import logging
from datetime import timedelta

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.db import transaction
from django.db.models import Min
from django.utils import timezone

from . import music
from .models import Playlist, Room, Track

logger = logging.getLogger(__name__)

# How close to the end a "track ended" report must be before we trust it.
END_TOLERANCE_MS = 5000


def group_name(room_id):
    return f'room_{room_id}'


def send_to_room(room_id, payload):
    """Send an event to every socket in the room (best effort)."""
    channel_layer = get_channel_layer()
    if channel_layer is None:
        return
    try:
        async_to_sync(channel_layer.group_send)(group_name(room_id), {'type': 'room_event', 'payload': payload})
    except Exception:
        logger.exception('Failed to broadcast to room %s', room_id)


def serialize_track(track):
    return {
        'id': track.id,
        'source': track.source,
        'title': track.title,
        'artist': track.artist,
        'duration': track.duration,
        'album_art': track.album_art,
        'stream_url': track.stream_url,
        'is_preview': track.is_preview,
    }


def room_state(room):
    queue = (Playlist.objects.filter(room=room).select_related('track', 'added_by').order_by('added_at', 'id'))
    current = None
    if room.current_track:
        current = {
            **serialize_track(room.current_track),
            'added_by': room.current_added_by.username if room.current_added_by else None,
        }
    return {
        'type': 'room_state',
        'room_id': room.id,
        'play_seq': room.play_seq,
        'is_playing': room.is_playing and current is not None,
        'position_ms': room.current_position_ms(),
        'current': current,
        'queue': [
            {**serialize_track(item.track), 'item_id': item.id,
             'added_by': item.added_by.username if item.added_by else None}
            for item in queue
        ],
    }


def broadcast_state(room_id):
    """Broadcast the committed state of a room after the current transaction."""

    def send():
        room = Room.objects.select_related('current_track', 'current_added_by').filter(id=room_id).first()
        if room:
            send_to_room(room_id, room_state(room))

    transaction.on_commit(send)


def get_or_create_track(source, external_id, user):
    track = Track.objects.filter(source=source, external_id=external_id).first()
    if track:
        return track
    data = music.resolve(source, external_id)
    track, _ = Track.objects.get_or_create(
        source=data['source'], external_id=data['external_id'],
        defaults={
            'title': data['title'][:255],
            'artist': data['artist'][:255],
            'duration': data['duration'],
            'stream_url': data['stream_url'],
            'album_art': data['album_art'],
            'is_preview': data['is_preview'],
            'added_by': user,
        },
    )
    return track


def _locked(room_id):
    return Room.objects.select_for_update().select_related('current_track').get(id=room_id)


def _start(room, track, added_by):
    room.current_track = track
    room.current_added_by = added_by
    room.position_ms = 0
    room.is_playing = True
    room.state_changed_at = timezone.now()
    room.play_seq += 1


def _start_next(room):
    item = Playlist.objects.filter(room=room).select_related('track', 'added_by').order_by('added_at', 'id').first()
    if item:
        _start(room, item.track, item.added_by)
        item.delete()
    else:
        room.current_track = None
        room.current_added_by = None
        room.position_ms = 0
        room.is_playing = False
        room.state_changed_at = timezone.now()
        room.play_seq += 1
    room.save()


def _is_finished(room, tolerance_ms=0):
    return (room.current_track is not None and room.is_playing
            and room.current_position_ms() >= room.current_track.duration - tolerance_ms)


def advance_if_finished(room_id):
    """Move on to the next track if the current one has run out. Returns True if state changed."""
    with transaction.atomic():
        room = _locked(room_id)
        if not _is_finished(room):
            return False
        _start_next(room)
        broadcast_state(room_id)
        return True


def track_ended(room_id, play_seq):
    """A client reports the current track finished playing."""
    with transaction.atomic():
        room = _locked(room_id)
        if room.play_seq != play_seq or not _is_finished(room, END_TOLERANCE_MS):
            return False
        _start_next(room)
        broadcast_state(room_id)
        return True


def add_to_queue(room_id, track, user):
    """Queue a track; if the room is silent, start playing it right away."""
    with transaction.atomic():
        room = _locked(room_id)
        if _is_finished(room):
            _start_next(room)
        if room.current_track is None:
            _start(room, track, user)
            room.save()
        else:
            Playlist.objects.create(room=room, track=track, added_by=user)
        broadcast_state(room_id)


def play_now(room_id, track, user):
    with transaction.atomic():
        room = _locked(room_id)
        _start(room, track, user)
        room.save()
        broadcast_state(room_id)


def set_playing(room_id, playing):
    with transaction.atomic():
        room = _locked(room_id)
        if room.current_track is None:
            if playing:
                _start_next(room)  # nothing loaded: start the queue
                broadcast_state(room_id)
            return
        if room.is_playing == playing:
            return
        room.position_ms = room.current_position_ms()
        room.is_playing = playing
        room.state_changed_at = timezone.now()
        room.save()
        broadcast_state(room_id)


def skip(room_id):
    with transaction.atomic():
        room = _locked(room_id)
        _start_next(room)
        broadcast_state(room_id)


def remove_from_queue(room_id, item_id):
    deleted, _ = Playlist.objects.filter(room_id=room_id, id=item_id).delete()
    if deleted:
        with transaction.atomic():
            broadcast_state(room_id)
    return bool(deleted)


def move_to_top(room_id, item_id):
    with transaction.atomic():
        item = Playlist.objects.select_for_update().filter(room_id=room_id, id=item_id).first()
        if not item:
            return False
        earliest = Playlist.objects.filter(room_id=room_id).aggregate(first=Min('added_at'))['first']
        if earliest and earliest < item.added_at:
            Playlist.objects.filter(pk=item.pk).update(added_at=earliest - timedelta(seconds=1))
        broadcast_state(room_id)
        return True
