# 🎯 Playwright Testing Roadmap - Bingo Implementation

**Date:** January 15, 2026  
**Status:** Planning Phase  
**Goal:** Achieve 95% test coverage for new bingo functionality

---

## 📊 Current State Analysis

### Test Coverage: ~35%

**What's Working (✅ Covered):**
- Room creation and joining
- Basic tile selection
- Upload drawer interactions
- Tile completion feedback
- Basic victory celebration
- Error handling (WebSocket reconnection)

**What's Missing (❌ 65% gaps):**
- Bingo line detection (rows, columns, diagonals)
- Score calculation and display
- Multi-player tie-breaking logic
- Real-time score synchronization
- Complete game scenarios
- Spectator mode testing

---

## 🎯 Testing Phases Overview

### Phase 1: Core Bingo Functionality (HIGH PRIORITY)
**Goal:** Test the fundamental bingo game mechanics

**Files to Create:**
1. `tests/e2e/bingo-line-detection.spec.ts`
2. `tests/e2e/score-display.spec.ts`
3. `tests/e2e/tie-breaking.spec.ts`

**Estimated Time:** 3-4 hours  
**Test Cases:** 14 tests

---

### Phase 2: Multi-Player & Synchronization (MEDIUM PRIORITY)  
**Goal:** Test real-time game state synchronization

**Files to Create:**
1. `tests/e2e/multiplayer-sync.spec.ts`
2. `tests/e2e/spectator-mode.spec.ts`

**Estimated Time:** 3-4 hours  
**Test Cases:** 8 tests

---

### Phase 3: Complete Game Scenarios (MEDIUM PRIORITY)
**Goal:** Test full end-to-end gameplay

**Files to Create:**
1. `tests/e2e/complete-game-scenarios.spec.ts`
2. `tests/e2e/victory-celebration.spec.ts`

**Estimated Time:** 2-3 hours  
**Test Cases:** 8 tests

---

### Phase 4: Edge Cases & Integration (LOW PRIORITY)
**Goal:** Test error handling and integration points

**Files to Create:**
1. `tests/e2e/error-recovery.spec.ts`
2. `tests/e2e/performance.spec.ts`

**Estimated Time:** 2 hours  
**Test Cases:** 6 tests

---

## 📝 Detailed Implementation Plan

### PHASE 1: Core Bingo Functionality

#### 1.1 Bingo Line Detection (`bingo-line-detection.spec.ts`)

**Test 1.1.1: Horizontal Row Completion**
```
Description: Verify system detects when player completes a horizontal row
Steps:
  1. Complete tiles in positions 0, 1, 2 (top row)
  2. Verify "BINGO!" notification appears
  3. Verify score updates (100 points for line)
  4. Verify game doesn't end immediately (allows multi-line)

Expected Result: System detects horizontal line correctly
Priority: HIGH
Complexity: MEDIUM
```

**Test 1.1.2: Vertical Column Completion**
```
Description: Verify system detects vertical column completion
Steps:
  1. Complete tiles in positions 0, 3, 6 (left column)
  2. Verify "BINGO!" notification
  3. Verify score update

Expected Result: System detects vertical line
Priority: HIGH
Complexity: MEDIUM
```

**Test 1.1.3: Main Diagonal Completion**
```
Description: Verify system detects main diagonal (top-left to bottom-right)
Steps:
  1. Complete tiles in positions 0, 4, 8
  2. Verify diagonal detection

Expected Result: System detects main diagonal
Priority: HIGH
Complexity: MEDIUM
```

**Test 1.1.4: Anti-Diagonal Completion**
```
Description: Verify system detects anti-diagonal (top-right to bottom-left)
Steps:
  1. Complete tiles in positions 2, 4, 6
  2. Verify anti-diagonal detection

Expected Result: System detects anti-diagonal
Priority: HIGH
Complexity: MEDIUM
```

**Test 1.1.5: Multi-Line Bonus Detection**
```
Description: Verify system awards bonus when completing 2+ lines
Steps:
  1. Complete row AND column (positions 0,1,2 AND 0,3,6)
  2. Verify "DOUBLE BINGO!" notification
  3. Verify multi-line bonus (+50 points)
  4. Verify total score = 100 + 100 + 50 = 250

Expected Result: Multi-line bonus applied correctly
Priority: HIGH
Complexity: HIGH
```

#### 1.2 Score Display (`score-display.spec.ts`)

**Test 1.2.1: Base Score Calculation**
```
Description: Verify base score calculation (100 points per line)
Mock Data:
  scoreInfo: {
    score: 100,
    base_score: 100,
    bonuses: [],
    lines: [{type: 'row', positions: [0,1,2]}]
  }

Expected Result: ScoreDisplay shows 100 points, base score 100
Priority: HIGH
Complexity: LOW
```

**Test 1.2.2: Multi-Line Bonus Display**
```
Description: Verify multi-line bonus shown in ScoreDisplay
Mock Data:
  scoreInfo: {
    score: 250,
    base_score: 200,
    bonuses: [{type: 'multi_line', points: 50}],
    lines: 2 lines
  }

Expected Result: Shows +50 multi-line bonus
Priority: HIGH
Complexity: LOW
```

**Test 1.2.3: Speed Bonus Display**
```
Description: Verify speed bonus shown when completing quickly
Mock Data:
  scoreInfo: {
    score: 125,
    base_score: 100,
    bonuses: [{type: 'speed', points: 25}],
    lines: 1 line
  }

Expected Result: Shows +25 speed bonus
Priority: MEDIUM
Complexity: LOW
```

**Test 1.2.4: Combined Bonuses Display**
```
Description: Verify all bonuses displayed together
Mock Data:
  scoreInfo: {
    score: 275,
    base_score: 200,
    bonuses: [
      {type: 'multi_line', points: 50},
      {type: 'speed', points: 25}
    ],
    lines: 2 lines
  }

Expected Result: Shows both bonuses, total 275
Priority: MEDIUM
Complexity: LOW
```

**Test 1.2.5: Completed Lines Visualization**
```
Description: Verify visual representation of completed lines
Expected Result:
  - Shows icons for each completed line
  - Row shows "—" icon
  - Column shows "|" icon
  - Diagonal shows "\" icon

Priority: MEDIUM
Complexity: LOW
```

#### 1.3 Tie-Breaking (`tie-breaking.spec.ts`)

**Test 1.3.1: Most Lines Wins**
```
Description: Verify player with most completed lines wins
Scenario:
  - Player A: 2 lines completed (250 points)
  - Player B: 1 line completed (100 points)
  
Expected Result: Player A wins, "Most lines completed" shown
Priority: HIGH
Complexity: HIGH
```

**Test 1.3.2: Efficiency Tie-Breaker**
```
Description: Verify efficiency used when lines are equal
Scenario:
  - Player A: 1 line, 3 tiles (wins - more efficient)
  - Player B: 1 line, 4 tiles

Expected Result: Player A wins due to fewer tiles
Priority: HIGH
Complexity: HIGH
```

**Test 1.3.3: Simultaneous Completion**
```
Description: Verify tie-breaker triggers when multiple players bingo
Scenario:
  - Player A completes line at same time as Player B
  - Tie-breaker logic should run automatically

Expected Result: System handles simultaneous completion
Priority: HIGH
Complexity: HIGH
```

**Test 1.3.4: Tie-Breaker Explanation Display**
```
Description: Verify victory shows why player won
Expected Result:
  - Shows "Won with most lines completed" OR
  - Shows "Won with more efficient play"

Priority: MEDIUM
Complexity: MEDIUM
```

---

### PHASE 2: Multi-Player & Synchronization

#### 2.1 Real-Time Sync (`multiplayer-sync.spec.ts`)

**Test 2.1.1: Score Sync Across Players**
```
Description: Verify score updates broadcast to all players
Setup:
  - Player 1 browser context
  - Player 2 browser context
  - Both in same room

Steps:
  1. Player 1 completes bingo line
  2. Verify Player 2 sees Player 1's updated score

Expected Result: Score updates visible to all players
Priority: MEDIUM
Complexity: HIGH
```

**Test 2.1.2: Tile State Sync**
```
Description: Verify tile completion visible to all players
Expected Result: When Player A completes tile, Player B sees it marked complete
Priority: MEDIUM
Complexity: HIGH
```

**Test 2.1.3: Turn Indicator Sync**
```
Description: Verify turn changes broadcast to all players
Expected Result: All players see updated turn indicator
Priority: MEDIUM
Complexity: MEDIUM
```

**Test 2.1.4: Game End Broadcast**
```
Description: Verify game end state visible to all players
Expected Result: All players see same winner announcement
Priority: MEDIUM
Complexity: MEDIUM
```

#### 2.2 Spectator Mode (`spectator-mode.spec.ts`)

**Test 2.2.1: Spectator Join**
```
Description: Verify spectator can join and view game
Steps:
  1. Create room
  2. Join as spectator
  3. Verify spectator view loads

Expected Result: Spectator sees all player boards
Priority: LOW
Complexity: LOW
```

**Test 2.2.2: Spectator Real-Time Updates**
```
Description: Verify spectator sees real-time game updates
Expected Result: Spectator sees tile completions, scores, winner
Priority: LOW
Complexity: HIGH
```

---

### PHASE 3: Complete Game Scenarios

#### 3.1 End-to-End Games (`complete-game-scenarios.spec.ts`)

**Test 3.1.1: Single Player Game**
```
Description: Complete full single-player bingo game
Steps:
  1. Create room
  2. Join game
  3. Complete tiles (upload audio for each)
  4. Complete bingo line
  5. See victory with score

Expected Result: Full game flow works correctly
Priority: MEDIUM
Complexity: HIGH
```

**Test 3.1.2: Multi-Player Competitive Game**
```
Description: Complete full multi-player game with competition
Steps:
  1. Player 1 creates room
  2. Player 2 joins
  3. Both complete tiles
  4. Tie-breaker determines winner
  5. All see victory celebration

Expected Result: Competitive gameplay works
Priority: MEDIUM
Complexity: VERY HIGH
```

**Test 3.1.3: Error Recovery Flow**
```
Description: Test game continues after WebSocket disconnect/reconnect
Steps:
  1. Play game
  2. Simulate disconnect
  3. Reconnect
  4. Continue playing
  5. Complete game successfully

Expected Result: Game state preserved and continues
Priority: LOW
Complexity: HIGH
```

#### 3.2 Victory Celebration (`victory-celebration.spec.ts`)

**Test 3.2.1: Winner Announcement**
```
Description: Verify victory shows winner name and score
Expected Result:
  - Shows "🎉 [Player Name] Wins!"
  - Shows final score
  - Shows lines completed

Priority: MEDIUM
Complexity: LOW
```

**Test 3.2.2: Score Breakdown in Victory**
```
Description: Verify detailed score shown in victory
Expected Result: Shows base score, all bonuses, total
Priority: MEDIUM
Complexity: LOW
```

**Test 3.2.3: Tie-Breaker Victory**
```
Description: Verify tie-breaker victory explains win reason
Expected Result: Shows why winner won (most lines/efficiency)
Priority: MEDIUM
Complexity: MEDIUM
```

**Test 3.2.4: Loser View**
```
Description: Verify non-winners see final results
Expected Result: Shows who won and their own final score
Priority: LOW
Complexity: LOW
```

---

## 📈 Testing Metrics & Goals

### Coverage Goals

| Category | Current | Target | Priority |
|----------|---------|--------|----------|
| Bingo Line Detection | 0% | 100% | HIGH |
| Score Calculation | 0% | 100% | HIGH |
| Tie-Breaking Logic | 0% | 100% | HIGH |
| Multi-Player Sync | 0% | 100% | MEDIUM |
| Victory Celebration | 60% | 100% | MEDIUM |
| Complete Scenarios | 0% | 100% | MEDIUM |
| Error Handling | 100% | 100% | LOW |
| **OVERALL** | **35%** | **95%** | |

### Test Execution Targets

- **Unit Tests:** All tests should pass in < 10 seconds each
- **Integration Tests:** Full suite should complete in < 5 minutes
- **Browser Coverage:** Test on Chromium, WebKit, Firefox
- **Responsive Tests:** Test on mobile and desktop viewport sizes

---

## 🚀 Implementation Steps

### Step 1: Create Test Files Structure
```
tests/e2e/
├── bingo-line-detection.spec.ts    (NEW)
├── score-display.spec.ts            (NEW)
├── tie-breaking.spec.ts             (NEW)
├── multiplayer-sync.spec.ts         (NEW)
├── spectator-mode.spec.ts           (NEW)
├── complete-game-scenarios.spec.ts  (NEW)
├── victory-celebration.spec.ts      (NEW)
├── error-recovery.spec.ts           (NEW)
└── battle-flows.spec.ts             (EXISTING - needs updates)
```

### Step 2: Update Playwright Configuration
```typescript
// playwright.config.ts updates needed:
- Add testTimeout: 30000 (30 seconds for complex flows)
- Add retries: 3 (for flaky multi-player tests)
- Add expect timeout configurations
- Add custom fixtures for game state management
```

### Step 3: Create Test Utilities
```typescript
// tests/e2e/utils/game-fixtures.ts
- GameStateManager fixture
- PlayerContext fixture (for multi-player tests)
- Mock API server setup
- Random room/code generators
```

### Step 4: Implement Tests (in order of priority)
1. Bingo line detection (5 tests)
2. Score display (5 tests)
3. Tie-breaking (4 tests)
4. Multi-player sync (4 tests)
5. Complete scenarios (4 tests)
6. Victory celebration (4 tests)

### Step 5: Run and Fix
```bash
# Run all tests
npm run test:e2e

# Run specific test file
npx playwright test tests/e2e/bingo-line-detection.spec.ts

# Run with debug
npx playwright test --debug

# Generate coverage report
npx playwright test --coverage
```

---

## 📋 Testing Checklist

### Before Implementation
- [ ] Review existing test structure
- [ ] Set up Notion database for test tracking
- [ ] Create test utilities and fixtures
- [ ] Verify Playwright configuration

### During Implementation
- [ ] Write tests for each scenario
- [ ] Add comprehensive comments
- [ ] Use meaningful test names
- [ ] Include assertions for all expected states
- [ ] Mock external dependencies properly

### After Implementation
- [ ] Run full test suite
- [ ] Fix any failing tests
- [ ] Verify cross-browser compatibility
- [ ] Check performance (test execution time)
- [ ] Update documentation
- [ ] Create test summary report

---

## 🎯 Success Criteria

### Functional Goals
- ✅ All 26 new test cases pass
- ✅ Cross-browser compatibility verified
- ✅ Multi-player scenarios work correctly
- ✅ Error recovery handles disconnections
- ✅ 95% overall test coverage achieved

### Performance Goals
- ✅ Test suite runs in < 5 minutes
- ✅ Individual tests complete in < 30 seconds
- ✅ Parallel execution works correctly
- ✅ No flaky tests (retry rate < 5%)

### Quality Goals
- ✅ Tests are maintainable and well-documented
- ✅ Clear test names and assertions
- ✅ Proper use of fixtures and mocking
- ✅ Integration with CI/CD pipeline

---

## 📚 Resources & References

### Playwright Documentation
- https://playwright.dev/docs/intro
- https://playwright.dev/docs/test-annotations
- https://playwright.dev/docs/api/class-test

### Notion API Documentation
- https://developers.notion.com/reference/post-page
- https://developers.notion.com/docs/working-with-databases

### Project Resources
- `playwright.config.ts` - Test configuration
- `tests/e2e/battle-flows.spec.ts` - Existing tests
- Backend bingo implementation: `backend/game_engine/bingo_utils.py`
- Frontend ScoreDisplay: `src/components/game/ScoreDisplay.tsx`

---

## 🔄 Next Steps

1. **Immediate:** Create Phase 1 test files (bingo line detection, score display, tie-breaking)
2. **Short-term:** Implement Phase 2 (multi-player sync, spectator mode)
3. **Medium-term:** Complete Phase 3 (complete scenarios, victory celebration)
4. **Ongoing:** Add edge cases and performance tests

---

**Document Status:** ✅ Ready for Implementation  
**Last Updated:** January 15, 2026  
**Prepared By:** Development Team  
