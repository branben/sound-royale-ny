# Fixture/Frontend Alignment Audit

> **STATUS: RESOLVED** — Root cause found and fixed (2026-04-20). GameContext now reads
> injected `__E2E_GAME_STATE__` from localStorage. Smoke tests pass 3/3 consecutively.
> This document is kept as investigation history. See `docs/E2E_TASK_LIST.md` for current work.

**Source of truth:** `docs/MVP_SCOPE.md`  
This audit documented gaps between test expectations and frontend reality. After deeper investigation, the tests were written for a UI that doesn't match the current frontend (e.g., smoke tests expect "Join Room" button on homepage, frontend shows "Spectator view is E2E-only").

## Root Cause Analysis (COMPLETED)

**Primary Issue:** API mocking alone is insufficient for React component rendering.

The E2E tests mock the API response via `page.route()`, but the frontend uses:
1. `useGame()` context hook for game state
2. `useUser()` context hook for player session
3. WebSocket connections for real-time updates

The API response populates `room` (RoomResponse), but `gameState` comes from a separate context that isn't populated by the API mock. This causes PlayerView to show "Loading game..." indefinitely.

**Evidence:**
```
Body text: Sound RoyaleBack to LobbyPlayers (1)Player1...Your BoardLoading game...
```

The Room component renders (showing Players, Game Status), but PlayerView shows loading state because `playerData` from `useGame()` is null.

## Cleanup Completed

### Category B — CUT (deleted)
- `producer-flow.spec.ts` → Voting Phase describe block (producers don't vote, only spectators)
- `host-kick.spec.ts` → "You were removed" notification test (not in MVP)

### Category C — DEFERRED (moved to `_future/` with `.skip`)
- `websocket.spec.ts` → entire file (WebSocket infrastructure not mocked)
- `elo-rating.spec.ts` → delta-specific assertions only (ELO rating/stats display is Phase 4A MVP scope)
- `producer-flow.spec.ts` → Bingo Detection describe block (needs WebSocket events)
- `spectator.spec.ts` → Real-time Updates describe block
- `full-game.spec.ts` → round progression tests (round display is SpectatorView-only)
- `full-game.spec.ts` → "3 rounds" test (no UI shows total rounds)
- `full-game.spec.ts` → "Game Over" label test (frontend says "Done")

### Category A — Label mismatches (deferred)
- "Game Over" vs "Done" / "Battle Completed"
- "playing" vs "Live"
- Round numbers in PlayerView

## Mock State Functions (tests/e2e/utils/game-fixtures.ts)

| Function | Status | RoundState | Expected UI Components |
|----------|--------|-----------|----------------------|
| `createMockLobbyState` | 'lobby' | null | Lobby card with join buttons, room code display |
| `createMockPlayingState` | 'playing' | createMockRoundState | GameInfo, PlayerView/SpectatorView, BingoBoard, TurnTimer, ScoreDisplay |
| `createMockVotingState` | 'playing' | createMockRoundState (votingOpen=true) | GameInfo, PlayerView/SpectatorView, VotingPanel, ScoreDisplay |
| `createMockFinishedState` | 'finished' | createMockRoundState (winner set) | GameInfo, PlayerView/SpectatorView, ScoreDisplay (with winner badge) |

## Frontend Rendering Logic (src/pages/Room.tsx)

### gameState.status === 'lobby'
- Renders: Lobby card with join buttons
- Shows: Room code, current round
- Conditions: None specific

### gameState.status !== 'lobby'
- Renders: GameInfo + (SpectatorView OR PlayerView)
- Conditions: Based on userSession.isSpectator

### PlayerView (src/components/game/PlayerView.tsx)
- Always renders: ConnectionStatus, ScoreDisplay
- If gameState.status === 'playing': TurnIndicator
- If gameState.roundState?.currentTileGenre && gameState.status === 'playing': BattleTile
- Otherwise: BingoBoard
- UploadDrawer (when tile selected)
- BingoNotification (when bingo achieved)

### SpectatorView (src/components/game/SpectatorView.tsx)
- Always renders: Header with game phase, Leaderboard
- If voting open: VotingPanel
- If spectator: Request to Play button

## Identified Gaps

### Gap 1: Lobby State Rendering
**Mock State:** `createMockLobbyState` → status: 'lobby'
**Expected UI:** Lobby card with join buttons
**Test Failure:** `data-testid="lobby"` not found in tests
**Root Cause:** Lobby.tsx is a separate page, not rendered in Room.tsx. Tests navigate to `/room/${gameState.id}` but lobby state should render the lobby UI within Room.tsx or redirect to Lobby.tsx.

### Gap 2: Playing State - Game Board Not Rendering
**Mock State:** `createMockPlayingState` → status: 'playing'
**Expected UI:** BingoBoard with tiles
**Test Failure:** `data-testid="game-board"` not found
**Root Cause:** `createMockRoundState` sets `currentTileGenre = 'Rock'` by default. PlayerView.tsx has conditional logic:
```typescript
{gameState.roundState?.currentTileGenre && gameState.status === 'playing' ? (
  <BattleTile genre={gameState.roundState.currentTileGenre} ... />
) : (
  <BingoBoard ... />
)}
```
When `currentTileGenre` is set, BattleTile renders instead of BingoBoard. Tests expect BingoBoard but fixtures trigger BattleTile rendering.

**Fix Options:**
- Option A: Update `createMockRoundState` to set `currentTileGenre = undefined` by default
- Option B: Update tests to expect BattleTile when currentTileGenre is set
- Option C: Update frontend to show BingoBoard alongside BattleTile

**Recommendation:** Option A - update fixture default to not set currentTileGenre, allowing tests to explicitly set it when testing BattleTile flow

### Gap 3: Playing State - Timer Not Rendering
**Mock State:** `createMockPlayingState` → status: 'playing'
**Expected UI:** TurnTimer component
**Test Failure:** `data-testid="timer"` not found
**Root Cause:** TurnTimer is imported in PlayerView.tsx but never actually rendered. The component exists at `src/components/game/TurnTimer.tsx` with `data-testid="timer"` added, but there's no `<TurnTimer>` JSX anywhere in the codebase. Only TurnIndicator is rendered for playing state.

**Fix Options:**
- Option A: Add TurnTimer to PlayerView.tsx for playing state
- Option B: Add TurnTimer to GameInfo component
- Option C: Remove timer tests if timer UI is not implemented

**Recommendation:** Option A - add TurnTimer to PlayerView.tsx when gameState.status === 'playing'

### Gap 4: Playing State - Voting Panel Not Rendering
**Mock State:** `createMockVotingState` → status: 'playing', votingOpen: true
**Expected UI:** VotingPanel component
**Test Failure:** `data-testid="voting-panel"` not found
**Root Cause:** VotingPanel is only rendered in SpectatorView (line 170), not PlayerView. Tests that join as players expect to see VotingPanel, but the frontend only shows it for spectators.

**Fix Options:**
- Option A: Add VotingPanel to PlayerView when voting is open
- Option B: Update tests to join as spectators when testing voting
- Option C: Remove voting tests for players

**Recommendation:** Option B - update tests to join as spectators when testing voting flow, as voting is a spectator feature

### Gap 5: Finished State - Score Display Not Rendering
**Mock State:** `createMockFinishedState` → status: 'finished'
**Expected UI:** ScoreDisplay with winner badge
**Test Failure:** `data-testid="score-display"` not found
**Root Cause:** ScoreDisplay is in PlayerView and does render for finished state (line 132: `hasWon={gameState.status === 'finished' && gameState.winner === playerData.id}`). However, tests may be failing because:
1. Player data might not have scoreInfo populated in fixtures
2. Player might not be the winner (hasWon would be false)
3. PlayerView might not be rendering at all (if user is spectator)

**Fix Options:**
- Option A: Ensure createMockFinishedState sets scoreInfo for all players
- Option B: Ensure tests join as the winner player
- Option C: Add ScoreDisplay to SpectatorView for finished state

**Recommendation:** Option A - ensure fixtures populate scoreInfo for all players in finished state

## Pre-Phase 0 Attempt Results

**Fixes Applied:**
1. Updated `createMockRoundState` to set `currentTileGenre = undefined` by default (Gap 2)
2. Added TurnTimer to PlayerView.tsx for playing state (Gap 3)
3. Updated `createMockFinishedState` to populate scoreInfo for all players (Gap 5)

**Test Results (producer-flow.spec.ts):**
Tests still failing with same errors:
- `data-testid="bingo-tile"` resolves to 0 elements (BingoBoard not rendering)
- `data-testid="voting-panel"` not found (VotingPanel only in SpectatorView, tests join as players)
- `data-testid="timer"` not found (TurnTimer added but may not be rendering in test flow)
- `text=BINGO!`, `text=Rock`, `text=1 vote` all not found

**Root Cause Analysis:**
The fixture fixes alone are insufficient. Deeper issues exist:

1. **API mocking may not be reaching frontend**: Tests set up `page.route('**/api/**', ...)` but frontend may fetch from different endpoints or the mock may not match real API shape
2. **WebSocket state not mocked**: Frontend uses `useWebSocketConnection()` which may overwrite the mocked game state
3. **Test expectations mismatch frontend architecture**: VotingPanel only exists in SpectatorView, but tests expect players to see it
4. **Fixture transformation may lose data**: `toRoomResponse` transforms GameStateData to RoomResponse, but the frontend's `fetchRoom` may not populate `roundState` (tiles, voting, timer) from this response

## Recommended Next Steps

**Option 1: Align tests with actual frontend (recommended)**
1. Run each test individually with `--headed` to see what the frontend actually renders
2. Update tests to match actual frontend behavior
3. Remove tests for features that don't exist (player voting)
4. Add tests for features that do exist but aren't tested

**Option 2: Debug mock data flow**
1. Add console logging to Room.tsx to see what state is actually set
2. Verify `setGameState` receives the expected data shape
3. Check if WebSocket is overwriting mocked state
4. Ensure `roundState` is populated from API response

**Option 3: Rebuild E2E tests from scratch**
1. Start with smoke tests only
2. Build up test coverage incrementally as features solidify
3. Use actual user flows instead of mocked game states

**For GAIA x10 efficiency:**
- Option 1 is fastest path to green tests
- Option 2 is needed if tests are valuable as-is
- Option 3 is best long-term but requires rework

## What's Ready for GAIA

Pre-Phase 0 fixture alignment work identified concrete gaps that GAIA can work through. GAIA should:
1. Pick ONE gap at a time (e.g., Gap 4: VotingPanel)
2. Apply ONE fix approach (e.g., Option B: update tests to join as spectators)
3. Verify with targeted test run
4. Move to next gap

**Do NOT let GAIA:**
- Apply multiple fixes simultaneously
- Skip verification between fixes
- Mix fixture changes with frontend changes without clear separation
