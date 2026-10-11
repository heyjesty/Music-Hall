import json

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncWebsocketConsumer

from .models import ChatMessage, Room

MAX_MESSAGE_LENGTH = 1000


def clean_track_meta(meta):
    """Keep only known display fields from client-supplied track metadata."""
    if not isinstance(meta, dict):
        return None
    album_art = str(meta.get('album_art') or '')[:500]
    try:
        duration = int(meta.get('duration') or 0)
    except (TypeError, ValueError):
        duration = 0
    return {
        'title': str(meta.get('title') or '')[:255],
        'artist': str(meta.get('artist') or '')[:255],
        'album_art': album_art if album_art.startswith('https://') else None,
        'duration': duration,
    }


class RoomConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.room_id = int(self.scope['url_route']['kwargs']['room_id'])
        self.room_group_name = f'room_{self.room_id}'
        self.user = self.scope.get('user')

        self.room_admin_id = await self.get_room_admin_id()
        if self.room_admin_id is None:
            await self.close(code=4004)
            return

        await self.channel_layer.group_add(self.room_group_name, self.channel_name)
        await self.accept()
        await self.broadcast_presence('joining')

    async def disconnect(self, close_code):
        if getattr(self, 'room_admin_id', None) is None:
            return
        await self.broadcast_presence('leaving')
        await self.channel_layer.group_discard(self.room_group_name, self.channel_name)

    @property
    def is_authenticated(self):
        return bool(self.user and self.user.is_authenticated)

    @property
    def is_room_admin(self):
        return self.is_authenticated and self.user.id == self.room_admin_id

    async def broadcast_presence(self, status):
        await self.channel_layer.group_send(self.room_group_name, {
            'type': 'presence_message',
            'status': status,
            'user_id': self.user.id if self.is_authenticated else None,
            'user_name': self.user.username if self.is_authenticated else 'Guest',
        })

    async def receive(self, text_data=None, bytes_data=None):
        try:
            data = json.loads(text_data or '{}')
        except json.JSONDecodeError:
            return

        message_type = data.get('type')

        if message_type == 'chat_message':
            # Identity comes from the authenticated connection, never the client payload.
            if not self.is_authenticated:
                return
            content = str(data.get('content', '')).strip()[:MAX_MESSAGE_LENGTH]
            if not content:
                return
            message = await self.save_message(content)
            await self.channel_layer.group_send(self.room_group_name, {
                'type': 'chat_message',
                'id': message.id,
                'content': content,
                'user_id': self.user.id,
                'user_name': self.user.username,
                'timestamp': message.timestamp.isoformat(),
            })

        elif message_type == 'playback_sync':
            # Only the room admin drives playback for everyone else.
            if not self.is_room_admin:
                return
            track_id = data.get('track_id')
            try:
                timestamp_ms = int(data.get('timestamp_ms') or 0)
            except (TypeError, ValueError):
                timestamp_ms = 0
            is_playing = bool(data.get('is_playing'))
            await self.update_room_state(track_id, is_playing, timestamp_ms)
            await self.channel_layer.group_send(self.room_group_name, {
                'type': 'playback_sync_broadcast',
                'track_id': track_id,
                'timestamp_ms': timestamp_ms,
                'is_playing': is_playing,
                'track': clean_track_meta(data.get('track')),
                'sender_channel_name': self.channel_name,
            })

    # Group message handlers

    async def chat_message(self, event):
        await self.send(text_data=json.dumps({
            'type': 'chat_message',
            'id': event.get('id'),
            'content': event['content'],
            'user_id': event['user_id'],
            'user_name': event.get('user_name'),
            'timestamp': event.get('timestamp'),
        }))

    async def playback_sync_broadcast(self, event):
        if self.channel_name == event.get('sender_channel_name'):
            return
        await self.send(text_data=json.dumps({
            'type': 'playback_sync',
            'track_id': event['track_id'],
            'timestamp_ms': event['timestamp_ms'],
            'is_playing': event['is_playing'],
            'track': event.get('track'),
        }))

    async def presence_message(self, event):
        await self.send(text_data=json.dumps({
            'type': 'presence',
            'status': event['status'],
            'user_id': event['user_id'],
            'user_name': event.get('user_name'),
        }))

    async def queue_update_broadcast(self, event):
        await self.send(text_data=json.dumps({'type': 'queue_update'}))

    # Database helpers

    @database_sync_to_async
    def get_room_admin_id(self):
        return Room.objects.filter(id=self.room_id).values_list('admin_id', flat=True).first()

    @database_sync_to_async
    def save_message(self, content):
        return ChatMessage.objects.create(room_id=self.room_id, user=self.user, content=content)

    @database_sync_to_async
    def update_room_state(self, track_id, is_playing, timestamp_ms):
        Room.objects.filter(id=self.room_id).update(
            current_track_id=track_id,
            is_playing=is_playing,
            timestamp_ms=timestamp_ms,
        )
