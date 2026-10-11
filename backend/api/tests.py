import os
from datetime import timedelta
from unittest import mock

from channels.routing import URLRouter
from channels.testing import WebsocketCommunicator
from django.core import signing
from django.test import TestCase, TransactionTestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import AccessToken

from .middleware import JWTAuthMiddleware
from .models import ChatMessage, CustomUser, Playlist, Room, Track
from .routing import websocket_urlpatterns
from .spotify_auth import STATE_SALT

TEST_CHANNEL_LAYERS = {'default': {'BACKEND': 'channels.layers.InMemoryChannelLayer'}}


@override_settings(CHANNEL_LAYERS=TEST_CHANNEL_LAYERS)
class ApiTests(TestCase):
    def setUp(self):
        self.admin = CustomUser.objects.create_user('host', 'host@example.com', 'S3cure-pass!')
        self.guest = CustomUser.objects.create_user('guest', 'guest@example.com', 'S3cure-pass!')
        self.client = APIClient()
        self.client.force_authenticate(self.admin)
        self.room = self.client.post('/api/rooms/', {'name': 'Lofi', 'theme': 'CALM'}).data

    def add_track(self, spotify_id):
        return self.client.post('/api/playlists/', {
            'room': self.room['id'], 'track_id': spotify_id, 'title': spotify_id, 'artist': 'A', 'duration': 1000,
        })

    def test_register_and_login(self):
        anon = APIClient()
        res = anon.post('/api/users/', {'username': 'new', 'email': 'n@example.com', 'password': 'An0ther-pass!'})
        self.assertEqual(res.status_code, 201)
        res = anon.post('/api/auth/login/', {'username': 'new', 'password': 'An0ther-pass!'})
        self.assertIn('access', res.data)

    def test_user_list_not_exposed(self):
        self.assertEqual(self.client.get('/api/users/').status_code, 405)

    def test_room_creator_is_admin_with_member_count(self):
        self.assertEqual(self.room['admin'], self.admin.id)
        self.assertEqual(self.room['member_count'], 1)

    def test_only_admin_can_edit_room(self):
        other = APIClient()
        other.force_authenticate(self.guest)
        res = other.patch(f"/api/rooms/{self.room['id']}/", {'name': 'Hijacked'})
        self.assertEqual(res.status_code, 403)

    def test_queue_add_filter_and_move_to_top(self):
        self.add_track('aaa')
        self.add_track('bbb')
        other_room = Room.objects.create(name='Other', admin=self.admin)
        Playlist.objects.create(room=other_room, track=Track.objects.get(spotify_id='aaa'))

        queue = self.client.get(f"/api/playlists/?room={self.room['id']}").data
        self.assertEqual([p['track_detail']['spotify_id'] for p in queue], ['aaa', 'bbb'])

        res = self.client.post(f"/api/playlists/{queue[1]['id']}/move_to_top/")
        self.assertEqual(res.status_code, 200)
        queue = self.client.get(f"/api/playlists/?room={self.room['id']}").data
        self.assertEqual([p['track_detail']['spotify_id'] for p in queue], ['bbb', 'aaa'])

    def test_only_admin_can_remove_from_queue(self):
        item = self.add_track('ccc').data
        other = APIClient()
        other.force_authenticate(self.guest)
        self.assertEqual(other.delete(f"/api/playlists/{item['id']}/").status_code, 403)
        self.assertEqual(self.client.delete(f"/api/playlists/{item['id']}/").status_code, 204)

    def test_messages_require_room_and_include_user_name(self):
        ChatMessage.objects.create(room_id=self.room['id'], user=self.guest, content='hi')
        self.assertEqual(self.client.get('/api/messages/').status_code, 400)
        data = self.client.get(f"/api/messages/?room={self.room['id']}").data
        self.assertEqual(data[0]['user_name'], 'guest')

    @override_settings(FRONTEND_URL='https://app.example.com')
    def test_spotify_callback_rejects_forged_state(self):
        res = APIClient().get('/api/spotify/callback/', {'code': 'x', 'state': str(self.admin.id)})
        self.assertEqual(res.status_code, 302)
        self.assertIn('https://app.example.com/spotify/callback?status=error', res['Location'])

    def test_spotify_state_is_signed(self):
        state = signing.dumps({'uid': self.admin.id}, salt=STATE_SALT)
        self.assertEqual(signing.loads(state, salt=STATE_SALT)['uid'], self.admin.id)

    def test_spotify_search_falls_back_to_demo_tracks(self):
        with mock.patch.dict(os.environ, {'SPOTIPY_CLIENT_ID': '', 'SPOTIPY_CLIENT_SECRET': ''}):
            res = self.client.get('/api/spotify/search/?q=test')
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.data)


@override_settings(CHANNEL_LAYERS=TEST_CHANNEL_LAYERS)
class RoomConsumerTests(TransactionTestCase):
    def setUp(self):
        self.admin = CustomUser.objects.create_user('host', password='S3cure-pass!')
        self.guest = CustomUser.objects.create_user('guest', password='S3cure-pass!')
        self.room = Room.objects.create(name='Lofi', admin=self.admin)
        self.app = JWTAuthMiddleware(URLRouter(websocket_urlpatterns))

    def communicator(self, user=None):
        query = f'?token={AccessToken.for_user(user)}' if user else ''
        return WebsocketCommunicator(self.app, f'/ws/room/{self.room.id}/{query}')

    async def test_chat_uses_server_side_identity_and_persists(self):
        comm = self.communicator(self.guest)
        connected, _ = await comm.connect()
        self.assertTrue(connected)
        await comm.receive_json_from()  # own presence event

        await comm.send_json_to({'type': 'chat_message', 'content': 'hello', 'user_name': 'host', 'user_id': 1})
        msg = await comm.receive_json_from()
        self.assertEqual(msg['user_name'], 'guest')
        self.assertEqual(msg['user_id'], self.guest.id)
        await comm.disconnect()
        self.assertTrue(await ChatMessage.objects.filter(content='hello', user=self.guest).aexists())

    async def test_anonymous_cannot_chat_and_non_admin_cannot_sync(self):
        comm = self.communicator(self.guest)
        await comm.connect()
        await comm.receive_json_from()
        await comm.send_json_to({'type': 'playback_sync', 'track_id': 'x', 'is_playing': True})
        self.assertTrue(await comm.receive_nothing(timeout=0.2))
        await comm.disconnect()

        anon = self.communicator()
        await anon.connect()
        await anon.receive_json_from()
        await anon.send_json_to({'type': 'chat_message', 'content': 'spam'})
        self.assertTrue(await anon.receive_nothing(timeout=0.2))
        await anon.disconnect()

    async def test_unknown_room_is_rejected(self):
        comm = WebsocketCommunicator(self.app, '/ws/room/99999/')
        connected, _ = await comm.connect()
        self.assertFalse(connected)


class TokenExpiryTests(TestCase):
    def test_is_expired(self):
        from .models import SpotifyToken
        user = CustomUser.objects.create_user('u', password='S3cure-pass!')
        token = SpotifyToken(user=user, access_token='a', refresh_token='r',
                             expires_at=timezone.now() - timedelta(seconds=1))
        self.assertTrue(token.is_expired())
