---
title: "feat: Casual and Ranked match flow with spectator-driven transition"
type: feat
status: active
created: 2026-06-20
---

# feat: Casual and Ranked match flow with spectator-driven transition

## Problem

The current codebase only supports a single match mode: 2 producers compete until someone gets bingo. There is no concept of casual vs ranked matches, no spectator-count-driven mode transition, and no game-loop reset that starts a new match after one ends.

**User goal:** Casual matches (no bingo, play rounds, reset) can be played with 2+ producers. When 3+ spectators join, the room transitions to ranked mode (bingo enabled, winner declared). After any match ends, state resets for the next match.

## Scope

### In scope
- New `match_type` field on Room model (`casual` | `ranked`)
- Casual matches: no bingo detection, rounds play out, match ends after timer/rounds complete, no winner
- Ranked matches: triggered when 3+ spectators are present, bingo detection enabled, winner declared
- Automatic match reset after a match ends (lobby → new match)
- Frontend UI to show current match type and spectator count progress toward ranked
- WebSocket-driven mode transition (no page reload)
- Backend API: match type stored and propagated through serializers

### Out of scope
- ELO changes for ranked matches (existing ELO logic stays)
- Matchmaking queue (rooms are still manually created/joined)
- Leaderboard changes (existing leaderboard endpoint is sufficient)
- Multiple concurrent rooms per user
- Persistence of match history across resets

## Key Technical Decisions

1. **Match type is dynamic, not set at creation** — A room starts as `casual` and transitions to `ranked` when spectator count reaches 3. This is determined at match-start time, not room-creation time, because spectators join after the room exists.

2. **Casual matches skip bingo entirely** — `_resolve_bingo_and_winner` is only called when `match_type === 'ranked'`. Casual matches end when rounds complete or host resets.

3. **Reset re-evaluates match type** — After a match ends and resets, the new match's type is re-determined by current spectator count. A casual match that gained 3 spectators during play becomes ranked on reset.

4. **Spectator count is live** — The transition check happens at two points: (a) when starting a new match, (b) when resetting. No mid-match transition — the current match completes in whatever mode it started.

## Implementation Units

### U1. Add `match_type` to Room model and propagate through serializers

**Goal:** Backend can store and expose whether a match is casual or ranked.

**Files:**
- `backend/game_engine/models.py` — add `match_type` field to Room
- `backend/game_engine/serializers.py` — include `match_type` in Room serializer output
- `backend/game_engine/migrations/` — new migration

**Approach:**
- Add `match_type = models.CharField(max_length=10, choices=[('casual', 'Casual'), ('ranked', 'Ranked')], default='casual')` to Room model
- Add to RoomSerializer as a read-only field
- Default is `'casual'` — all existing rooms stay casual

**Patterns to follow:** Existing `status` and `theme` fields on Room model (lines 59-66 of models.py)

**Test scenarios:**
- Happy path: New room created → `match_type === 'casual'`
- Happy path: Room with 3 spectators → `start_game` sets `match_type === 'ranked'`
- Edge case: Room with 0 spectators → `match_type === 'casual'`
- Edge case: Room with 2 spectators → `match_type === 'casual'`

**Verification:** Django tests pass, migration applies cleanly

---

### U2. Update `start_game` to set match_type based on spectator count

**Goal:** When a game starts, the match type is determined by current spectator count.

**Files:** `backend/game_engine/views.py` — `start_game` action (line 758)

**Approach:**
- After the existing `len(players) < 2` check, count spectators: `spectator_count = room.players.filter(is_spectator=True).count()`
- Set `room.match_type = 'ranked' if spectator_count >= 3 else 'casual'` before saving
- Include `match_type` in the response payload

**Patterns to follow:** The existing `is_ranked` calculation in `_resolve_ranked_round` (line 1182)

**Test scenarios:**
- Happy path: Start game with 0 spectators → `match_type === 'casual'`
- Happy path: Start game with 3 spectators → `match_type === 'ranked'`
- Happy path: Start game with 5 spectators → `match_type === 'ranked'`

**Verification:** Django tests pass

---

### U3. Gate bingo detection on match type

**Goal:** Casual matches never trigger bingo. Ranked matches use existing bingo logic.

**Files:** `backend/game_engine/views.py` — `_resolve_bingo_and_winner` (line 362) and its call site (line 1746)

**Approach:**
- At the call site where `_resolve_bingo_and_winner` is invoked (around line 1746 in the tile-complete flow), add a guard: `if room.match_type == 'ranked':` before calling bingo resolution
- Casual matches simply skip bingo — tiles can still be marked complete, but no winner is declared via bingo

**Patterns to follow:** The existing `is_ranked` check in `_resolve_ranked_round` (line 1182)

**Test scenarios:**
- Happy path: Casual match, player completes 5 tiles in a row → no bingo, game continues
- Happy path: Ranked match, player completes 5 tiles in a row → bingo detected, game ends with winner
- Edge case: Casual match, all rounds complete → game finishes with no winner (existing `next_turn` logic at line 1318)

**Verification:** Django tests pass

---

### U4. Update `reset_game` to re-evaluate match type

**Goal:** When resetting for a new match, the new match's type reflects current spectator count.

**Files:** `backend/game_engine/views.py` — `reset_game` action (line 876)

**Approach:**
- After resetting tiles and setting `room.status = LOBBY` (line 919), re-evaluate spectator count
- Set `room.match_type = 'ranked' if spectator_count >= 3 else 'casual'`
- Include `match_type` in the reset response

**Patterns to follow:** The existing reset flow — this is an addition to the state reset block

**Test scenarios:**
- Happy path: Casual match with 0 spectators resets → new match is casual
- Happy path: Room that gained 3 spectators during play resets → new match is ranked
- Edge path: Room that lost spectators (some left) resets → new match is casual

**Verification:** Django tests pass

---

### U5. Add `matchType` to frontend GameState and propagate from backend

**Goal:** Frontend knows the current match type and can display it.

**Files:**
- `src/types/game.ts` — add `matchType?: 'casual' | 'ranked'` to `GameState`
- `src/context/GameContext.tsx` — map `match_type` from WebSocket payload into state (line 239)
- `src/pages/Room.tsx` — read `gameState.matchType` for UI display

**Approach:**
- Add optional field to `GameState` interface
- In `GameContext.tsx` WebSocket handler, extract `match_type` from payload and set `matchType` in state
- In `Room.tsx`, display a badge: "Casual" or "Ranked" based on `gameState.matchType`

**Patterns to follow:** How `spectatorCount` is already mapped from WebSocket (line 248 of GameContext.tsx)

**Test scenarios:**
- Happy path: Room with 0 spectators → UI shows "Casual"
- Happy path: Room with 3 spectators → UI shows "Ranked"
- Edge case: `matchType` undefined (old rooms) → defaults to "Casual"

**Verification:** TypeScript compiles, no new lint errors

---

### U6. Add spectator threshold indicator in lobby UI

**Goal:** Players can see how many more spectators are needed to unlock ranked mode.

**Files:** `src/pages/Room.tsx` — lobby section (around lines 645-710)

**Approach:**
- In the lobby view, show a progress indicator: "2/3 spectators for ranked mode" or "Ranked mode unlocked!"
- Only show this when `gameState.status === 'lobby'`
- Calculate: `currentSpectators = Object.values(gameState.players).filter(p => p.isSpectator).length`

**Patterns to follow:** Existing spectator count display in `GameInfo` component

**Test scenarios:**
- Happy path: Lobby with 0 spectators → shows "0/3 spectators for Ranked"
- Happy path: Lobby with 2 spectators → shows "2/3 spectators for Ranked"
- Happy path: Lobby with 3 spectators → shows "Ranked mode unlocked!"
- Edge case: Playing state → indicator hidden

**Verification:** TypeScript compiles, visual QA

---

### U7. Handle match-end and auto-reset flow

**Goal:** When a match ends (bingo in ranked, or rounds complete in casual), show results then auto-reset.

**Files:**
- `src/pages/Room.tsx` — add match-end detection and auto-reset trigger
- `src/context/GameContext.tsx` — handle `victory_celebration` and match-end states

**Approach:**
- When `gameState.status === 'finished'`, show a results overlay (winner for ranked, "Match Over" for casual)
- After a 5-second delay, auto-trigger `gameApi.resetGame(roomId, playerSecret)` to start next match
- The reset will re-evaluate match type based on current spectator count
- Host can also manually reset immediately via a button

**Patterns to follow:** Existing `handleStartGame` pattern (line 344) — API call → force refresh

**Test scenarios:**
- Happy path: Ranked match ends with bingo → shows winner → 5s countdown → new ranked match starts
- Happy path: Casual match ends (rounds complete) → shows "Match Over" → 5s countdown → new match starts (type based on current spectators)
- Edge case: Host clicks "Reset Now" → immediate reset, no countdown
- Edge case: Spectators join during countdown → next match type reflects updated count

**Verification:** TypeScript compiles, manual E2E test

---

## System-Wide Impact

- **Backend:** New field on Room model requires migration. Existing rooms default to `casual` — no data loss.
- **WebSocket:** `game_state_update` payload now includes `match_type` — backward-compatible since it's an optional field.
- **Frontend:** New UI elements (badge, progress indicator, results overlay) are additive — no existing UI removed.
- **Tests:** New backend tests for match type logic. Existing tests should still pass (default `casual` preserves current behavior).

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Migration conflicts with existing data | `match_type` has `default='casual'` — all existing rooms stay casual |
| Spectator count fluctuates during match | Match type is locked at match-start, not live-updated mid-match |
| Auto-reset triggers before user sees results | 5-second countdown with option to skip |
| Old clients don't send `match_type` | Field is optional in `GameState` — defaults to `casual` |

## Verification

1. `npx tsc --noEmit` — clean
2. `npx eslint src/pages/Room.tsx src/context/GameContext.tsx` — no new errors
3. `cd backend && python manage.py test game_engine` — all pass
4. `npm run test` — all pass
5. Manual E2E: Create room → join 2 producers → start game (casual) → play rounds → match ends → auto-reset
6. Manual E2E: Create room → join 2 producers → 3 spectators join → start game (ranked) → play until bingo → match ends → auto-reset
