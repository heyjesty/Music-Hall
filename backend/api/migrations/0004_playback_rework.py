"""Replace Spotify-only playback with server-authoritative room playback.

Tracks saved before this migration referenced Spotify and cannot be streamed,
so they are removed (along with any queue entries pointing at them).
"""

import django.db.models.deletion
import django.utils.timezone
from django.conf import settings
from django.db import migrations, models


def delete_legacy_tracks(apps, schema_editor):
    apps.get_model('api', 'Track').objects.all().delete()


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0003_track_album_art_track_spotify_id_and_more'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.RunPython(delete_legacy_tracks, migrations.RunPython.noop),
        migrations.DeleteModel(name='SpotifyToken'),

        # Track
        migrations.RemoveField(model_name='track', name='spotify_id'),
        migrations.RemoveField(model_name='track', name='source_url'),
        migrations.AddField(
            model_name='track',
            name='source',
            field=models.CharField(choices=[('audius', 'Audius'), ('itunes', 'Apple Music preview')],
                                   default='audius', max_length=20),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name='track',
            name='external_id',
            field=models.CharField(default='', max_length=100),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name='track',
            name='stream_url',
            field=models.URLField(default='', max_length=1000),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name='track',
            name='is_preview',
            field=models.BooleanField(default=False, help_text='True for 30-second previews'),
        ),
        migrations.AlterField(
            model_name='track',
            name='duration',
            field=models.IntegerField(help_text='Playable duration in milliseconds'),
        ),
        migrations.AddConstraint(
            model_name='track',
            constraint=models.UniqueConstraint(fields=('source', 'external_id'), name='unique_track_per_source'),
        ),

        # Room playback state
        migrations.RemoveField(model_name='room', name='current_track_id'),
        migrations.RemoveField(model_name='room', name='timestamp_ms'),
        migrations.RemoveField(model_name='room', name='last_sync_time'),
        migrations.AddField(
            model_name='room',
            name='current_track',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                                    related_name='+', to='api.track'),
        ),
        migrations.AddField(
            model_name='room',
            name='current_added_by',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                                    related_name='+', to=settings.AUTH_USER_MODEL),
        ),
        migrations.AddField(
            model_name='room',
            name='position_ms',
            field=models.IntegerField(default=0),
        ),
        migrations.AddField(
            model_name='room',
            name='state_changed_at',
            field=models.DateTimeField(default=django.utils.timezone.now),
        ),
        migrations.AddField(
            model_name='room',
            name='play_seq',
            field=models.PositiveIntegerField(default=0),
        ),
        migrations.AlterField(
            model_name='room',
            name='is_playing',
            field=models.BooleanField(default=False),
        ),

        # Queue
        migrations.AddField(
            model_name='playlist',
            name='added_by',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                                    to=settings.AUTH_USER_MODEL),
        ),
    ]
