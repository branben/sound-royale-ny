from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("game_engine", "0004_add_room_code_field"),
    ]

    operations = [
        migrations.AddField(
            model_name="tile",
            name="room",
            field=models.ForeignKey(
                on_delete=models.CASCADE,
                related_name="tiles",
                to="game_engine.room",
                null=True,
            ),
        ),
        migrations.RunPython(
            lambda apps, schema_editor: assign_rooms_to_tiles(apps, schema_editor),
            reverse_code=lambda apps, schema_editor: None,
        ),
        migrations.AlterField(
            model_name="tile",
            name="room",
            field=models.ForeignKey(
                on_delete=models.CASCADE, related_name="tiles", to="game_engine.room"
            ),
        ),
        migrations.AlterUniqueTogether(
            name="tile",
            unique_together={("player", "room", "position")},
        ),
    ]


def assign_rooms_to_tiles(apps, schema_editor):
    Tile = apps.get_model("game_engine", "Tile")
    Player = apps.get_model("game_engine", "Player")

    tiles = Tile.objects.select_related("player").all()

    for tile in tiles:
        if tile.player and tile.player.room:
            tile.room = tile.player.room
            tile.save()
