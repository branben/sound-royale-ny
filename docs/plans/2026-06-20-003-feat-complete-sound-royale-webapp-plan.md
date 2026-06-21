---
title: "feat: Complete Sound Royale webapp — all user flows"
type: feat
status: completed
created: 2026-06-20
---

# feat: Complete Sound Royale webapp — all user flows

## Problem

The casual/ranked match feature is built but the surrounding user flows are incomplete or missing. The app needs to be usable end-to-end: players need to see leaderboards, admins need to manage themes, new users need onboarding, disconnected hosts need migration, and match results need proper display.

## Scope

### In scope
1. **Casual & Ranked Match Flow** — already built, needs final integration verification
2. **Leaderboard with Player Profiles** — global leaderboard with search, genre performance radar, player profile modal
3. **Admin Panel** — theme rotation management (PIN-gated)
4. **Host Migration** — automatic host transfer when host disconnects mid-game
5. **Game Tutorial / Onboarding** — first-time player walkthrough (producer + spectator paths)
6. **Spectator Share/Invite** — copy room link, QR code generation
7. **Audio Playback** — play uploaded beats on completed tiles
8. **Game Over / Play Again UX** — end-of-match screen with scores, ELO delta, play again button

### Out of scope
- Player admin (banning, title management) — separate admin concern
- Mobile native app — responsive web only
- E2E test infrastructure — separate effort
- Custom genre creation by users
- Real-time audio streaming during production phase

## Key Technical Decisions

1. **Leaderboard data**: Uses existing `GET /api/players/` endpoint which returns all players. Sorted by ELO descending, then title priority, then name. Genre performance fetched per-player via `GET /api/players/:id/genre-performance/`.

2. **Host migration**: Triggered on WebSocket disconnect (not explicit leave). Server promotes the first non-spectator producer who is still connected. Broadcasts `host_migrated` WS message. Client shows `HostMigrationIndicator` banner.

3. **Tutorial persistence**: Uses `localStorage.getItem('hasSeenGameTutorial')`. Per-device (not per-user). Shown only on first game start. Separate flows for producer (4 steps) and spectator (2 steps).

4. **Audio playback**: Uses HTML5 `<audio>` element. Audio files served from S3/media URL. Play button appears on tiles with `status === 'complete'` and `audioUrl` set.

5. **Game Over screen**: Shows when `gameState.status === 'finished'`. Displays winner name (ranked) or "Match Over" (casual), all players' scores, ELO deltas, and Play Again button (host only). Auto-reset after 5 seconds.

## Implementation Units

### U1. Leaderboard page with player profiles

**Goal**: Players can view global rankings, search by name, and click any player to see detailed stats.

**Files:**
- `src/pages/Leaderboard.tsx` — already exists, needs verification
- `src/components/game/PlayerProfileModal.tsx` — already exists, needs verification
- `src/components/game/PlayerStatsRadar.tsx` — already exists, needs verification
- `src/components/game/EloDeltaDisplay.tsx` — already exists, needs verification

**Approach:**
- Verify existing Leaderboard page works with real API data
- Verify PlayerProfileModal opens from leaderboard click, shows genre performance radar
- Add navigation link from lobby header to leaderboard
- Verify ELO delta display appears after ranked match ends

**Patterns to follow:** Existing `Leaderboard.tsx` patterns (search, sort, filter)

**Test scenarios:**
- Happy path: Navigate to `/leaderboard` → see ranked players by ELO
- Search: Type "Host" → filtered to matching players
- Profile: Click player → modal with genre performance radar
- Empty: No players → "No players yet" message
- Error: API fails → error toast, retry button

**Verification:** Navigate to `/leaderboard`, verify data loads, click player profile

---

### U2. Admin panel — theme rotation management

**Goal**: Admin users can manage theme rotations via PIN-gated UI.

**Files:**
- `src/pages/ThemeAdmin.tsx` — already exists, needs verification
- `backend/game_engine/views.py` — admin PIN verification endpoint
- `backend/game_engine/serializers.py` — theme rotation serializer

**Approach:**
- Verify existing ThemeAdmin page works end-to-end
- Verify PIN flow: enter PIN → verify → unlock admin UI
- Verify theme rotation CRUD: view, edit 9 genres, save
- Verify validation: exactly 9 genres, all unique, all non-empty
- Verify error handling: invalid PIN, save failure

**Patterns to follow:** Existing `ThemeAdmin.tsx` patterns

**Test scenarios:**
- Happy path: Enter correct PIN → unlock → edit rotation → save → success toast
- Invalid PIN: Enter wrong PIN → error toast, stay locked
- Validation: Duplicate genres → error, < 9 genres → error
- Save failure: Backend error → error toast with message

**Verification:** Navigate to `/admin/themes`, enter PIN, edit a rotation, save

---

### U3. Host migration on disconnect

**Goal**: When the host disconnects mid-game, the game continues with a new host.

**Files:**
- `backend/game_engine/consumers.py` — WebSocket disconnect handler
- `backend/game_engine/models.py` — Player model `is_host` field
- `src/components/game/HostMigrationIndicator.tsx` — already exists
- `src/context/GameContext.tsx` — handle `host_migrated` WS message

**Approach:**
- On WebSocket disconnect, check if disconnected player `is_host`
- If yes, promote first connected non-spectator producer to host
- Broadcast `host_migrated` WS message with new host name
- Client shows `HostMigrationIndicator` banner
- New host gets Start/Reset buttons

**Patterns to follow:** Existing `player_joined`/`player_left` WS message handling

**Test scenarios:**
- Happy path: Host disconnects → another producer becomes host → banner shows
- No producers left: Host disconnects, only spectators remain → game pauses
- Host reconnects: Host reconnects before migration → no migration occurs
- Multiple rapid disconnects: Only one migration event

**Verification:** Open room with 2 producers, disconnect host, verify new host assigned

---

### U4. Game tutorial / onboarding

**Goal**: First-time players see a step-by-step tutorial explaining how to play.

**Files:**
- `src/components/game/GameTutorial.tsx` — already exists
- `src/pages/Room.tsx` — trigger tutorial on first game start

**Approach:**
- Verify existing `GameTutorial` component renders correctly
- Producer path: 4 steps (upload beat, mark complete, voting, bingo)
- Spectator path: 2 steps (watch, vote)
- Shown when `gameState.status === 'playing'` and `!localStorage.getItem('hasSeenGameTutorial')`
- Dismiss button sets localStorage flag
- Step navigation with Next/Dismiss buttons

**Patterns to follow:** Existing `GameTutorial.tsx` patterns

**Test scenarios:**
- First-time producer: Game starts → tutorial overlay → step through → dismiss
- First-time spectator: Game starts → spectator tutorial → dismiss
- Returning player: `hasSeenGameTutorial` set → no tutorial
- Dismiss mid-tutorial: Remaining steps skipped, flag set

**Verification:** Clear localStorage, join game as producer, verify tutorial appears

---

### U5. Spectator share/invite flow

**Goal**: Players can share room links for others to join as spectators.

**Files:**
- `src/components/game/ShareInvite.tsx` — may exist or needs creation
- `src/pages/Room.tsx` — integrate share button in lobby

**Approach:**
- Share button in lobby header copies room URL to clipboard
- URL format: `${origin}/room/${roomCode}?spectator=1`
- Show toast confirmation on copy
- Fallback for browsers without clipboard API

**Patterns to follow:** Existing copy-to-clipboard patterns in codebase

**Test scenarios:**
- Happy path: Click share → URL copied → toast "Link copied"
- Fallback: Clipboard API unavailable → show URL text for manual copy
- Spectator link: URL includes `?spectator=1` param

**Verification:** Click share button in lobby, verify URL copied to clipboard

---

### U6. Audio playback on tiles

**Goal**: Players can listen to uploaded beats on completed tiles.

**Files:**
- `src/components/game/AudioPlayer.tsx` — may exist or needs creation
- `src/components/game/BingoTile.tsx` — add play button for complete tiles with audio

**Approach:**
- When tile has `status === 'complete'` and `audioUrl`, show play/pause button
- Use HTML5 `<audio>` element for playback
- Only one tile plays at a time (stop others when new one starts)
- Show loading state while audio buffers

**Patterns to follow:** Existing tile click → drawer patterns

**Test scenarios:**
- Play: Click play on complete tile → audio plays
- Pause: Click pause → audio stops
- Switch: Play tile A, then click tile B → A stops, B plays
- No audio: Complete tile without `audioUrl` → no play button shown

**Verification:** Upload a beat, mark tile complete, click play button

---

### U7. Game Over screen with Play Again

**Goal**: When a match ends, show all players' results with option to play again.

**Files:**
- `src/components/game/GameOverScreen.tsx` — already exists
- `src/components/game/WinnerAnnouncement.tsx` — already exists
- `src/components/game/PlayAgainButton.tsx` — already exists
- `src/components/game/TotalScoreDisplay.tsx` — already exists
- `src/pages/Room.tsx` — integrate game over overlay

**Approach:**
- GameOverScreen shows when `gameState.status === 'finished'`
- Ranked: Show winner name, ELO delta, all player scores
- Casual: Show "Match Over", all player scores, no winner
- Play Again button (host only) triggers `resetGame`
- Auto-reset after 5 seconds if host doesn't click
- All players see the overlay (spectators too)

**Patterns to follow:** Existing `GameOverScreen.tsx` and `WinnerAnnouncement.tsx` patterns

**Test scenarios:**
- Ranked with bingo: Winner shown, ELO delta displayed
- Casual (rounds complete): "Match Over" shown, no winner
- Host clicks Play Again → new match starts
- Non-host: No Play Again button visible
- Auto-reset: 5 seconds after match end → new match starts
- Spectator sees overlay but no Play Again button

**Verification:** Complete a match, verify Game Over screen shows correct data

---

### U8. Integration verification — all flows work together

**Goal**: Verify all flows work end-to-end in a single session.

**Files:** All of the above

**Approach:**
- Create room → verify lobby shows Casual badge
- Join second player → verify both see each other
- Start game → verify tutorial shows for first-time player
- Upload beats → verify audio playback works
- Join 3 spectators → verify badge changes to Ranked
- Complete match → verify Game Over screen with scores
- Click Play Again → verify new match starts as Ranked
- Navigate to leaderboard → verify player data appears
- Navigate to admin → verify PIN flow works

**Test scenarios:**
- Full casual match: 2 producers, no spectators, 10 rounds, game ends
- Full ranked match: 2 producers, 3+ spectators, bingo, ELO updates
- Host migration: Host disconnects mid-match, game continues
- New user: First game shows tutorial, subsequent games don't

**Verification:** Manual walkthrough of all flows in a single session

---

## System-Wide Impact

- **Backend**: New WS message type `host_migrated`, consumer disconnect handler changes
- **Frontend**: 8 components/pages verified or enhanced, new navigation links
- **WebSocket**: New message type added to `GameSocketMessage` union
- **Tests**: Existing tests continue to pass, new tests for host migration

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Leaderboard API returns too many players | Add pagination (existing `getAllPlayers` may already support it) |
| Host migration causes brief game pause | Migration happens between rounds, not mid-round |
| Tutorial shows for returning users after localStorage clear | Acceptable — tutorial is short and helpful |
| Audio playback fails on large files | HTML5 audio handles buffering, show loading state |
| Game Over auto-reset triggers before user sees results | 5-second countdown is enough, host can reset immediately |

## Verification

1. `npx tsc --noEmit` — clean
2. `npx eslint src/pages/Room.tsx src/components/game/GameOverScreen.tsx` — no new errors
3. `cd backend && python3 manage.py test game_engine` — all pass
4. Manual: Full game walkthrough (create → play → spectate → reset → leaderboard → admin)
