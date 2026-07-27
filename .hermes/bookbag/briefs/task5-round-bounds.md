# Task 5 Student Brief — extract MIN_ROUNDS=1 / MAX_ROUNDS=10 bounds

**Issue:** #342 · **Bead:** sound-royale-ny-churn-5 · **Plan:** `.hermes/plans/2026-07-19_churn-game-rule-constants.md` Task 5

**Refactor only. No behavior change.**

## Steps
1. In `src/types/game.ts` (after `BINGO_LINE_COUNT` — but note: if Task 3 was renamed to MIN_TILES_FOR_BINGO_RESOLUTION, place after that), add:
   ```ts
   // Min/max rounds a match can be configured to run.
   export const MIN_ROUNDS = 1;
   export const MAX_ROUNDS = 10;
   ```
2. In `src/components/game/MultiRoundConfig.tsx` ~line 24: replace `newRounds >= 1 && newRounds <= 10` with `newRounds >= MIN_ROUNDS && newRounds <= MAX_ROUNDS` (import from '@/types/game' if needed).
3. Verify: `cd /Users/brandonbennett/sound-royale-ny && npx tsc --noEmit` (0 errors) and `bash scripts/gaia-gate.sh` → "ALL GATES PASSED".
4. Do NOT commit/push/gh. Write bookbag to `.hermes/bookbag/students/task5-round-bounds.json`:
   `{"bead":"sound-royale-ny-churn-5","issue":342,"task":"extract round bounds","files_changed":["src/types/game.ts","src/components/game/MultiRoundConfig.tsx"],"verification":{"tsc":"pass","gaia_gate":"ALL GATES PASSED"}}`

DEPENDENCY: Tasks 3 and 4 must be committed first (constants stack in models.py / game.ts in order). If BINGO_LINE_COUNT / sweep constants are not yet present when you run, STOP and report.
