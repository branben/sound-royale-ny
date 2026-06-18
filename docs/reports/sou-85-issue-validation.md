# SOU-85: Validate Open GitHub Issues — QA Report

**Date:** 2026-06-16  
**Validator:** QA Lead (Verifier 2)  
**Scope:** Issues 58, 57, 38, 36 (open) + Issues 6-20 (closed GAIA cleanup check)

---

## Issue 58: E2E tests bypass actual user flow — mock API responses hide real bugs

**Status:** OPEN  
**Validity: PARTIALLY VALID**  
**Priority for action: Medium — existing live suite covers the gap but mocked tier is still dominant**

### Evidence

**The problem described is accurate:**
- The mocked E2E test tier (23 test files in `tests/e2e/`) uses `setupPlayerSession()` to inject hardcoded player sessions directly into localStorage, completely bypassing the API-based room creation and join flows
- `mockApiRoutes()` intercepts ALL `**/api/**` requests via Playwright's `page.route()` and returns fixture data — the frontend never communicates with a real backend in these tests
- The `mockWebSocketConnection()` replaces `window.WebSocket` entirely, so WebSocket connectivity is untested

**However, a live test tier already exists** that addresses the core concern:
- `tests/e2e/live/` contains 4 spec files that exercise the REAL create → join → start flow against a running backend at `localhost:8000`
- `tests/e2e/live/pom/PlayerPage.ts` calls real API endpoints via `axios` for room creation and joining
- `golden-user-flow.spec.ts` tests host + producer + spectator lobby-to-game flow with real API
- `casual-full-game.spec.ts` tests full casual mode game to bingo via real API
- `ranked-full-game.spec.ts` tests full ranked game with voting via real API (2 producers + 3 spectators)
- `spectator-live.spec.ts` tests spectator UI through live game progression via real API

### Remaining gaps
1. The mocked tier (23 files) vastly outnumbers the live tier (4 files) — coverage is still mock-heavy
2. The mocked tests could be converted to use real API + `PlayerPage` patterns, or at minimum updated to verify field name correctness
3. Page refresh and reconnection flows are only tested in `rejoin-recovery.spec.ts` using mocks, not against a real backend

### Recommendation
- **Do not close** — the concern is still valid even though a live tier exists
- Convert high-value mocked tests (smoke, single-round, full-game) to use the live `PlayerPage` POM
- Add specific test: "Host refreshes page → isHost is restored from server data" using real API
- Priority: Low-Medium (the live tier provides coverage for the critical path; mocked tier gaps are a gradual improvement)

---

## Issue 57: Room creation fails with console error — host stuck waiting for host, others cannot join

**Status:** OPEN  
**Validity: INVALID — Fixed**  
**Recommendation: Close**

### Evidence

Fixed by commit `f6ab781` ("fix: resolve room creation, player join, and lobby rendering bugs"):

| Unit | Root Cause | Fix |
|------|-----------|-----|
| U1 | `PlayerCreateSerializer` used `player_name` but frontend `transformPlayer()` read `backendPlayer.name` | Renamed serializer field to `name`; added fallback `backendPlayer.name ?? backendPlayer.player_name ?? ''` |
| U2 | `rejoin_game` endpoint didn't return `is_host` | Added `"is_host": player.is_host` to rejoin response (views.py:762) |
| U3 | No fallback isHost detection on page refresh | Added fallback in Room.tsx checking raw `room.players` data |

Code verification:
- `serializers.py:355` — `name = serializers.CharField()` (Confirmed)
- `views.py:762` — `"is_host": player.is_host` in rejoin response (Confirmed)
- `api.ts:310` — `name: backendPlayer.name ?? backendPlayer.player_name ?? ''` (Confirmed)
- `Room.tsx:185-200` — fallback isHost from room.players (Confirmed)

### Recommendation
**Close.** All root causes addressed and verified in code.

---

## Issue 38: chore/repo-local-gaia-polecat is full of merge conflicts

**Status:** OPEN  
**Validity: INVALID — Can be closed**  
**Recommendation: Close**

### Evidence
- Issue body is empty (only a Linear backlink to SOU-21)
- No branches named `gaia-polecat` exist in the repo (`git branch -a` returns only `main` and `remotes/origin/main`)
- The chore likely referred to a temporary branch or state that has since been resolved

### Recommendation
**Close.** No lingering branches or merge conflicts exist.

---

## Issue 36: Having some difficulty with the front end rendering for a lobby

**Status:** OPEN  
**Validity: INVALID — Fixed**  
**Recommendation: Close**

### Evidence

Fixed by commit `f6ab781`, Unit 3 ("Clean up dead lobby rendering code"):

1. **Extracted monolithic Lobby.tsx** into focused components:
   - `src/components/lobby/LobbyLanding.tsx`
   - `src/components/lobby/JoinRoomForm.tsx`
   - `src/components/lobby/CreateRoomForm.tsx`
   - `src/components/lobby/PlayerNameInput.tsx`

2. **Removed dead in-lobby waiting room code**: Removed `isJoined`, `players`, `isHost`, `currentPlayerId`, `isReady` state variables; removed polling `useEffect`, `applyRoomData`, `handleStartMatch`, `handleToggleReady`

3. **Simplified flow**: Lobby immediately navigates to `/room/{code}` after join/create; Room page handles all waiting/game logic

**Note:** `LobbyWaitingRoom.tsx` still exists in `src/components/lobby/` but is **dead code** — imported nowhere. Recommend removing in a cleanup pass.

### Recommendation
**Close.** The lobby rendering has been restructured and works correctly.

---

## Closed Issues Audit (6-20): GAIA Test Issues Cleanup

**13 of 15 closed issues are GAIA test artifacts** that should be cleaned up:

| Issue | Title | Labels | Action |
|-------|-------|--------|--------|
| 20 | Server-authoritative round timer | none | Legitimate task — verify if done |
| 19 | *(not in list)* | — | — |
| 18 | GAIA TEST: Add // TOOL_SHIM_TEST to src/App.tsx | GAIA | Verify code is clean |
| 17 | GAIA: Add EXPLICIT to src/pages/Lobby.tsx | none | Check for leftover comments |
| 16 | GAIA: Add FINAL TEST to Lobby.tsx | none | Check for leftover comments |
| 15 | GAIA: Add TEST v2 to Lobby.tsx | none | Check for leftover comments |
| 14 | GAIA: Add HELLO comment to Lobby.tsx | none | Check for leftover comments |
| 13 | GAIA: Test mistral with single-step tools | none | GAIA artifact |
| 12 | GAIA: Test llama model on Lobby.tsx | none | GAIA artifact |
| 11 | GAIA: Add TEST comment to Lobby.tsx with new model | none | Check for leftover comments |
| 10 | GAIA: Edit src/pages/Lobby.tsx add GAIA comment | none | Check for leftover comments |
| 9 | GAIA: Add comment to Lobby.tsx | none | Check for leftover comments |
| 8 | GAIA: Add comment to Lobby.tsx saying GAIA TEST | none | Check for leftover comments |
| 7 | GAIA: Test heartbeat with working jq | none | GAIA artifact |
| 6 | [TEST] GAIA Heartbeat Test Issue | none | GAIA artifact |

### Evidence
- All GAIA test issues (8-18) were testing AI tool integration (GAIA polecat) by adding comments to `Lobby.tsx` and `App.tsx`
- The GAIA label exists in the repo (`GAIA` = "GAIA polecat task")
- Issue 38 (SOU-21) also links to the same `repo-local-gaia-polecat` chore
- These are confirmed as closed on GitHub

### Recommendation
- **Bulk-close issues 6-18** with a note explaining they were GAIA tool test artifacts (already closed)
- Verify no leftover test comments (`TOOL_SHIM_TEST`, `EXPLICIT_TEST`, `FINAL TEST`, `GOOSE V2 TEST`, `HELLO`, `GAIA TEST`) remain in `App.tsx` or `Lobby.tsx`
- Issue 20 ("Server-authoritative round timer") is a legitimate task — verify separately if it's actually implemented
