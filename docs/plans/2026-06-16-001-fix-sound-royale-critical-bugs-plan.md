---
title: "fix: Sound Royale Critical Bug Audit & Staff Hiring Plan"
status: active
created: 2026-06-16
---

# Sound Royale Critical Bug Audit & Staff Hiring Plan

## Problem Frame

Sound Royale is a multiplayer music bingo game (React/TypeScript/Vite frontend + Django backend) with a functional MVP. However, 4 GitHub issues reveal critical bugs and quality gaps that block reliable gameplay and testing:

1. **Issue #57 (Bug):** Room creation fails — host stuck waiting, others cannot join
2. **Issue #58 (Enhancement):** E2E tests bypass real user flow via aggressive mocking
3. **Issue #36 (Enhancement):** Lobby frontend rendering difficulties
4. **Issue #38 (Chore):** `repo-local-gaia-polecat` branch has merge conflicts

This plan covers the code audit findings, the recommended fix approach, and the staff required to execute.

---

## Audit Findings

### Finding 1: Room Creation Flow — Host Detection Bug (Issue #57)

**Root Cause Analysis:**

The `handleCreateRoom` in `src/pages/Lobby.tsx:239-274` calls `roomApi.createRoom()`, which POSTs to `/api/rooms/`. The backend `views.py` creates a Room and a Player (host). The response returns `room_code`, `player_id`, `player_secret`.

The frontend then:
1. Sets `isHost(true)` locally (line 265) — this is **optimistic**, not server-confirmed
2. Navigates to `/room/{room_code}` (line 266)

In `Room.tsx`, the `fetchRoom()` function calls `roomApi.getRoom(roomCode)` to load room data. The `isHost` determination happens in `isHostFunction` (from `UserContext`) which checks if the current `userSession.playerId` matches the host player in the room data.

**The bug:** The `RoomResponse` serializer on the backend may not be returning `is_host` correctly, OR the `applyRoomData` function in `Lobby.tsx:129-153` reads `player.is_host ?? false` but the Room page's `fetchRoom` may not be applying the same transform. The `GameContext.tsx` `fetchRoom` function likely has a different data transform path that doesn't map `is_host` to the frontend's `Player` type correctly.

**Secondary issue:** The `handleJoin` flow (line 204-237) navigates directly to `/room/{roomCode}` without waiting for room data to load, so the Room page may render before the player session is fully established.

### Finding 2: E2E Test Mock Infrastructure (Issue #58)

**Root Cause Analysis:**

The test helpers in `tests/e2e/helpers.ts` provide:
- `setupPlayerSession()` — writes directly to `localStorage`, bypassing API calls entirely
- `mockApiRoutes()` — intercepts ALL `/api/**` requests via Playwright route handling
- `mockWebSocketConnection()` — replaces the native WebSocket with a mock

This means:
- Room creation flow is never tested end-to-end
- The `handleCreateRoom` → `roomApi.createRoom()` → navigate to room path is completely bypassed
- Bugs in the create/join/start flow (like Issue #57) are invisible to tests
- The `toRoomResponse()` converter in `game-fixtures.ts` transforms fixture data to API format, but this transform may not match the actual backend response shape

### Finding 3: Lobby Rendering (Issue #36)

The `Lobby.tsx` is 28,042 bytes — an enormous single component handling:
- Landing page, join flow, create flow
- Discord OAuth status checking
- Room browsing
- Onboarding modal
- Player name/room name inputs
- Theme selection

This monolithic structure makes rendering bugs hard to isolate and fix. The component needs decomposition.

### Finding 4: Merge Conflicts (Issue #38)

The `repo-local-gaia-polecat` branch has accumulated merge conflicts. This is a mechanical cleanup task.

---

## Key Technical Decisions

### KD-1: Fix Room Creation via Backend Response Contract
The fix for Issue #57 should start by verifying the backend `RoomSerializer` returns `is_host` on each player in the room detail response. The frontend's `fetchRoom` in `Room.tsx` and `applyRoomData` in `Lobby.tsx` must consistently map `is_host` → `isHost`. The optimistic `setIsHost(true)` in `handleCreateRoom` is acceptable but the Room page should derive host status from server data, not local state.

### KD-2: Add Integration Tests Alongside Existing E2E Tests
Rather than removing the existing mocked E2E tests (which provide value for UI component testing), add a **new integration test suite** that runs against a real backend. The existing tests in `tests/e2e/live/` already attempt this — they should be expanded to cover the create → join → start flow.

### KD-3: Decompose Lobby.tsx Before Fixing Rendering
Issue #36 should be addressed by extracting sub-components from `Lobby.tsx` before attempting to fix rendering bugs. This reduces risk and makes the rendering issues easier to isolate.

### KD-4: Merge Conflict Resolution is Mechanical
Issue #38 should be resolved by a single agent rebasing the branch against main and resolving conflicts. No architectural decisions needed.

---

## Staff Hiring Plan

### Reporting Structure

```
Royale CEO (you)
└── Lead Engineer (CTO)
    ├── Verifier Agent (QA)
    │   ├── Software Engineer 1 (Frontend)
    │   └── Software Engineer 2 (Backend)
    └── Janitor (DevOps/cleanup)
```

### Roles to Hire

| Role | Title | Responsibility | Reports To |
|------|-------|----------------|------------|
| **Lead Engineer** | CTO / Lead Eng. | Technical direction, code review, architecture decisions | CEO |
| **Verifier** | QA Lead | Test strategy, integration test suite, E2E test audit | Lead Engineer |
| **Software Engineer 1** | Frontend Engineer | Lobby.tsx decomposition, Room.tsx host detection fix, UI rendering | Verifier |
| **Software Engineer 2** | Backend Engineer | Serializer fixes, API contract verification, merge conflict resolution | Verifier |
| **Janitor** | DevOps/Infra | CI/CD, branch cleanup, merge conflict resolution for Issue #38 | Lead Engineer |

### Why This Structure

- The **Lead Engineer** owns technical decisions and reviews all code. This person ensures the frontend and backend fixes are coordinated (the room creation bug spans both).
- The **Verifier** owns test quality. Issue #58 is fundamentally a test infrastructure problem, and the Verifier ensures new integration tests cover the real user flow.
- **Two engineers** split frontend/backend work so fixes can happen in parallel.
- The **Janitor** handles mechanical cleanup (Issue #38) and CI/CD maintenance.

---

## Implementation Units

### U1. Audit Backend Room Serializer Response Contract

**Goal:** Verify and fix the backend `RoomSerializer` to ensure `is_host` is correctly serialized in the room detail endpoint response.

**Dependencies:** None

**Files:**
- `backend/game_engine/serializers.py`
- `backend/game_engine/tests.py` (add serializer test)

**Approach:**
1. Read the `RoomSerializer` and `PlayerSerializer` in `serializers.py`
2. Verify the room detail endpoint (`GET /rooms/{id}/`) returns `is_host` for each player
3. If missing, add `is_host` to the serializer's `fields` list
4. Add a test that creates a room, fetches it, and asserts the host player has `is_host: true`

**Test scenarios:**
- Happy path: Create room, fetch room detail, assert host player has `is_host: true`
- Edge case: Non-host player fetched from room detail has `is_host: false`
- Edge case: Room with multiple players returns correct `is_host` for each

**Verification:** Backend test suite passes with new serializer test.

---

### U2. Fix Frontend Host Detection in Room.tsx

**Goal:** Ensure the Room page correctly identifies the host player from server data, not optimistic local state.

**Dependencies:** U1

**Files:**
- `src/pages/Room.tsx`
- `src/context/GameContext.tsx`
- `src/context/UserContext.tsx`

**Approach:**
1. Trace the `fetchRoom` function in `Room.tsx` — verify it maps `is_host` from API response to the frontend `Player` type's `isHost` field
2. Check `GameContext.tsx` for the room data transform — ensure `is_host` → `isHost` mapping exists
3. Check `UserContext.tsx` `isHostFunction` — verify it reads from server-derived game state, not localStorage
4. Add a fallback: if `userSession.playerId` matches the `player_id` returned by `createRoom`, set `isHost` optimistically BUT re-validate on first `fetchRoom` response

**Test scenarios:**
- Happy path: Host creates room, navigates to room page, sees host controls (Start Battle, kick players)
- Happy path: Non-host joins room, does NOT see host controls
- Edge case: Host refreshes page — host status is restored from server data, not lost
- Edge case: Player joins via room code — correctly identified as non-host

**Verification:** Manual test flow works; add a frontend unit test for `isHostFunction`.

---

### U3. Decompose Lobby.tsx

**Goal:** Extract sub-components from the monolithic `Lobby.tsx` to isolate rendering issues and improve maintainability.

**Dependencies:** None (can run in parallel with U1/U2)

**Files:**
- `src/pages/Lobby.tsx` (reduce from ~28K to <8K)
- `src/components/lobby/LobbyLanding.tsx` (new)
- `src/components/lobby/JoinRoomForm.tsx` (new)
- `src/components/lobby/CreateRoomForm.tsx` (new)
- `src/components/lobby/RoomBrowser.tsx` (extract existing)
- `src/components/lobby/PlayerNameInput.tsx` (new)

**Approach:**
1. Extract the landing view (no room code entered yet) into `LobbyLanding.tsx`
2. Extract the join form (enter room code + name) into `JoinRoomForm.tsx`
3. Extract the create form (room name + theme selection) into `CreateRoomForm.tsx`
4. Extract the player name input into a shared `PlayerNameInput.tsx`
5. Keep `Lobby.tsx` as the orchestrator that manages state and composes the sub-components
6. Ensure all existing functionality (Discord status check, onboarding modal, theme selection) is preserved

**Test scenarios:**
- Happy path: Landing → Join flow renders correctly
- Happy path: Landing → Create flow renders correctly
- Edge case: Discord-linked user sees pre-filled name
- Edge case: First-time user sees onboarding modal
- Regression: All existing E2E lobby tests still pass

**Verification:** Visual inspection + existing E2E tests pass.

---

### U4. Add Integration Test Suite for Room Creation Flow

**Goal:** Create a new set of E2E tests that exercise the real create → join → start flow against a running backend.

**Dependencies:** U1, U2 (so the flow actually works)

**Files:**
- `tests/e2e/integration/room-creation-flow.spec.ts` (new)
- `tests/e2e/integration/join-flow.spec.ts` (new)
- `tests/e2e/integration/start-game-flow.spec.ts` (new)
- `tests/e2e/helpers.ts` (modify — add `setupRealBackend()` helper)

**Approach:**
1. Create a new `tests/e2e/integration/` directory for tests that run against a real backend
2. Add a `setupRealBackend()` helper that starts the Django test server and Redis
3. Write `room-creation-flow.spec.ts`: creates a room, verifies host status, navigates to room page
4. Write `join-flow.spec.ts`: creates room in one browser context, joins from another, verifies both players see correct state
5. Write `start-game-flow.spec.ts`: creates room, adds 2+ players, starts game, verifies game state transitions
6. These tests should NOT use `mockApiRoutes` or `setupPlayerSession` — they exercise the real flow

**Test scenarios:**
- Happy path: Create room → verify host → navigate to room → see lobby
- Happy path: Create room → second player joins → both see each other
- Happy path: Host starts game → both players see game board
- Edge case: Player tries to join non-existent room → sees error
- Edge case: Player joins already-started game → joins as spectator

**Verification:** New integration tests pass against running backend.

---

### U5. Resolve Merge Conflicts on `repo-local-gaia-polecat` Branch

**Goal:** Clean up the conflicted branch.

**Dependencies:** None

**Files:**
- Git branch `repo-local-gaia-polecat`

**Approach:**
1. Fetch latest `main` branch
2. Checkout `repo-local-gaia-polecat`
3. Rebase onto `main`
4. Resolve all merge conflicts
5. If the branch has valuable changes, create a clean PR. If it's stale, delete it.

**Test scenarios:**
- Branch builds cleanly after rebase
- No conflict markers remain in any file

**Verification:** `git diff main...repo-local-gaia-polecat` shows only intentional changes.

---

## Scope Boundaries

### In Scope
- Fixing the room creation host detection bug (Issue #57)
- Adding integration tests for the real user flow (Issue #58)
- Decomposing Lobby.tsx to fix rendering issues (Issue #36)
- Resolving merge conflicts on `repo-local-gaia-polecat` (Issue #38)

### Deferred to Follow-Up Work
- Full design system implementation (MASTER.md compliance) — large effort, separate plan
- Spectator chat feature — listed as future phase in SYSTEM_DESIGN_CHOICES.md
- PostgreSQL migration for production — operational concern, not bug-related
- Mobile PWA features (service worker, manifest) — separate initiative
- Audio player component — not directly related to the reported bugs

---

## Risk Analysis

| Risk | Impact | Mitigation |
|------|--------|------------|
| Backend serializer change breaks existing tests | High | Add new tests before changing serializer; run full test suite |
| Lobby.tsx decomposition introduces regressions | Medium | Extract components without changing behavior; rely on existing E2E tests |
| Integration tests are flaky due to backend startup timing | Medium | Use Playwright's `webServer` config to manage backend lifecycle |
| Merge conflict resolution loses work | Low | Create backup branch before rebasing |

---

## Success Metrics
- Issue #57: Room creation works — host sees controls, others can join
- Issue #58: Integration test suite covers create → join → start flow
- Issue #36: Lobby.tsx is <8K lines, rendering bugs resolved
- Issue #38: Branch is clean or deleted
