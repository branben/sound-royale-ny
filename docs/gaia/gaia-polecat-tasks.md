# GAIA Polecat Complex Tasks

> **BACKLOG** — These are unstarted tasks for the GAIA polecat worker. None are in progress.
> Before enqueuing, check `docs/E2E_TASK_LIST.md` for E2E-related work and `docs/MVP_SCOPE.md` for scope.

This document defines high-value complex tasks for the GAIA polecat worker.

---

## Task 1: Implement Real-Time WebSocket Connection

**Priority**: HIGH  
**Domain**: Frontend + Backend Integration

### Context
- Backend has WebSocket consumers in `backend/game_engine/consumers.py`
- Frontend has placeholder `useWebSocketConnection` hook in `src/context/GameContext.tsx`
- Game state updates require polling/refresh instead of real-time push

### Requirements
1. Implement actual WebSocket connection in a custom hook
2. Connect to `ws://[host]/ws/game/[room_id]/?player_id=[id]&player_secret=[secret]`
3. Handle incoming message types: `game_update`, `bingo_achievement`, `victory_celebration`
4. Integrate with existing GameContext for state updates
5. Handle reconnection logic for dropped connections
6. Test with backend GameConsumer broadcasts

### Files to Modify
- `src/context/GameContext.tsx` - Add WebSocket provider
- `src/services/` - Create websocket.ts service if needed

---

## Task 2: Audio Playback System for Bingo Tiles

**Priority**: HIGH  
**Domain**: Frontend + Media

### Context
- Tile model has `audio_file` and `audio_url` fields in `backend/game_engine/models.py`
- BingoTile component in `src/components/game/BingoTile.tsx` displays genre
- No audio playback UI/functionality currently implemented

### Requirements
1. Add audio player UI to BingoTile component
2. Implement play/pause toggle for pending tiles
3. Handle audio loading states and errors
4. Support both local file uploads and remote URLs
5. Add visual audio waveform or progress indicator
6. Ensure only one audio plays at a time (muted when another starts)

### Files to Modify
- `src/components/game/BingoTile.tsx` - Add audio controls
- `src/types/game.ts` - Add audio-related types if needed

---

## Task 3: Producer Interface - Music Upload Flow

**Priority**: MEDIUM  
**Domain**: Frontend + Backend API

### Context
- Producer page exists at `src/pages/Producer.tsx`
- Tile model supports `audio_file` uploads
- Need complete flow for producers to upload music for game tiles

### Requirements
1. Investigate current Producer.tsx implementation
2. Design and implement music upload interface
3. Create API endpoint or use existing for file uploads
4. Map uploaded audio to genre tiles in rooms
5. Add progress indicators and error handling
6. Test upload flow end-to-end

### Files to Investigate
- `src/pages/Producer.tsx`
- `backend/game_engine/views.py` - Check for upload endpoints
- `backend/game_engine/models.py` - Tile audio_file field

---

## Task 4: Game Round Transitions and Reset Flow

**Priority**: MEDIUM  
**Domain**: Frontend + Backend

### Context
- Backend Room model has `current_round` field and `reset_game` action
- Frontend Room.tsx may not handle round transitions properly
- Winner celebration needs to lead to next round or game end

### Requirements
1. Add round transition UI (between rounds)
2. Handle "Next Round" button for host
3. Display round number and scores between rounds
4. Implement complete reset flow: clear tiles → regenerate boards → notify players
5. Handle case where host leaves during transition
6. Add round history/score tracking

### Files to Modify
- `src/pages/Room.tsx` - Add round transition UI
- `src/context/GameContext.tsx` - Add round state management
- `src/components/game/` - Add score display components

---

## Task 5: Spectator Experience Enhancement

**Priority**: MEDIUM  
**Domain**: Frontend UX

### Context
- SpectatorView exists at `src/components/game/SpectatorView.tsx`
- Basic multi-board display but may lack polish

### Requirements
1. Enhance spectator dashboard with:
   - Live player count and status
   - Current round and game phase indicator
   - Leaderboard showing bingo progress per player
   - Quick jump to specific player's board
2. Add "Request to Play" button for spectators wanting to join
3. Optimize rendering for many simultaneous players
4. Add spectator-specific notifications (game start, round end)

### Files to Modify
- `src/components/game/SpectatorView.tsx`
- `src/pages/Room.tsx` - Spectator-specific UI sections

---

## Task 6: Player Reconnection Handling

**Priority**: HIGH  
**Domain**: Frontend + Backend

### Context
- Backend tracks `is_connected` on Player model
- `rejoin_game` endpoint exists in views.py
- No frontend handling for reconnection after tab close/network drop

### Requirements
1. Detect when player loses connection (WebSocket close)
2. Show reconnection UI with automatic retry
3. Implement rejoin logic using stored player_secret
4. Handle case where room state changed during absence (game ended, round advanced)
5. Preserve local board state during brief disconnects
6. Add reconnection status to UI (connected/reconnecting/offline)

### Files to Modify
- `src/context/UserContext.tsx` - Store reconnection state
- `src/context/GameContext.tsx` - Handle reconnection updates
- `src/pages/Room.tsx` - Reconnection UI

---

## Task 7: Bingo Animation and Visual Effects

**Priority**: LOW  
**Domain**: Frontend UI/UX

### Context
- Backend sends `bingo_achievement` and `victory_celebration` messages
- Frontend should celebrate when player wins

### Requirements
1. Add celebration animation when bingo achieved
2. Implement line highlight animation on BingoBoard
3. Add victory screen with confetti or special effects
4. Animate tile status transitions (empty → pending → complete)
5. Add sound effects (optional - check audio system first)
6. Make animations configurable (reduce motion support)

### Files to Modify
- `src/components/game/BingoBoard.tsx`
- `src/components/game/BingoTile.tsx`
- `src/pages/Room.tsx` - Victory celebration overlay

---

## Task 8: Comprehensive E2E Test Suite Expansion

**Priority**: MEDIUM  
**Domain**: Testing

### Context
- Existing tests cover basic flows in `tests/e2e/`
- Missing: WebSocket real-time tests, multi-player scenarios, edge cases

### Requirements
1. Add WebSocket connection and message handling tests
2. Test multi-player scenarios (2+ players in same room)
3. Test spectator mode flows
4. Add tests for:
   - Player reconnection
   - Host migration (host leaves, new host assigned)
   - Round transitions
   - Audio upload and playback
5. Add performance tests for many players
6. Improve test fixtures for shared game state

### Files to Create/Modify
- `tests/e2e/websocket.spec.ts` - New file
- `tests/e2e/multiplayer.spec.ts` - New file
- `tests/e2e/utils/` - Expand fixtures

---

## Task 9: Type Safety and Code Quality Audit

**Priority**: MEDIUM  
**Domain**: Code Quality

### Context
- Project uses TypeScript but may have any types or gaps
- AGENTS.md prohibits `as any`, `@ts-ignore`, `@ts-expect-error`

### Requirements
1. Run `npx tsc --noEmit` to find type errors
2. Fix all TypeScript errors
3. Add strict types where loose (especially API responses)
4. Ensure backend serializers match frontend types
5. Add type guards for game state transitions
6. Document complex type patterns

### Files to Investigate
- All `.ts` and `.tsx` files in `src/`
- `src/types/game.ts` - Ensure completeness

---

## Task 10: Player Ready System and Lobby Improvements

**Priority**: MEDIUM  
**Domain**: Frontend + Backend

### Context
- Lobby.tsx shows player list but ready system may be incomplete
- Need proper ready flow before game can start

### Requirements
1. Add player ready/unready functionality
2. Show visual indicator for ready status (checkmark, color)
3. Disable "Start Game" until minimum players ready (≥2)
4. Add countdown timer option before game starts
5. Handle player disconnect during ready state
6. Add host kick/remove player capability

### Files to Modify
- `src/pages/Lobby.tsx` - Ready UI
- `backend/game_engine/views.py` - Ready API if needed
- `src/context/GameContext.tsx` - Ready state

---

## Investigation Tasks (Smaller Scope)

These tasks focus on understanding and documenting before implementation:

### Task 11: Document API Response Shapes
Create documentation or TypeScript types for all API endpoints

### Task 12: Audit Game State Transitions
Map all possible game states and valid transitions

### Task 13: Security Audit - playerSecret Handling
Ensure player_secret is never exposed in logs or client-side storage improperly
