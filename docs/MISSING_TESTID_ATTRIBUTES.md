# Missing data-testid Attributes for E2E Tests

## Overview
E2E tests are failing because the frontend components lack the necessary `data-testid` attributes that tests rely on. This document maps each missing attribute to its target component.

## Existing data-testid Attributes (Working)
- `data-testid="game-board"` - ✅ BingoBoard.tsx (line 27)
- `data-testid="score-display"` - ✅ ScoreDisplay.tsx (line 48)
- `data-testid="voting-panel"` - ✅ VotingPanel.tsx (lines 61, 76)
- `data-testid="request-to-play"` - ✅ SpectatorView.tsx (line 117)

## Missing data-testid Attributes (Needs Implementation)

### 1. `data-testid="bingo-tile"`
**Target Component:** `src/components/game/BingoTile.tsx`
**Usage:** producer-flow.spec.ts, single-round.spec.ts
**Test Failures:** 
- `locator('[data-testid="bingo-tile"]')` resolves to 0 elements
**Implementation:** Add to the root `<button>` element (line 61)

### 2. `data-testid="timer"`
**Target Component:** `src/components/game/TurnTimer.tsx`
**Usage:** single-round.spec.ts
**Test Failures:**
- `locator('[data-testid="timer"]')` resolves to 0 elements
**Implementation:** Add to the root `<div>` element (line 41)

### 3. `data-testid="lobby"`
**Target Component:** `src/pages/Lobby.tsx`
**Usage:** single-round.spec.ts
**Test Failures:**
- `locator('[data-testid="lobby"]')` resolves to 0 elements
**Implementation:** Add to the root `<div>` element (line 88) or the `<Card>` element (line 95)

### 4. `data-testid="connection-status"`
**Target Component:** Unknown (likely in PlayerView.tsx or Room.tsx)
**Usage:** negative-scenarios/disconnections.spec.ts
**Test Failures:**
- `locator('[data-testid="connection-status"]')` resolves to 0 elements
**Implementation:** Need to identify which component displays connection status and add attribute

### 5. `data-testid="total-score"`
**Target Component:** Unknown (likely in ScoreDisplay.tsx or VictoryCelebration.tsx)
**Usage:** full-game.spec.ts
**Test Failures:**
- `locator('[data-testid="total-score"]')` resolves to 0 elements
**Implementation:** Need to identify which component displays total score and add attribute

## Priority Order
1. **High Priority:** `bingo-tile`, `timer`, `lobby` (most frequently used)
2. **Medium Priority:** `connection-status`, `total-score` (specific test scenarios)

## Implementation Notes
- Each data-testid should be added to the root element of the component
- Use descriptive, lowercase names with hyphens for consistency
- Ensure the attribute doesn't conflict with existing functionality
- Test each addition by running the corresponding spec file

## 2026-04-20 Audit Update

### Current Findings
- No new Phase 2 or Phase 3 skips were caused by missing `data-testid` attributes.
- The following entries in this document are now stale because the attributes already exist in the app:
  - `data-testid="bingo-tile"` in `src/components/game/BingoTile.tsx`
  - `data-testid="timer"` in `src/components/game/TurnTimer.tsx`
  - `data-testid="lobby"` in both `src/pages/Lobby.tsx` and `src/pages/Room.tsx`
  - `data-testid="connection-status"` in `src/components/game/PlayerView.tsx`
  - `data-testid="total-score"` in `src/components/game/TotalScoreDisplay.tsx`

### Remaining Scoped Skip
- None. The active Phase 2 and Phase 3 suite is now green without selector-based skips.
