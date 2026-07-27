# Task 3 Student Brief — extract BINGO_LINE_COUNT = 5 (VERIFY VS MODEL FIRST)

**Issue:** #340 · **Bead:** sound-royale-ny-churn-3 · **Plan:** `.hermes/plans/2026-07-19_churn-game-rule-constants.md` Task 3

**Refactor only. No behavior change. CRITICAL: verify the value before naming.**

## Step 0 — VERIFY (do not guess)
Read `backend/game_engine/models.py` (Tile / Board models) and `backend/game_engine/bingo_utils.py`.
Determine what the literal `5` represents at these sites:
- `backend/game_engine/views.py` ~line 406: `len(current_player_tiles) >= 5`
- `src/components/game/BingoBoard.tsx` ~line 58: `completedCount >= 5`
Is `5` the **bingo line count** (e.g. 5-in-a-row on a 3×3 board uses 5 lines), or the **board size** (3×3=9 tiles, but a line is 3)? The name must match reality:
- If it's the count of winning lines → `BINGO_LINE_COUNT = 5`
- If it's something else → pick the accurate name/value and state your reasoning in the bookbag notes.

## Steps (after verify)
1. In `backend/game_engine/models.py` (after `MAX_SPECTATORS = 10`), add the verified constant, e.g.:
   ```python
   # Number of winning lines that constitute a bingo on the 3x3 board.
   BINGO_LINE_COUNT = 5
   ```
2. In `backend/game_engine/views.py` ~line 406: `len(current_player_tiles) >= 5` → `>= Room.BINGO_LINE_COUNT`.
3. In `src/types/game.ts` (after `MIN_PRODUCERS_TO_PLAY`): `export const BINGO_LINE_COUNT = 5;` with a sync comment.
4. In `src/components/game/BingoBoard.tsx` ~line 58: `completedCount >= 5` → `>= BINGO_LINE_COUNT` (import from `@/types/game`).
5. Verify: `cd /Users/brandonbennett/sound-royale-ny && npx tsc --noEmit` (0 errors) and `bash scripts/gaia-gate.sh` → "ALL GATES PASSED".
6. Do NOT commit/push/gh. Write bookbag to `.hermes/bookbag/students/task3-bingo-line.json`:
   `{"bead":"sound-royale-ny-churn-3","issue":340,"task":"extract BINGO_LINE_COUNT","files_changed":["backend/game_engine/models.py","backend/game_engine/views.py","src/types/game.ts","src/components/game/BingoBoard.tsx"],"verification":{"tsc":"pass","gaia_gate":"ALL GATES PASSED"},"notes":"<what 5 means + name chosen>"}`
