---
title: "quality: E2E test suite completion + housekeeping"
type: quality
date: 2026-06-21
issues: "#92-99"
status: active
---

# Quality: E2E Test Suite Completion + Housekeeping

## Problem

8 open quality issues (#92-99) cover E2E test activation for features that are already implemented, plus housekeeping to close stale issues. The features themselves (Game Over/Play Again, tutorial, host migration, admin panel, leaderboard, share/invite, audio playback, full-game lifecycle) are all **already implemented** in the codebase. What's missing is test coverage and a skip audit.

## Scope

- **In scope:** Unskipping/fixing/authoring E2E tests for existing features, activating the full-game lifecycle suite, and closing stale issues with a skip audit.
- **Out of scope:** New feature implementation (all features exist), changing game logic, visual redesign.

## Requirements

- [ ] All 7 E2E issues (#92-98) resolved — tests pass with mocked API
- [ ] Housekeeping issue #99 resolved — stale issues closed, remaining skips documented
- [ ] `npx playwright test` passes for all modified specs
- [ ] No changes to app source code — only test files (unless bugs are found)

## Key Analysis

### Feature Status (all confirmed implemented)

| Feature | Key Component | E2E Status |
|---------|---------------|------------|
| Game Over / Play Again | `GameOverScreen.tsx`, `PlayAgainButton.tsx`, `Room.tsx:783-825` | Not covered |
| Game Tutorial | `GameTutorial.tsx` — producer/spectator paths, localStorage-gated | Not covered |
| Host Migration | `HostMigrationIndicator.tsx`, backend `promote_new_host()` | Not covered |
| Admin Panel (Themes) | `ThemeAdmin.tsx` — PIN-protected CRUD | Not covered |
| Leaderboard + Profiles | `GlobalLeaderboardPage.tsx`, `PlayerProfileModal.tsx` | Not covered |
| Share/Invite | `ShareInvite.tsx` — clipboard copy with `?spectator=1` | Not covered |
| Tile Audio Playback | BingoBoard tile audio playback | Not covered |
| Full-Game Lifecycle | `full-game.spec.ts` — `test.skip` guards on 5 tests | Skipped |

### E2E Test Infrastructure (confirmed)

- **42 existing specs** across `tests/e2e/`
- **Mock pattern:** `mockApiRoutes()` + `toRoomResponse()` + `setupPlayerSession()` + `data-testid` assertions
- **WebSocket mock:** `MockWebSocket` with `injectMessage()`, `simulateDisconnect()`
- **Playwright config:** Chromium only, `baseURL: localhost:8081`, workers: 2, retries: 2
- **`_future/` directory:** 19 intentionally skipped tests (deferred infra)
- **`docs/solutions/`:** Does not exist — no institutional learnings database yet

---

## Implementation Units

### U1. Full-Game Lifecycle Suite Activation

**Goal:** Unskip 5 tests in `full-game.spec.ts` and make them pass under mocked API.

**Requirements:** #92

**Files:**
- `tests/e2e/full-game.spec.ts`
- `tests/e2e/utils/game-fixtures.ts` (if fixture gaps need filling)

**Approach:**
1. Remove `test.skip` from all 5 tests in the describe block
2. Fix fixture alignment:
   - Test "accumulate scores": `createMockFinishedState` currently doesn't set `totalScore` on `GameOverScreen`. Either add `totalScore` to the fixture or compute from player `scoreInfo.score`. Fixture already sets `scoreInfo.score = 300` on the player, so `TotalScoreDisplay` should render if the component reads `scoreInfo.score` as total.
   - Test "show play again option": `GameOverScreen` only renders `PlayAgainButton` when `onPlayAgain` prop is provided. Verify `Room.tsx` passes `onPlayAgain` in finished state. If not, add it.
3. Run `npx playwright test tests/e2e/full-game.spec.ts` to verify all 5 pass

**Patterns to follow:** Existing test structure in the same file — `enableE2EMode` → `mockApiRoutes` with `toRoomResponse()` → `setupPlayerSession` → `page.goto` → assert via `data-testid`

**Test scenarios:**
- Happy path: 3-round game config shows "3 Rounds"
- Happy path: round indicator shows "2/" and "3/" for rounds 2 and 3
- Happy path: total score shows "300" after multi-round game
- Edge case: winner announcement shows winner name after final round
- Error path: game over screen shows "GAME OVER" for abandoned game (winner: null)
- Happy path: "Play Again" button visible on game over screen

**Verification:** `npx playwright test tests/e2e/full-game.spec.ts` passes (5 tests, 0 skipped)

---

### U2. E2E: Host Migration Test

**Goal:** Write E2E test for host migration flow — host disconnects, new host is promoted.

**Requirements:** #96

**Dependencies:** None

**Files:**
- `tests/e2e/host-migration.spec.ts` (new)

**Approach:**
1. Create mock lobby state with 2 producers + 1 spectator
2. Set up WebSocket mock via `mockWebSocketConnection()`
3. Inject initial `game_state_update` with host connected
4. Call `simulateDisconnect()` on the host's mock WebSocket
5. Inject `host_migrated` message with new host name
6. Verify `host-migration-indicator` banner appears with new host name
7. Verify new host sees Start/Reset buttons
8. Verify migrated host's `isHost` flag is true in subsequent state

**Patterns to follow:**
- `tests/e2e/negative-scenarios/disconnections.spec.ts` — stateful mocks with boolean flags
- `tests/e2e/helpers.ts` lines 46-235 — `mockWebSocketConnection()` + `injectMessage()`
- `tests/e2e/live/pom/PlayerPage.tsx` — multi-player orchestration for live tests (if needed)

**Test scenarios:**
- Happy path: host disconnects → `host-migration-indicator` appears with new host name
- Happy path: new host sees Start/Reset controls
- Happy path: spectator sees migration indicator, game continues uninterrupted
- Edge case: host reconnects before migration → no migration occurs (optional second test)

**Verification:** `npx playwright test tests/e2e/host-migration.spec.ts` passes

---

### U3. E2E: Game Tutorial / Onboarding Test

**Goal:** Write E2E test verifying the game tutorial appears on first game start and can be dismissed.

**Requirements:** #95

**Dependencies:** None

**Files:**
- `tests/e2e/game-tutorial.spec.ts` (new)
- `src/components/game/GameTutorial.tsx` (read, not modify)

**Approach:**
1. Ensure localStorage is cleared (no `hasSeenGameTutorial` key)
2. Navigate to a room in `playing` status
3. Verify `[data-testid="game-tutorial"]` appears
4. Click dismiss button
5. Verify tutorial disappears
6. Verify `hasSeenGameTutorial` is set in localStorage
7. Reload → tutorial should NOT appear

**Patterns to follow:**
- `tests/e2e/smoke.spec.ts` — uses `page.addInitScript(() => localStorage.setItem(...))` for pre-conditions
- `tests/e2e/full-game.spec.ts` — `mockApiRoutes` + `toRoomResponse()` for room state

**Test scenarios:**
- Happy path: tutorial appears on first game start for producer
- Happy path: tutorial dismissed → localStorage set → not shown on reload
- Edge case: spectator sees shorter tutorial (2 steps vs 4 for producer)
- Edge case: tutorial not shown when `hasSeenGameTutorial` already set

**Verification:** `npx playwright test tests/e2e/game-tutorial.spec.ts` passes

---

### U4. E2E: Admin Panel Test

**Goal:** Write E2E test for admin panel PIN flow and theme rotation management.

**Requirements:** #94

**Dependencies:** None

**Files:**
- `tests/e2e/admin-panel.spec.ts` (new)
- `src/pages/ThemeAdmin.tsx` (read, not modify)

**Approach:**
1. Navigate to `/admin/themes`
2. Verify PIN input is visible (`[data-testid="admin-pin"]`)
3. Enter correct PIN (from env or test fixture)
4. Verify admin UI unlocks — theme rotation list appears
5. Verify theme CRUD: add genre, remove genre, save
6. Verify PIN rejection: wrong PIN → error message

**Patterns to follow:**
- `tests/e2e/smoke.spec.ts` — simple navigation + assertion pattern
- `tests/e2e/verified-auth.spec.ts` — auth flow testing

**Test scenarios:**
- Happy path: correct PIN unlocks admin panel
- Error path: wrong PIN shows error, panel stays locked
- Happy path: theme rotation CRUD (add/remove genre, save)
- Edge case: validation — must have exactly 9 genres, all unique, all non-empty

**Verification:** `npx playwright test tests/e2e/admin-panel.spec.ts` passes

---

### U5. E2E: Leaderboard + Player Profile Test

**Goal:** Write E2E test for leaderboard display and player profile modal.

**Requirements:** #97

**Dependencies:** None

**Files:**
- `tests/e2e/leaderboard.spec.ts` (modify or create if not matching scope)
- `src/pages/GlobalLeaderboardPage.tsx` (read, not modify)
- `src/components/game/PlayerProfileModal.tsx` (read, not modify)

**Approach:**
1. Check existing `tests/e2e/leaderboard.spec.ts` — it may already exist but need enhancement for player profiles
2. Navigate to `/leaderboard`
3. Verify leaderboard displays with ELO-ranked players
4. Click on a player row
5. Verify `PlayerProfileModal` opens with genre performance, stats, title badge
6. Verify modal close works

**Patterns to follow:**
- `tests/e2e/genre-heatmap-leaderboard.spec.ts` — leaderboard-specific patterns
- `tests/e2e/elo-rating.spec.ts` — ELO display assertions

**Test scenarios:**
- Happy path: leaderboard shows ranked players with ELO ratings
- Happy path: clicking player opens profile modal with stats
- Happy path: profile shows genre grades, win/loss record, title badge
- Edge case: empty/loading state displays correctly

**Verification:** `npx playwright test tests/e2e/leaderboard.spec.ts tests/e2e/leaderboard-profile.spec.ts` passes

---

### U6. E2E: Share/Invite Flow Test

**Goal:** Write E2E test verifying the share/invite link copies to clipboard with spectator param.

**Requirements:** #93

**Dependencies:** None

**Files:**
- `tests/e2e/share-invite.spec.ts` (new)
- `src/components/game/ShareInvite.tsx` (read, not modify)

**Approach:**
1. Navigate to a room page
2. Verify `[data-testid="share-invite-button"]` or similar exists
3. Click share button
4. Verify clipboard content (with `?spectator=1` param)
5. Verify toast confirmation appears
6. (If clipboard API not available in test, verify fallback — URL text shown)

**Patterns to follow:**
- `tests/e2e/smoke.spec.ts` — navigation + interaction + assertion

**Test scenarios:**
- Happy path: share button copies URL with `?spectator=1` to clipboard
- Happy path: toast/success message appears after copy
- Edge case: clipboard API unavailable → fallback shows URL text

**Verification:** `npx playwright test tests/e2e/share-invite.spec.ts` passes

---

### U7. E2E: Tile Audio Playback Test

**Goal:** Write E2E test for tile audio playback functionality.

**Requirements:** #98

**Dependencies:** None

**Files:**
- `tests/e2e/tile-audio.spec.ts` (new)

**Approach:**
1. Mock room state with at least one tile having an `audioUrl`
2. Navigate to room page
3. Verify tile with audio shows play button or audio indicator
4. Simulate clicking play
5. Verify audio playback state (play button changes to playing/paused)

**Patterns to follow:**
- `tests/e2e/smoke.spec.ts` — element interaction via `data-testid`
- E2E does NOT prove real audio playback (no audio in headless Chromium) — verifies UI state changes only

**Test scenarios:**
- Happy path: tile with `audioUrl` shows audio indicator/play button
- Happy path: clicking play changes UI state (play → pause icon)
- Edge case: tile without `audioUrl` shows no audio controls

**Verification:** `npx playwright test tests/e2e/tile-audio.spec.ts` passes

---

### U8. Integration Verification — All Flows

**Goal:** Meta-test verifying all major user flows work end-to-end. Issues #90 and #99.

**Requirements:** #90, #99

**Dependencies:** U1-U7

**Files:**
- `tests/e2e/integration-verification.spec.ts` (new)

**Approach:**
1. Write a comprehensive smoke suite that hits all major navigation targets:
   - Lobby loads
   - Room page renders with mocked state
   - Leaderboard page loads
   - Admin page loads (PIN gate visible)
   - Share button present
   - (If implemented) Tutorial trigger
2. This is a lightweight verification — not deep functional testing (that's U1-U7's job)

**Patterns to follow:**
- `tests/e2e/smoke.spec.ts` — same patterns, broader coverage

**Test scenarios:**
- Happy path: lobby shell loads with title and room code input
- Happy path: room page renders bingo board with mocked state
- Happy path: leaderboard page renders ranked list
- Happy path: admin page shows PIN input
- Happy path: share button renders in room page
- Error path: 404 navigation shows NotFound page

**Verification:** `npx playwright test tests/e2e/integration-verification.spec.ts` passes

---

### U9. Housekeeping: Close Stale Issues + Skip Audit

**Goal:** Audit all open and recently-closed issues. Close stale ones. Confirm all remaining skips are intentional and documented.

**Requirements:** #99

**Dependencies:** U1-U8 (so test results inform what's "done")

**Files:**
- GitHub issues via `gh issue` commands

**Approach:**
1. Run full E2E suite to confirm all U1-U8 tests pass
2. Cross-reference test results with open issues:
   - If feature has passing E2E test → close the E2E issue
   - If feature is implemented + tested → close the feature issue
3. Run skip audit on all `test.skip` calls:
   - `_future/` tests: confirm directory-level ignore is in `playwright.config.ts`
   - `test.skip` in active tests: confirm skip reason is documented in `tests/e2e/README.md`
4. Update `AGENTS.md` Experience Buffer with any new learnings
5. Draft skip audit summary in issue #99 comments before closing

**Test scenarios:** N/A (this is a housekeeping task, not a code test)

**Verification:**
- All 14 original issues have deterministic status (closed or re-scoped)
- Skip audit documented in `tests/e2e/README.md` or issue #99 comments
- No _future/ tests inadvertently promoted or stale

---

## Dependency Graph

```
U1 (full-game) ─────────┐
U2 (host migration) ────┤
U3 (tutorial) ──────────┤
U4 (admin panel) ───────┼──→ U8 (integration verification) ──→ U9 (housekeeping)
U5 (leaderboard) ───────┤
U6 (share/invite) ──────┤
U7 (tile audio) ────────┘
```

U1-U7 are independent — parallelizable. U8 and U9 are sequential after them.

## Deferred to Follow-Up Work

- **`docs/solutions/` knowledge base:** This repo has no institutional learnings directory. Creating one would benefit future sessions but is not blocking for this work.
- **ELO delta display tests:** 2 assertions in `elo-rating.spec.ts` are still skipped (Phase 4B deferred). Not touched by this plan.
- **`_future/` tests:** 14 tests in `tests/e2e/_future/` require infrastructure not yet built. Not touched by this plan.
- **Django version discrepancy:** Settings says 5.2.9, requirements.txt says 4.2.7. Should be investigated separately — not blocking for E2E test work.

## Risks

| Risk | Mitigation |
|------|-----------|
| `full-game.spec.ts` tests fail due to fixture gaps | Plan identifies specific gaps (totalScore, onPlayAgain) — fix fixtures first |
| Admin PIN test needs correct PIN | Use env var or hardcoded test PIN from settings |
| Clipboard API unavailable in headless Chromium | Test fallback path (URL text display) or mock clipboard |
| WebSocket mock doesn't perfectly simulate disconnect timing | Use `simulateDisconnect()` + `injectMessage()` pattern from existing negative-scenarios tests |
| Subagent produces incomplete tests | Always verify with `npx playwright test` after delegation |

## Verification Strategy

1. After each unit: `npx playwright test tests/e2e/<spec>.spec.ts` passes
2. After all units: `npx playwright test` full suite passes (no new failures)
3. Housekeeping: all 14 issues have deterministic status
