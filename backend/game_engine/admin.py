from django.contrib import admin
from .models import Room, Player, Tile


@admin.register(Room)
class RoomAdmin(admin.ModelAdmin):
    list_display = ("id", "status", "current_round", "created_at")


@admin.register(Player)
class PlayerAdmin(admin.ModelAdmin):
    list_display = ("name", "room", "is_spectator")


@admin.register(Tile)
class TileAdmin(admin.ModelAdmin):
    list_display = ("id", "player", "room", "genre", "status", "position", "created_at")
