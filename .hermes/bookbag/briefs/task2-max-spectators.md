# Task 2 Student Brief — extract MAX_SPECTATORS = 10

**Issue:** #339 · **Bead:** sound-royale-ny-churn-2 · **Plan:** `.hermes/plans/2026-07-19_churn-game-rule-constants.md` Task 2

**Refactor only. No behavior change.**

## Steps
1. In `backend/game_engine/models.py` (next to `MIN_PRODUCERS_TO_PLAY = 2` ~line 66), add:
   ```python
   # Maximum spectators allowed in a room.
   MAX_SPECTATORS = 10
   ```
2. In `backend/game_engine/views.py` ~line 716, replace:
   `if spectator_count >= 10:` → `if spectator_count >= Room.MAX_SPECTATORS:`
   Also update the error string `"Spectator limit reached (max 10)"` → use `Room.MAX_SPECTATORS` (e.g. `f"Spectator limit reached (max {Room.MAX_SPECTATORS})"`).
3. Verify: `cd /Users/brandonbennett/sound-royale-ny && npx tsc --noEmit` (0 errors) and `bash scripts/gaia-gate.sh` → "ALL GATES PASSED".
4. Do NOT commit/push/gh. Write bookbag to `.hermes/bookbag/students/task2-max-spectators.json`:
   `{"bead":"sound-royale-ny-churn-2","issue":339,"task":"extract MAX_SPECTATORS","files_changed":["backend/game_engine/models.py","backend/game_engine/views.py"],"verification":{"tsc":"pass","gaia_gate":"ALL GATES PASSED"}}`
