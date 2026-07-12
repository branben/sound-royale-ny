import io
from django.test import TestCase, Client
from django.core.files.uploadedfile import SimpleUploadedFile
from django.urls import reverse
from .models import Room, Player, Tile
from django.conf import settings

class AudioUploadTest(TestCase):
    def setUp(self):
        self.client = Client()
        # Create a room
        self.room = Room.objects.create(name='Test Room', status=Room.Status.PLAYING)
        # Create a player
        self.player = Player.objects.create(name='Test Player', room=self.room)
        # Endpoint for play_tile action
        # Create a tile for this player
        self.tile = Tile.objects.create(
            genre='rock',
            position=0,
            player=self.player,
            room=self.room,
            status=Tile.Status.EMPTY,
        )
        self.url = f'/api/tiles/{self.tile.id}/play_tile/'
        # Common auth data
        self.auth_data = {
            'player_id': str(self.player.id),
            'player_secret': self.player.player_secret,
        }

    def _post_audio(self, file_obj):
        data = self.auth_data.copy()
        data['audio_file'] = file_obj
        response = self.client.post(self.url, data, format='multipart')
        return response

    def test_valid_mp3_upload(self):
        mp3 = SimpleUploadedFile('test.mp3', b'\x00' * 1024, content_type='audio/mpeg')
        response = self._post_audio(mp3)
        self.assertEqual(response.status_code, 200)

    def test_valid_ogg_upload(self):
        ogg = SimpleUploadedFile('test.ogg', b'\x00' * 1024, content_type='audio/ogg')
        response = self._post_audio(ogg)
        self.assertEqual(response.status_code, 200)

    def test_valid_webm_ogg_upload(self):
        ogg = SimpleUploadedFile('test.ogg', b'\x00' * 1024, content_type='audio/webm')
        response = self._post_audio(ogg)
        self.assertEqual(response.status_code, 200)

    def test_invalid_mime_upload(self):
        jpg = SimpleUploadedFile('test.jpg', b'\x00' * 1024, content_type='image/jpeg')
        response = self._post_audio(jpg)
        self.assertEqual(response.status_code, 400)
        self.assertIn('Invalid file type', response.json().get('error', ''))

    def test_oversized_upload(self):
        size = settings.MAX_UPLOAD_SIZE + 1
        big_file = SimpleUploadedFile('big.mp3', b'\x00' * size, content_type='audio/mpeg')
        response = self._post_audio(big_file)
        self.assertEqual(response.status_code, 400)
        self.assertIn('File too large', response.json().get('error', ''))

    def test_missing_file(self):
        response = self.client.post(self.url, self.auth_data, format='multipart')
        self.assertEqual(response.status_code, 400)
        self.assertIn('No audio file', response.json().get('error', ''))

    def test_boundary_exact_limit(self):
        size = settings.MAX_UPLOAD_SIZE
        file = SimpleUploadedFile('exact.mp3', b'\x00' * size, content_type='audio/mpeg')
        response = self._post_audio(file)
        self.assertEqual(response.status_code, 200)

    def test_boundary_one_byte_over(self):
        size = settings.MAX_UPLOAD_SIZE + 1
        file = SimpleUploadedFile('over.mp3', b'\x00' * size, content_type='audio/mpeg')
        response = self._post_audio(file)
        self.assertEqual(response.status_code, 400)
        self.assertIn('File too large', response.json().get('error', ''))
