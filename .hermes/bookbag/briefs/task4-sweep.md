# Task 4 Student Brief — extract sweep constants SWEEP_ROUNDS=3 / SWEEP_VOTE_MARGIN=1

**Issue:** #341 · **Bead:** sound-royale-ny-churn-4 · **Plan:** `.hermes/plans/2026-07-19_churn-game-rule-constants.md` Task 4

**Refactor only. No behavior change.**

## Steps
1. In `backend/game_engine/models.py` (after `BINGO_LINE_COUNT` from Task 3), add:
   ```python
   # Number of resolved rounds that triggers a "sweeper" bonus.
   SWEEP_ROUNDS = 3
   # Vote-margin threshold (winner votes minus rest) that flags a sweep.
   SWEEP_VOTE_MARGIN = 1
   ```
2. In `backend/game_engine/views.py` ~line 329: replace the literal `== 3` (resolved-rounds sweep check) with `== Room.SWEEP_ROUNDS`.
3. In `backend/game_engine/views.py` ~line 1268: replace `vote_margin == 1` with `vote_margin == Room.SWEEP_VOTE_MARGIN`.
4. Verify: `cd /Users/brandonbennett/sound-royale-ny && npx tsc --noEmit` (0 errors) and `bash scripts/gaia-gate.sh` → "ALL GATES PASSED".
5. Do NOT commit/push/gh. Write bookbag to `.hermes/bookbag/students/task4-sweep.json`:
   `{"bead":"sound-royale-ny-churn-4","issue":341,"task":"extract sweep constants","files_changed":["backend/game_engine/models.py","backend/game_engine/views.py"],"verification":{"tsc":"pass","gaia_gate":"ALL GATES PASSED"}}`

NOTE: Task 3 (BINGO_LINE_COUNT) must be committed first — these constants stack in models.py in order. If BINGO_LINE_COUNT is not yet present when you run, STOP and report (dependency on Task 3).
