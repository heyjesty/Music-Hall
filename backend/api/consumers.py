import json

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncWebsocketConsumer

from . import playback, presence
from .models import ChatMessage, Room

MAX_MESSAGE_LENGTH = 1000


class RoomConsumer(AsyncWebsocketConsumer):
    """One socket per listener in a room: chat, presence and playback state."""

    joined = False

    async def connect(self):
        self.room_id = int(self.scope['url_route']['kwargs']['room_id'])
        self.room_group_name = playback.group_name(self.room_id)
        self.user = self.scope.get('user')

        if not (self.user and self.user.is_authenticated):
            await self.close(code=4001)
            return
        if not await self.room_exists():
            await self.close(code=4004)
            return

        await self.channel_layer.group_add(self.room_group_name, self.channel_name)
        await self.accept()
        self.joined = True

        first_connection = presence.join(self.room_id, self.user)
        await self.send_json(await self.get_state())
        await self.broadcast_listeners('joined' if first_connection else None)

    async def disconnect(self, close_code):
        if not self.joined:
            return
        last_connection = presence.leave(self.room_id, self.user)
        await self.channel_layer.group_discard(self.room_group_name, self.channel_name)
        await self.broadcast_listeners('left' if last_connection else None)

    async def broadcast_listeners(self, change):
        await self.group_event({
            'type': 'listeners',
            'listeners': presence.listeners(self.room_id),
            'change': change,
            'user_name': self.user.username,
        })

    async def receive(self, text_data=None, bytes_data=None):
        try:
            data = json.loads(text_data or '{}')
        except json.JSONDecodeError:
            return

        message_type = data.get('type')

        if message_type == 'chat_message':
            content = str(data.get('content', '')).strip()[:MAX_MESSAGE_LENGTH]
            if not content:
                return
            message = await self.save_message(content)
            # Identity comes from the authenticated connection, never the payload.
            await self.group_event({
                'type': 'chat_message',
                'id': message.id,
                'content': content,
                'user_id': self.user.id,
                'user_name': self.user.username,
                'timestamp': message.timestamp.isoformat(),
            })

        elif message_type == 'track_ended':
            try:
                play_seq = int(data.get('play_seq'))
            except (TypeError, ValueError):
                return
            await database_sync_to_async(playback.track_ended)(self.room_id, play_seq)

        elif message_type == 'request_state':
            await self.send_json(await self.get_state())

    async def group_event(self, payload):
        await self.channel_layer.group_send(self.room_group_name, {'type': 'room_event', 'payload': payload})

    async def room_event(self, event):
        await self.send_json(event['payload'])

    async def send_json(self, payload):
        await self.send(text_data=json.dumps(payload))

    # Database helpers

    @database_sync_to_async
    def room_exists(self):
        return Room.objects.filter(id=self.room_id).exists()

    @database_sync_to_async
    def get_state(self):
        room = Room.objects.select_related('current_track', 'current_added_by').filter(id=self.room_id).first()
        if room is None:
            return {'type': 'room_closed'}
        if playback.advance_if_finished(self.room_id):
            room.refresh_from_db()
        return playback.room_state(room)

    @database_sync_to_async
    def save_message(self, content):
        return ChatMessage.objects.create(room_id=self.room_id, user=self.user, content=content)
