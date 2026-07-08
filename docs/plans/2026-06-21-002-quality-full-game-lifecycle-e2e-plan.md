---
title: "E2E: Activate full-game lifecycle test suite"
type: quality
date: 2026-06-21
issue: "#92"
status: completed
---

# E2E: Activate Full-Game Lifecycle Test Suite

## Problem

`tests/e2e/full-game.spec.ts` has 5 of 7 tests skipped with `test.skip(...)` dating from when the underlying UI components didn't exist yet. All components are now implemented — the tests just need their skip guards removed and minor fixture alignment.

## Scope

Unskip 5 tests in `tests/e2e/full-game.spec.ts` and make them pass under the existing mocked API + E2E-mode infrastructure. No changes to app source code.

## Requirements (from issue #92)

- [ ] `test.describe("Full 3-Round Game")` executes all 5 previously-skipped tests
- [ ] `npx playwright test tests/e2e/full-game.spec.ts` passes with mocked API
- [ ] No changes to app source code — only test files
- [ ] E2E preflight guard passes (`npm run test:e2e:preflight`)

## Key Analysis

### Tests to un-skip

| Test | What it checks | Component | data-testid exists? |
|------|---------------|-----------|---------------------|
| "configure game with 3 rounds" | MultiRoundConfig renders "3 Rounds" | `MultiRoundConfig.tsx` | ✅ `multi-round-config` |
| "progress from round 1 to round 2" | RoundIndicator shows "2/" | `RoundIndicator.tsx` | ✅ `round-indicator` |
| "progress from round 2 to round 3" | RoundIndicator shows "3/" | `RoundIndicator.tsx` | ✅ `round-indicator` |
| "accumulate scores across rounds" | TotalScoreDisplay shows "300" | `TotalScoreDisplay.tsx` | ✅ `total-score` |
| "show play again option" | PlayAgainButton visible | `PlayAgainButton.tsx` | ✅ `play-again` |

### Fixture Alignment Notes

- **Test 1 (multi-round-config)**: Uses inline `page.route`. Sets `total_rounds: 3` on the response. The fixture `toRoomResponse()` doesn't include `total_rounds` by default — the test adds it via spread. This should work as-is once unskipped.

- **Tests 2-3 (round progression)**: Use inline `page.route`. `createMockPlayingState` creates state with `status: 'playing'` and a `roundState` with the requested round number. Room.tsx needs to render `RoundIndicator` during playing state. The tests navigate to a static room URL (`/room/test-room`). Need to verify Room.tsx renders RoundIndicator for playing state without requiring a real room.

- **Test 4 (total score)**: Uses `mockApiRoutes`. Creates `createMockFinishedState` but doesn't pass `totalScore` to `GameOverScreen`. The component only renders `TotalScoreDisplay` when `totalScore !== undefined`. **Gap**: the test fixture doesn't include a `totalScore` value, but the test expects to see "300". Need to either: (a) add a `totalScore` field to the mock response, or (b) compute from player scores.

- **Test 5 (play again)**: Uses inline `page.route`. Checks for `button:has-text("Play Again")` OR `[data-testid="play-again"]`. `PlayAgainButton` has `data-testid="play-again"`. **Gap**: `GameOverScreen` only renders `PlayAgainButton` when `onPlayAgain` prop is provided. Need to verify Room.tsx passes `onPlayAgain` in finished state.

### Required Investigations (deferred to implementation)

1. How does Room.tsx render `RoundIndicator` during playing state? Does it require specific props from the game state?
2. How does Room.tsx compute `totalScore` for `GameOverScreen`? Is it from player scores or a separate field?
3. Does `Room.tsx:GameOverScreen` receive `onPlayAgain` in finished/abandoned state?

## Implementation Units

### U1: Investigate Room.tsx rendering for playing + finished states

**Goal**: Determine what data Room.tsx needs to render RoundIndicator, TotalScoreDisplay, and PlayAgainButton so the skipped tests pass.

**Files**: `src/pages/Room.tsx`

**Approach**: Read Room.tsx to find:
- When `RoundIndicator` is rendered and what props it receives
- How `totalScore` is computed/passed to `GameOverScreen`
- Whether `onPlayAgain` is passed to `GameOverScreen` in finished state

**Verification**: Document findings. No code changes.

### U2: Fix fixture gaps in full-game.spec.ts

**Goal**: Update the 5 skipped tests so the mock responses contain the data Room.tsx needs.

**Files**: `tests/e2e/full-game.spec.ts`

**Approach**: Based on U1 findings:
- For round progression tests (2-3): ensure `createMockPlayingState` response includes whatever Room.tsx needs to render `round-indicator`
- For total score test (4): ensure the mock response or Room.tsx usage allows `total-score` to render with "300"
- For play again test (5): ensure the mock response triggers `GameOverScreen` with `PlayAgainButton` visible

**Test scenarios**:
- Test "configure game with 3 rounds": navigate to room → see multi-round-config → contains "3 Rounds"
- Test "progress round 1→2": navigate to room → see round-indicator → contains "2/"
- Test "progress round 2→3": navigate to room → see round-indicator → contains "3/"
- Test "accumulate scores": navigate to finished room → see total-score → contains "300"
- Test "play again": navigate to finished room → see play-again button

**Verification**: `npx playwright test tests/e2e/full-game.spec.ts --reporter=line` passes

### U3: Remove test.skip guards

**Goal**: Remove the `test.skip(...)` wrapper from all 5 tests.

**Files**: `tests/e2e/full-game.spec.ts`

**Approach**: Simple text replacement — remove `test.skip(` and the trailing `, async (` pattern, keeping just `test(`.

**Verification**: All 5 tests execute (not skipped) and pass.

## Deferred to Follow-Up Work

- **WebSocket-based round progression**: Tests 2-3 use static mock responses (round number is baked in). Real round progression happens via WebSocket. These tests verify UI rendering, not round transition logic. True round-progression E2E is deferred.
- **Live backend verification**: All tests use mocked API routes. End-to-end verification with real Django backend requires `LIVE_WS_E2E=true` mode.
