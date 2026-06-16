---
title: "fix: Room Creation Host Detection, Player Join Data, and E2E Test Coverage"
status: active
created: 2026-06-16
deepened: 2026-06-16
issues:
  - "SOU-40"
  - "#57"
  - "#58"
  - "#36"
  - "#38"
---

# Fix Room Creation Host Detection, Player Join Data, and E2E Test Coverage

## Problem Frame

Sound Royale has open issues that block core multiplayer functionality:

1. **Room creation/join is broken (Issue #57)**: After creating a room, the host may see "Waiting for host" instead of host controls. Other players who join get empty player names. Root causes:
   - `PlayerCreateSerializer` declares `player_name = serializers.CharField(source="name")` which DRF serializes as key `player_name`, but `transformPlayer()` reads `backendPlayer.name` → `undefined` → empty string
   - `PlayerCreateSerializer` omits `is_host` from its fields, so joined players never see host status from the join response
   - Note: room creation (`RoomViewSet.create()`) does NOT use `PlayerCreateSerializer` — it creates the Player directly and returns a hand-built dict. The serializer bug only affects the `join_game` path. Host detection for the create path works via `fetchRoom()` which uses `PlayerSerializer` (includes `is_host`).

2. **E2E tests bypass the real user flow (Issue #58)**: Most tests use `setupPlayerSession` + `mockApiRoutes` + `mockWebSocketConnection`. The live test POM (`PlayerPage.ts`) calls the backend API directly via axios. However, `golden-user-flow.spec.ts` already does a full UI flow test through the real UI against a running backend — but it likely fails today because of the serializer bugs. The existing mocked tests also need updating to match the new field names after the serializer fix.

3. **Lobby frontend rendering issues (Issue #36)**: The `isJoined` state and polling `useEffect` in `Lobby.tsx` are effectively dead code — `navigate()` is called immediately after both `handleJoin` and `handleCreateRoom`, so the "joined" UI (player list, ready toggle, start button) is never rendered via the main flow.

4. **Branch merge conflicts (Issue #38)**: The `repo-local-gaia-polecat` branch has accumulated merge conflicts. This is a git hygiene issue, not a code defect. Out of scope for this plan.

## Scope

**In scope:**
- Fix `PlayerCreateSerializer` to return `name` (not `player_name`) and include `is_host` so `transformPlayer()` works correctly for joined players
- Fix the `rejoin_game` response to include `is_host` so returning hosts are recognized
- Clean up dead lobby rendering code (`isJoined` state, polling `useEffect`)
- Update the existing `golden-user-flow.spec.ts` to work with the fixed code, and update mocked tests to use correct field names

**Out of scope:**
- Fixing the `repo-local-gaia-polecat` branch merge conflicts (Issue #38) — manual git operation
- Adding new game mechanics or features
- Changing the WebSocket protocol
- Refactoring duplicate player transform logic in `GameContext.tsx` and `Room.tsx`

---

## Requirements

### API Correctness

**R1.** `PlayerCreateSerializer` must serialize the player's name under key `name` (not `player_name`) so `transformPlayer()` reads it correctly.

**R2.** `PlayerCreateSerializer` must include `is_host` in its serialized output so the frontend can identify host status from the join response.

**R3.** `rejoin_game` API response must include `is_host` so returning hosts are recognized after page refresh.

### User-Facing Behavior

**R4.** Host must see "Start Battle" button immediately after creating a room (not "Waiting for host").

**R5.** Joining player must see their correct name and the "Waiting for host" message.

**R6.** Host must see new player appear when someone joins their room.

### Test Coverage

**R7.** The existing `golden-user-flow.spec.ts` must pass with the fixed code (full UI flow: create → join → start).

**R8.** Existing mocked E2E tests must be updated to use `name` instead of `player_name` in their mock responses.

### Code Cleanup

**R9.** Remove dead `isJoined`/polling code from `Lobby.tsx` that is never rendered due to immediate navigation.

---

## Key Technical Decisions

### D1: Fix `PlayerCreateSerializer` field naming
The `PlayerCreateSerializer.player_name = serializers.CharField(source="name")` causes DRF to serialize the field as `player_name` in the JSON output. The frontend's `transformPlayer()` reads `backendPlayer.name`. Fix: rename the serializer field to `name` (keeping `source="name"` for the model mapping) so the JSON output key matches what the frontend expects.

### D2: Add `is_host` to `PlayerCreateSerializer`
Currently `PlayerCreateSerializer` fields are `["id", "player_name", "is_spectator", "player_secret"]`. Must add `is_host` and mark it read-only since clients should not be able to claim host status — it's set by the server.

### D3: Fix `rejoin_game` response to include `is_host`
The `rejoin_game` action returns `id`, `name`, `isSpectator`, `is_checked_in`, `current_title` — but not `is_host`. Returning hosts won't be recognized after page refresh. Add `is_host` to the response dict.

### D4: Room page host detection needs no code change
The Room page derives `isHost` from `gameState.players` (populated by `fetchRoom` using `RoomDetailSerializer` → `PlayerSerializer`, which already includes `is_host`). The create path works via `fetchRoom`. Once `PlayerCreateSerializer` is fixed (U1), the join path will also produce correct data. No Room.tsx changes needed.

---

## Implementation Units

### U1. Fix PlayerCreateSerializer field naming and add is_host

**Goal:** Ensure `PlayerCreateSerializer` returns `name` (not `player_name`) and includes `is_host`, so `transformPlayer()` produces correct player data for joined players.

**Requirements:** R1, R2, R5, R6

**Files:**
- `backend/game_engine/serializers.py` — modify `PlayerCreateSerializer`
- `backend/game_engine/test_api.py` — update/add tests

**Approach:**
1. In `PlayerCreateSerializer`, change `player_name = serializers.CharField(source="name")` to `name = serializers.CharField(source="name")` so the serialized JSON key is `name`
2. Add `is_host` to the `fields` list: `["id", "name", "is_spectator", "player_secret", "is_host"]`
3. Add `is_host` to `read_only_fields` since clients must not set host status

**Test scenarios:**
- **Happy path:** Joining a room returns response with `name` key (not `player_name`) containing the player's name
- **Happy path:** Joining a room returns `is_host: false` in the response
- **Happy path:** The serialized response, when passed through `transformPlayer()`, produces a `Player` with correct `name` and `isHost` values
- **Edge case:** Player name with special characters serializes correctly under `name` key
- **Edge case:** Attempting to set `is_host` via the join request is ignored (read-only)

**Verification:**
- Run `cd backend && python manage.py test game_engine` — all existing tests pass
- Manual: join a room via API, inspect response JSON — `name` key exists (not `player_name`), `is_host` is present

---

### U2. Fix rejoin_game response to include is_host

**Goal:** Ensure returning players (via `rejoin_game`) are correctly identified as host or not.

**Requirements:** R3, R4

**Files:**
- `backend/game_engine/views.py` — modify `rejoin_game` action response

**Approach:**
Add `is_host` to the `rejoin_game` response dict:
```python
return Response({
    "id": str(player.id),
    "name": player.name,
    "isSpectator": player.is_spectator,
    "is_host": player.is_host,
    "is_checked_in": player.is_checked_in,
    "current_title": player.current_title,
}, status=status.HTTP_200_OK)
```

**Test scenarios:**
- **Happy path:** Rejoining as host returns `is_host: true`
- **Happy path:** Rejoining as non-host returns `is_host: false`
- **Error path:** Invalid player_secret still returns 404

**Verification:**
- Run backend tests — all pass
- Manual: rejoin a room via API, verify `is_host` is in response

---

### U3. Clean up dead lobby rendering code

**Goal:** Remove unreachable code from `Lobby.tsx` that was never rendered due to immediate navigation.

**Requirements:** R9

**Dependencies:** None

**Files:**
- `src/pages/Lobby.tsx` — remove dead code

**Approach:**
1. Remove `isJoined` state (line 30)
2. Remove `players` state (line 32)
3. Remove `isHost` state (line 31) — this is the Lobby's local state, separate from Room page host detection
4. Remove `currentPlayerId` state (line 36)
5. Remove `isReady` state (line 35)
6. Remove the polling `useEffect` (lines 157-202)
7. Remove `applyRoomData` callback (lines 129-153)
8. Remove `handleStartMatch` function (lines 276-278)
9. Remove `handleToggleReady` function (lines 285-298)
10. Remove the entire player list rendering block (the `{isJoined && (...)}` branch starting at line 583)
11. Remove unused imports: `RoomResponse`, local `Player` interface, `gameApi` (if no longer referenced), `Crown`, `Avatar`, `AvatarFallback`
12. Keep `handleRoomJoined` callback (used by `RoomBrowser` component) — but note that after cleanup, the RoomBrowser path should navigate directly to the room page instead of setting `isJoined` on the Lobby

**Test scenarios:**
- **Happy path:** Lobby landing page renders correctly (Quick Match, Create, Join buttons)
- **Happy path:** Create flow works — enter name, click Create, enter room name, submit → navigates to room page
- **Happy path:** Join flow works — enter name, click Join, enter code, submit → navigates to room page
- **Edge case:** Quick Match flow works — enter name, click Quick Match → navigates to room page

**Verification:**
- Run `npx tsc --noEmit` — no type errors
- Manual: verify lobby renders and create/join flows work

---

### U4. Update E2E tests for fixed field names and verify golden path

**Goal:** Ensure all E2E tests work with the fixed `PlayerCreateSerializer` output (`name` instead of `player_name`).

**Requirements:** R7, R8

**Dependencies:** U1 (serializer fix must be applied first)

**Files:**
- `tests/e2e/live/golden-user-flow.spec.ts` — verify/fix test selectors
- `tests/e2e/helpers.ts` — update `toRejoinResponse` and mock helpers to use `name` key
- Any other test files that reference `player_name` in mock data

**Approach:**
1. Run the existing `golden-user-flow.spec.ts` against a running backend with U1+U2 fixes applied. Identify any failures.
2. Fix any broken selectors or assertions. Known potential issue: the spectator joins via `join-spectator-button` testid (line 61) — verify this testid exists in the Lobby/Join UI. If not, fix the test to use the correct flow (join room code first, then choose spectator role on the Room page).
3. Update `tests/e2e/helpers.ts` — the `toRejoinResponse` function (line 336) returns `name` key (already correct). Verify `toPlayerListResponse` (line 360) also uses `name`.
4. Scan all test files for `player_name` references and update to `name` where they represent the join/create response format.

**Test scenarios:**
- **Happy path:** `golden-user-flow.spec.ts` passes end-to-end with fixed backend (host creates, producer joins, spectator joins, game starts)
- **Happy path:** All existing mocked tests pass with updated field names
- **Regression:** No new browser console errors during golden flow test

**Verification:**
- Run `npm run test:e2e:live` with backend running — golden-user-flow test passes
- Run `npm run test:e2e` — all mocked tests pass

---

## Risk Analysis

| Risk | Impact | Mitigation |
|------|--------|------------|
| Serializer rename breaks existing backend tests | Medium | Update test assertions to expect `name` instead of `player_name`; run full backend test suite |
| `golden-user-flow.spec.ts` has broken testids | Medium | Audit all testid selectors in the test against actual UI elements; fix before running |
| Removing `isJoined` code breaks RoomBrowser flow | Low | The `handleRoomJoined` callback is called by `RoomBrowser` component. After cleanup, ensure RoomBrowser navigates directly to room page instead of setting lobby state |
| `rejoin_game` `is_host` field uses snake_case while other fields use camelCase | Low | The `rejoin_game` response is a hand-built dict (not a DRF serializer). `transformPlayer()` reads `backendPlayer.is_host` (snake_case), so this is functionally correct despite style inconsistency |

---

## Deferred to Follow-Up Work

- **Issue #38 (repo-local-gaia-polecat merge conflicts):** Requires manual git conflict resolution, not a code change.
- **Spectator name collisions:** The architecture doc recommends auto-generated spectator names, but current code still uses shared namespace.
- **Additional E2E tests:** Voting, tile play, bingo detection flows need coverage.
- **GameContext.tsx duplicate player transform logic:** Both `GameContext.tsx` and `Room.tsx` have nearly identical player transformation code. Should be refactored to use a shared utility.
- **Room page brief non-host flash on load:** If `fetchRoom()` hasn't completed yet, `gameState.players` is empty and `isHost` returns false briefly. This is a pre-existing timing issue, not introduced by this plan.

---

## Success Metrics

- Room creation: Host sees "Start Battle" button immediately after creating a room
- Room joining: Joining player's name displays correctly; both players see correct lobby state
- `golden-user-flow.spec.ts`: Passes end-to-end against running backend with 0 browser console errors
- Backend tests: All pass with updated field names
- Frontend: `npx tsc --noEmit` passes cleanly
