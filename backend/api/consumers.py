import json
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from .models import Room, CustomUser

class RoomConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.room_id = self.scope['url_route']['kwargs']['room_id']
        self.room_group_name = f'room_{self.room_id}'

        # Join room group
        await self.channel_layer.group_add(
            self.room_group_name,
            self.channel_name
        )

        await self.accept()
        
        # Notify room of user presence
        await self.channel_layer.group_send(
            self.room_group_name,
            {
                'type': 'presence_message',
                'status': 'joining',
                'user_id': self.scope['user'].id if self.scope['user'].is_authenticated else 'Anonymous'
            }
        )

    async def disconnect(self, close_code):
        # Leave room group
        await self.channel_layer.group_discard(
            self.room_group_name,
            self.channel_name
        )

        # Notify room
        await self.channel_layer.group_send(
            self.room_group_name,
            {
                'type': 'presence_message',
                'status': 'leaving',
                'user_id': self.scope['user'].id if self.scope['user'].is_authenticated else 'Anonymous'
            }
        )

    # Receive message from WebSocket
    async def receive(self, text_data):
        data = json.loads(text_data)
        message_type = data.get('type')

        if message_type == 'chat_message':
            content = data.get('content')
            user_id = data.get('user_id')
            user_name = data.get('user_name', 'Anonymous')
            client_id = data.get('client_id')  # used by sender to deduplicate echo
            
            # Send message to room group
            await self.channel_layer.group_send(
                self.room_group_name,
                {
                    'type': 'chat_message',
                    'content': content,
                    'user_id': user_id,
                    'user_name': user_name,
                    'client_id': client_id,
                    'sender_channel_name': self.channel_name,
                }
            )
        elif message_type == 'playback_sync':
            track_id = data.get('track_id')
            timestamp_ms = data.get('timestamp_ms', 0)
            is_playing = data.get('is_playing', False)
            preview_url = data.get('preview_url', '')
            track_title = data.get('track_title', '')
            track_artist = data.get('track_artist', '')
            track_art = data.get('track_art', '')

            await self.update_room_state(track_id, is_playing, timestamp_ms)

            await self.channel_layer.group_send(
                self.room_group_name,
                {
                    'type': 'playback_sync_broadcast',
                    'track_id': track_id,
                    'timestamp_ms': timestamp_ms,
                    'is_playing': is_playing,
                    'preview_url': preview_url,
                    'track_title': track_title,
                    'track_artist': track_artist,
                    'track_art': track_art,
                    'sender_channel_name': self.channel_name
                }
            )

    # Receive message from room group
    async def chat_message(self, event):
        payload = {
            'type': 'chat_message',
            'content': event['content'],
            'user_id': event['user_id'],
            'user_name': event.get('user_name'),
        }
        # Echo the client_id back only to the original sender
        # so they can identify and skip their own optimistic duplicate
        if self.channel_name == event.get('sender_channel_name') and event.get('client_id'):
            payload['client_id'] = event['client_id']
        await self.send(text_data=json.dumps(payload))
        
    async def playback_sync_broadcast(self, event):
        if self.channel_name != event.get('sender_channel_name'):
            await self.send(text_data=json.dumps({
                'type': 'playback_sync',
                'track_id': event['track_id'],
                'timestamp_ms': event['timestamp_ms'],
                'is_playing': event['is_playing'],
                'preview_url': event.get('preview_url', ''),
                'track_title': event.get('track_title', ''),
                'track_artist': event.get('track_artist', ''),
                'track_art': event.get('track_art', ''),
            }))
        
    async def presence_message(self, event):
        await self.send(text_data=json.dumps({
            'type': 'presence',
            'status': event['status'],
            'user_id': event['user_id']
        }))

    async def queue_update_broadcast(self, event):
        await self.send(text_data=json.dumps({
            'type': 'queue_update'
        }))

    @database_sync_to_async
    def update_room_state(self, track_id, is_playing, timestamp_ms):
        try:
            room = Room.objects.get(id=int(self.room_id))
            room.current_track_id = track_id
            room.is_playing = is_playing
            room.timestamp_ms = timestamp_ms
            room.save()
        except Room.DoesNotExist:
            pass
