from django.db import migrations, models


def backfill_secret_hash(apps, schema_editor):
    Player = apps.get_model("game_engine", "Player")
    from game_engine.player_secret import hash_player_secret

    for player in Player.objects.all():
        if player.player_secret and not player.player_secret_hash:
            player.player_secret_hash = hash_player_secret(str(player.player_secret))
            player.save(update_fields=["player_secret_hash"])


def reverse_backfill_secret_hash(apps, schema_editor):
    Player = apps.get_model("game_engine", "Player")
    Player.objects.update(player_secret_hash=None)


class Migration(migrations.Migration):

    dependencies = [
        ("game_engine", "0016_add_match_type_to_room"),
    ]

    operations = [
        migrations.AddField(
            model_name="player",
            name="player_secret_hash",
            field=models.CharField(blank=True, max_length=255, null=True),
        ),
        migrations.RunPython(backfill_secret_hash, reverse_backfill_secret_hash),
    ]
