# Remaining Churn — Game-Rule Constants & Voting-UI Tests

> **For Hermes:** Execute task-by-task via the agent-school pipeline (agent-school-core +
> issue-to-pr-pipeline). Each task = one `ready-for-agent` issue → bead → worktree →
> Student sub-agent → two-judge review (CTO + COO) → gaia gate → PR.

**Goal:** Eliminate the duplicated magic-number business rules in Sound Royale's
ranked/casual + round logic by extracting them into named constants (backend
`Room` model + frontend `src/types/game.ts`), and close the untested voting-UI gap.
This removes the silent-drift churn where changing a threshold (e.g. min players,
spectator cap) requires hunting 6+ hardcoded sites. The `MIN_SPECTATORS_FOR_RANKED`
consolidation (done, commit `afa2526`) is the template — this plan finishes the rest.

**Architecture:** Single source of truth per rule — a class constant on `Room` in
`backend/game_engine/models.py` + a matching `export const` in `src/types/game.ts`.
Replace every inline literal. Keep behavior identical (refactor only, no logic change).
Add vitest unit tests for `VotingPanel` + `RoundStage` (currently zero coverage per
codegraph blast-radius flag).

**Tech Stack:** Django 4.2 (python3.11) backend, React 18 + TypeScript (vitest) frontend.
Verification: `scripts/gaia-gate.sh` (authoritative, runs isolated-worktree full suite).

**Precondition / BLOCKER:** agent-school P1 bead `sound-royale-ny-sh1` — the 2-judge
review stage has no Student handoffs + adversarial state uninitialized. Resolve by
running `scripts/bookbag_review_bridge.py` init (or manual state seed) BEFORE dispatching,
or the dispatched beads cannot reach APPROVED. Do not bypass the adversarial layer.

---

### Task 1: Extract MIN_PRODUCERS_TO_PLAY = 2
**Objective:** Centralize the "≥2 producers to start/play" rule used in 6 places.
**Files:**
- Modify: `backend/game_engine/models.py` (add `MIN_PRODUCERS_TO_PLAY = 2` near `MIN_SPECTATORS_FOR_RANKED`)
- Modify: `backend/game_engine/views.py:852` (`len(players) < 2`), `:1264` (`len(producers) >= 2`), `:1380` (`producers.count() < 2`)
- Modify: `src/types/game.ts` (add `export const MIN_PRODUCERS_TO_PLAY = 2`)
- Modify: `src/components/lobby/LobbyWaitingRoom.tsx:95,107` (`players.length >= 1` / `>= 2`)
- Modify: `src/components/game/RoomBrowser.tsx:87,94,144` (`players.length >= 2`)
**Step 1:** Add constant to both modules.
**Step 2:** Replace each inline `2` with the constant (keep `< 2` / `>= 2` comparisons).
**Step 3:** `npx tsc --noEmit` + `npx eslint` on changed files → 0 errors.
**Step 4:** `scripts/gaia-gate.sh` → ALL GATES PASSED.
**Step 5:** Commit isolated bead.

### Task 2: Extract MAX_SPECTATORS = 10
**Objective:** Centralize spectator cap.
**Files:**
- Modify: `backend/game_engine/models.py` (add `MAX_SPECTATORS = 10`)
- Modify: `backend/game_engine/views.py:716` (`spectator_count >= 10`)
**Step 1-4:** Same pattern as Task 1. Note: error message "Spectator limit reached (max 10)" → use `MAX_SPECTATORS` in the string too.

### Task 3: Extract BINGO_LINE_COUNT = 5 (verify against model first)
**Objective:** Centralize bingo line/board-count threshold split across stacks.
**Files:**
- Modify: `backend/game_engine/views.py:406` (`len(current_player_tiles) >= 5`)
- Modify: `src/components/game/BingoBoard.tsx:58` (`completedCount >= 5`)
**Step 0 (verify):** confirm `5` is the bingo line count, not board size — check `models.py` Tile/Board and `bingo_utils.py`. If it's actually a different constant, adjust name/value accordingly (do not guess).
**Step 1-4:** Extract constant + replace; gaia gate green; commit.

### Task 4: Extract sweep/margin constants
**Objective:** Name the sweep-detection magic numbers.
**Files:**
- Modify: `backend/game_engine/models.py` (add `SWEEP_ROUNDS = 3`, `SWEEP_VOTE_MARGIN = 1`)
- Modify: `backend/game_engine/views.py:329` (`== 3` resolved rounds), `:1268` (`vote_margin == 1`)
**Step 1-4:** Replace literals; gaia gate green; commit.

### Task 5: Extract round-count bounds
**Objective:** Name MIN/MAX rounds used in UI validation.
**Files:**
- Modify: `src/types/game.ts` (add `MIN_ROUNDS = 1`, `MAX_ROUNDS = 10`)
- Modify: `src/components/game/MultiRoundConfig.tsx:24` (`newRounds >= 1 && newRounds <= 10`)
**Step 1-4:** Replace; gaia gate green; commit.

### Task 6: Add vitest unit tests for VotingPanel + RoundStage
**Objective:** Close the zero-coverage gap flagged by codegraph (no covering tests).
**Files:**
- Create: `src/components/game/__tests__/VotingPanel.test.tsx`
- Create: `src/components/game/__tests__/RoundStage.test.tsx`
**Step 1 (TDD):** Write test asserting `isRanked` true when `spectatorCount >= MIN_SPECTATORS_FOR_RANKED`, false below; RoundStage shows "Ranked voting" vs "Casual mode" badge correctly.
**Step 2:** Run `npx vitest run src/components/game/__tests__/VotingPanel.test.tsx src/components/game/__tests__/RoundStage.test.tsx` → PASS.
**Step 3:** gaia gate green; commit.

---

**Risks / tradeoffs:**
- Task 3 requires model verification — `5` could be board-size, not line-count. Confirm before naming.
- All tasks are refactors (behavior-preserving). If any gaia gate fails, it's a typo, not logic — fix in the same bead.
- Do NOT touch `match_type` recompute logic (already settled per user option b).
- Keep beads isolated (one constant family per commit) so review is clean and rollback is scoped.

**Execution:** For each task → `gh issue create --label "ready-for-agent"` → `bd` seed →
`scripts/conductor/dispatch.sh` worktree → Student sub-agent → `bookbag_review_bridge.py
dispatch-judges --bead <id>` (CTO+COO) → `reconcile` → gaia gate → PR. Resolve
`sound-royale-ny-sh1` blocker first so the judge stage can run.
