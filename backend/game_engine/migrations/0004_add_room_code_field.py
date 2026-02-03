# Generated migration to handle room code uniqueness

import uuid
import random
import string
from django.db import migrations, models


def generate_room_code():
    """Generate a unique 4-character room code"""
    return ''.join(random.choices(string.ascii_uppercase + string.digits, k=4))


def generate_unique_codes(apps, schema_editor):
    """Generate unique codes for existing rooms"""
    from django.db import connection
    with connection.cursor() as cursor:
        cursor.execute("SELECT id FROM game_engine_room")
        room_ids = [row[0] for row in cursor.fetchall()]
    
    used_codes = set()
    for room_id in room_ids:
        code = generate_room_code()
        while code in used_codes:
            code = generate_room_code()
        used_codes.add(code)
        
        # Update each room with a unique code
        with connection.cursor() as cursor:
            cursor.execute(
                "UPDATE game_engine_room SET code = %s WHERE id = %s",
                [code, str(room_id)]
            )


class Migration(migrations.Migration):

    dependencies = [
        ('game_engine', '0003_player_is_connected'),
    ]

    operations = [
        # First add the field as nullable to avoid unique constraint issues
        migrations.AddField(
            model_name='room',
            name='code',
            field=models.CharField(blank=True, max_length=4, null=True),
        ),
        # Generate unique codes for existing rooms
        migrations.RunPython(generate_unique_codes),
        # Then make the field unique and not null
        migrations.AlterField(
            model_name='room',
            name='code',
            field=models.CharField(blank=True, max_length=4, unique=True),
        ),
    ]