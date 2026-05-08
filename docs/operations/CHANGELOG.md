# Sound Royale - Development Changelog

This document tracks all significant changes, the reasoning behind them, and the components affected. Use this for debugging and understanding the evolution of the codebase.

---

## 2026-01-07: Phase 0 - Interface Consolidation

### What Was Done
- Consolidated duplicate TypeScript interfaces into a single source of truth
- Added transformation utilities for backend ↔ frontend field name mapping

### Why We Did It
- **Problem**: `Player` and `Tile` interfaces were defined in both `src/types/game.ts` (with camelCase) and `src/services/api.ts` (with snake_case). This caused confusion about which to use and risked drift between definitions.
- **Solution**: Removed duplicates from `api.ts`, enhanced the canonical interfaces in `types/game.ts`, and created transformation functions.

### Files Changed
| File | Change |
|------|--------|
| `src/types/game.ts` | Added `playerSecret`, `isConnected`, `isSpectator` fields to `Player` interface |
| `src/services/api.ts` | Removed duplicate `Player` and `Tile` interfaces; added `transformPlayer()` and `transformTile()` utilities; now imports from `types/game.ts` |

### Components Potentially Affected
- Any component importing `Player` or `Tile` from `api.ts` (should now use re-export or import from `types/game.ts`)
- Future API responses should be passed through `transformPlayer()` for consistent field names

### Verification
- `npx tsc --noEmit` passed with no errors

---

## 2026-01-07: Phase 1 - Identity & Security

### What Was Done
- Added `player_secret` UUID field to Player model for secure identification
- Created `/rooms/{id}/rejoin_game/` endpoint for session recovery
- Updated frontend to save and use player credentials (playerSecret, playerId)
- Implemented automatic rejoin on page refresh

### Why We Did It
- **Imposter Problem**: Players were identified only by name, risking collisions (two "Steve"s)
- **Lost Seat Problem**: Refreshing the page or switching devices lost your session
- **Solution**: Each player gets a unique secret token on join. This token is stored locally and used to reclaim the session on reconnect.

### Files Changed
| File | Change |
|------|--------|
| `backend/game_engine/models.py` | Added `player_secret = models.UUIDField(default=uuid.uuid4)` |
| `backend/game_engine/serializers.py` | `PlayerCreateSerializer` now returns `player_secret`; `GameStateSerializer` includes `isSpectator` |
| `backend/game_engine/views.py` | Added `rejoin_game` action to `RoomViewSet` |
| `src/services/api.ts` | Added `rejoinRoom()` function; `joinRoom()` now transforms response |
| `src/pages/Lobby.tsx` | Clears `playerSecret`/`playerId` from localStorage on new room creation |
| `src/pages/Room.tsx` | Saves credentials on join; attempts rejoin on mount; clears stale credentials on failure |

### Database Migration
- Migration `0002_player_player_secret.py` was created and applied

### Components Potentially Affected
- All join flows now return and store player credentials
- Reconnection logic runs automatically on page load

### Verification
- `npx tsc --noEmit` passed with no errors
- Database migration applied successfully

---

## 2026-01-07: Fix Sync and Join Logic

### What Was Done
- Added WebSocket broadcast capability to backend REST views
- Removed auto-join logic from Lobby

### Why We Did It
- **Sync Problem**: When the host started a game, other players' screens didn't update because the backend wasn't broadcasting state changes.
- **Join Problem**: Clicking "Join" in the Lobby automatically added the user as a Player, skipping the choice to be a Spectator.

### Files Changed
| File | Change |
|------|--------|
| `backend/game_engine/views.py` | Added `broadcast_game_update()` helper; called it in `join_game`, `start_game`, `play_tile` |
| `src/pages/Lobby.tsx` | Removed `gameApi.joinRoom()` call from `handleJoinRoom`; now just navigates to room |

### Components Potentially Affected
- `Room.tsx` - Now shows join buttons since user isn't auto-joined
- All WebSocket consumers receive real-time updates

---

## 2026-01-07: Fix Ghost Player Issue

### What Was Done
- Updated room creation to accept player name during creation
- Prevented duplicate joining

### Why We Did It
- **Problem**: Backend created a "Host" player automatically during room creation. If the user then entered a different name, a second player was created (the "ghost").
- **Solution**: Let the host specify their name during room creation; hide join buttons if already in the player list.

### Files Changed
| File | Change |
|------|--------|
| `backend/game_engine/serializers.py` | Added `player_name` field to `RoomCreateSerializer`; popped it before creating Room model |
| `backend/game_engine/views.py` | Updated `perform_create` to use `player_name` from validated data |
| `src/services/api.ts` | Updated `createRoom()` to accept and send `playerName` |
| `src/pages/Lobby.tsx` | Now prompts for player name before creating room |
| `src/pages/Room.tsx` | Added check: if current user is in player list, show "You're in!" instead of join buttons |

### Components Potentially Affected
- `GameInfo.tsx` - Player list display
- Any component relying on player count

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-01-07 | All field mapping in `api.ts` | Centralizes transformation logic; keeps types/game.ts as pure interface definitions |
| 2026-01-07 | Host = first non-spectator player | Avoids database migration; uses existing ordered queries |
| 2026-01-07 | WebSocket auth via query params | Simple for current scope; can upgrade to token-based later |
| 2026-01-07 | Rejoin via POST `/rooms/{id}/rejoin/` | Explicit endpoint cleaner than overloading game_state |

---

## Upcoming Work (Phase 1-3)

See `phase_instructions.md` for detailed implementation steps.

- **Phase 1**: Identity & Security (player secrets, rejoin API)
- **Phase 2**: Presence & Cleanup (connection tracking, kick player)
- **Phase 3**: Game Lifecycle (reset/play again)
