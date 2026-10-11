from datetime import timedelta
from unittest import mock

from channels.routing import URLRouter
from channels.testing import WebsocketCommunicator
from django.test import TestCase, TransactionTestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import AccessToken

from . import playback, presence
from .middleware import JWTAuthMiddleware
from .models import ChatMessage, CustomUser, Playlist, Room
from .routing import websocket_urlpatterns

TEST_CHANNEL_LAYERS = {'default': {'BACKEND': 'channels.layers.InMemoryChannelLayer'}}


def fake_resolve(source, external_id):
    return {
        'source': source, 'external_id': external_id, 'title': f'Song {external_id}', 'artist': 'Artist',
        'duration': 60_000, 'stream_url': f'https://example.com/{external_id}.mp3',
        'album_art': None, 'is_preview': source == 'itunes',
    }


@override_settings(CHANNEL_LAYERS=TEST_CHANNEL_LAYERS)
@mock.patch('api.music.resolve', side_effect=fake_resolve)
class RoomApiTests(TestCase):
    def setUp(self):
        presence.clear()
        self.host = CustomUser.objects.create_user('host', 'host@example.com', 'S3cure-pass!')
        self.guest = CustomUser.objects.create_user('guest', 'guest@example.com', 'S3cure-pass!')
        self.host_client = APIClient()
        self.host_client.force_authenticate(self.host)
        self.guest_client = APIClient()
        self.guest_client.force_authenticate(self.guest)
        self.room_id = self.host_client.post('/api/rooms/', {'name': 'Lofi', 'theme': 'CALM'}).data['id']

    def queue(self, client, external_id, source='audius'):
        return client.post(f'/api/rooms/{self.room_id}/queue/', {'source': source, 'external_id': external_id})

    def test_register_and_login(self, _):
        anon = APIClient()
        res = anon.post('/api/users/', {'username': 'new', 'email': 'n@example.com', 'password': 'An0ther-pass!'})
        self.assertEqual(res.status_code, 201)
        res = anon.post('/api/auth/login/', {'username': 'new', 'password': 'An0ther-pass!'})
        self.assertIn('access', res.data)

    def test_user_list_not_exposed(self, _):
        self.assertEqual(self.host_client.get('/api/users/').status_code, 405)

    def test_only_host_can_edit_room(self, _):
        res = self.guest_client.patch(f'/api/rooms/{self.room_id}/', {'name': 'Hijacked'})
        self.assertEqual(res.status_code, 403)

    def test_first_song_starts_immediately_then_queues(self, _):
        state = self.queue(self.guest_client, 'a').data
        self.assertEqual(state['current']['title'], 'Song a')
        self.assertTrue(state['is_playing'])
        self.assertEqual(state['current']['added_by'], 'guest')

        state = self.queue(self.guest_client, 'b', source='itunes').data
        self.assertEqual(state['current']['title'], 'Song a')
        self.assertEqual([q['title'] for q in state['queue']], ['Song b'])
        self.assertTrue(state['queue'][0]['is_preview'])

    def test_guest_cannot_control_playback(self, _):
        self.queue(self.guest_client, 'a')
        res = self.guest_client.post(f'/api/rooms/{self.room_id}/playback/', {'action': 'skip'})
        self.assertEqual(res.status_code, 403)

    def test_host_pause_resume_and_skip(self, _):
        self.queue(self.host_client, 'a')
        self.queue(self.host_client, 'b')
        url = f'/api/rooms/{self.room_id}/playback/'

        state = self.host_client.post(url, {'action': 'pause'}).data
        self.assertFalse(state['is_playing'])
        state = self.host_client.post(url, {'action': 'play'}).data
        self.assertTrue(state['is_playing'])

        state = self.host_client.post(url, {'action': 'skip'}).data
        self.assertEqual(state['current']['title'], 'Song b')
        self.assertEqual(state['queue'], [])

        state = self.host_client.post(url, {'action': 'skip'}).data
        self.assertIsNone(state['current'])
        self.assertFalse(state['is_playing'])

    def test_finished_track_advances_on_state_read(self, _):
        self.queue(self.host_client, 'a')
        self.queue(self.host_client, 'b')
        Room.objects.filter(id=self.room_id).update(state_changed_at=timezone.now() - timedelta(minutes=2))
        state = self.guest_client.get(f'/api/rooms/{self.room_id}/state/').data
        self.assertEqual(state['current']['title'], 'Song b')
        self.assertLess(state['position_ms'], 5000)

    def test_track_ended_report_requires_matching_seq_and_end(self, _):
        self.queue(self.host_client, 'a')
        self.queue(self.host_client, 'b')
        room = Room.objects.get(id=self.room_id)
        # Too early: ignored.
        self.assertFalse(playback.track_ended(self.room_id, room.play_seq))
        Room.objects.filter(id=self.room_id).update(state_changed_at=timezone.now() - timedelta(seconds=58))
        # Stale sequence number: ignored.
        self.assertFalse(playback.track_ended(self.room_id, room.play_seq - 1))
        self.assertTrue(playback.track_ended(self.room_id, room.play_seq))
        self.assertEqual(Room.objects.get(id=self.room_id).current_track.external_id, 'b')

    def test_host_can_reorder_and_remove_queue(self, _):
        self.queue(self.host_client, 'a')
        self.queue(self.guest_client, 'b')
        state = self.queue(self.guest_client, 'c').data
        b_id, c_id = state['queue'][0]['item_id'], state['queue'][1]['item_id']

        self.assertEqual(self.guest_client.post(f'/api/rooms/{self.room_id}/queue/{c_id}/top/').status_code, 403)
        state = self.host_client.post(f'/api/rooms/{self.room_id}/queue/{c_id}/top/').data
        self.assertEqual([q['title'] for q in state['queue']], ['Song c', 'Song b'])

        state = self.host_client.delete(f'/api/rooms/{self.room_id}/queue/{b_id}/').data
        self.assertEqual([q['title'] for q in state['queue']], ['Song c'])

    def test_play_now_is_host_only(self, _):
        url = f'/api/rooms/{self.room_id}/play-now/'
        self.assertEqual(self.guest_client.post(url, {'source': 'audius', 'external_id': 'x'}).status_code, 403)
        state = self.host_client.post(url, {'source': 'audius', 'external_id': 'x'}).data
        self.assertEqual(state['current']['title'], 'Song x')

    def test_invalid_source_rejected(self, _):
        res = self.queue(self.guest_client, 'a', source='spotify')
        self.assertEqual(res.status_code, 400)

    def test_unavailable_track_rejected(self, resolve):
        from .music import TrackNotFound
        resolve.side_effect = TrackNotFound('x')
        self.assertEqual(self.queue(self.guest_client, 'gone').status_code, 400)

    def test_room_list_shows_now_playing(self, _):
        self.queue(self.host_client, 'a')
        room = APIClient().get('/api/rooms/').data[0]
        self.assertEqual(room['now_playing']['title'], 'Song a')
        self.assertTrue(room['is_playing'])
        self.assertEqual(room['listener_count'], 0)

    def test_messages_require_room(self, _):
        ChatMessage.objects.create(room_id=self.room_id, user=self.guest, content='hi')
        self.assertEqual(self.host_client.get('/api/messages/').status_code, 400)
        data = self.host_client.get(f'/api/messages/?room={self.room_id}').data
        self.assertEqual(data[0]['user_name'], 'guest')

    def test_position_is_frozen_while_paused(self, _):
        self.queue(self.host_client, 'a')
        Room.objects.filter(id=self.room_id).update(state_changed_at=timezone.now() - timedelta(seconds=10))
        self.host_client.post(f'/api/rooms/{self.room_id}/playback/', {'action': 'pause'})
        room = Room.objects.get(id=self.room_id)
        self.assertAlmostEqual(room.current_position_ms(), 10_000, delta=1000)
        self.assertEqual(room.current_position_ms(timezone.now() + timedelta(minutes=5)), room.position_ms)


@override_settings(CHANNEL_LAYERS=TEST_CHANNEL_LAYERS)
class RoomConsumerTests(TransactionTestCase):
    def setUp(self):
        presence.clear()
        self.host = CustomUser.objects.create_user('host', password='S3cure-pass!')
        self.guest = CustomUser.objects.create_user('guest', password='S3cure-pass!')
        self.room = Room.objects.create(name='Lofi', admin=self.host)
        self.app = JWTAuthMiddleware(URLRouter(websocket_urlpatterns))

    def communicator(self, user=None, room_id=None):
        query = f'?token={AccessToken.for_user(user)}' if user else ''
        return WebsocketCommunicator(self.app, f'/ws/room/{room_id or self.room.id}/{query}')

    async def connect(self, user):
        comm = self.communicator(user)
        connected, _ = await comm.connect()
        self.assertTrue(connected)
        state = await comm.receive_json_from()
        self.assertEqual(state['type'], 'room_state')
        listeners = await comm.receive_json_from()
        self.assertEqual(listeners['type'], 'listeners')
        return comm, listeners

    async def test_presence_and_chat_identity(self):
        host, listeners = await self.connect(self.host)
        self.assertEqual([u['username'] for u in listeners['listeners']], ['host'])

        guest, listeners = await self.connect(self.guest)
        self.assertEqual(listeners['change'], 'joined')
        joined = await host.receive_json_from()
        self.assertEqual([u['username'] for u in joined['listeners']], ['guest', 'host'])

        await guest.send_json_to({'type': 'chat_message', 'content': 'hello', 'user_name': 'host'})
        msg = await host.receive_json_from()
        self.assertEqual((msg['user_name'], msg['content']), ('guest', 'hello'))
        self.assertTrue(await ChatMessage.objects.filter(content='hello', user=self.guest).aexists())

        await guest.disconnect()
        left = await host.receive_json_from()
        self.assertEqual(left['change'], 'left')
        self.assertEqual([u['username'] for u in left['listeners']], ['host'])
        await host.disconnect()

    async def test_anonymous_rejected(self):
        connected, code = await self.communicator().connect()
        self.assertFalse(connected)

    async def test_unknown_room_rejected(self):
        connected, _ = await self.communicator(self.host, room_id=99999).connect()
        self.assertFalse(connected)

    async def test_state_broadcast_when_queue_changes(self):
        host, _ = await self.connect(self.host)
        with mock.patch('api.music.resolve', side_effect=fake_resolve):
            client = APIClient()
            client.force_authenticate(self.guest)
            from asgiref.sync import sync_to_async
            await sync_to_async(client.post)(f'/api/rooms/{self.room.id}/queue/',
                                             {'source': 'audius', 'external_id': 'z'})
        event = await host.receive_json_from(timeout=2)
        self.assertEqual(event['type'], 'room_state')
        self.assertEqual(event['current']['title'], 'Song z')
        self.assertFalse(await Playlist.objects.filter(room=self.room).aexists())
        await host.disconnect()
