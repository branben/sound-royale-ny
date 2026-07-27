# Task 6 Student Brief — add vitest coverage for VotingPanel + RoundStage

**Issue:** #343 · **Bead:** sound-royale-ny-churn-6 · **Plan:** `.hermes/plans/2026-07-19_churn-game-rule-constants.md` Task 6

**NEW TESTS (not a refactor). Closes the zero-coverage gap flagged by codegraph for VotingPanel + RoundStage.**

## Context to read first
- `src/components/game/VotingPanel.tsx` — has `isRanked = spectatorCount >= MIN_SPECTATORS_FOR_RANKED` (imports the constant from '@/types/game').
- `src/components/game/RoundStage.tsx` — shows "Ranked voting" badge when `spectatorCount >= MIN_SPECTATORS_FOR_RANKED`, "Casual mode" when below.
- Existing test setup: check `src/**/__tests__/*.test.tsx` for the vitest + RTL pattern (imports, `describe/it/expect`, `render`, `screen`).

## Steps
1. Create `src/components/game/__tests__/VotingPanel.test.tsx`:
   - Render `<VotingPanel ... spectatorCount={2} votingOpen={false} />` → assert text "Waiting for more spectators to join (2/3 for ranked mode)" present (confirms isRanked=false path + copy uses the constant).
   - Render with `spectatorCount={3}` → assert "Waiting for producers to finish their beats..." present (isRanked=true path).
   - Use `MIN_SPECTATORS_FOR_RANKED` from '@/types/game' in the test assertions (don't hardcode 3).
2. Create `src/components/game/__tests__/RoundStage.test.tsx`:
   - Render `<RoundStage roundNumber={1} spectatorCount={3} votingOpen={false} />` → assert "Ranked voting" badge present.
   - Render with `spectatorCount={2}` → assert "Casual mode" badge present.
3. Verify: `cd /Users/brandonbennett/sound-royale-ny && npx vitest run src/components/game/__tests__/VotingPanel.test.tsx src/components/game/__tests__/RoundStage.test.tsx` → must PASS. Then `npx tsc --noEmit` (0 errors) and `bash scripts/gaia-gate.sh` → "ALL GATES PASSED".
4. Do NOT commit/push/gh. Write bookbag to `.hermes/bookbag/students/task6-voting-tests.json`:
   `{"bead":"sound-royale-ny-churn-6","issue":343,"task":"add voting-UI vitest coverage","files_changed":["src/components/game/__tests__/VotingPanel.test.tsx","src/components/game/__tests__/RoundStage.test.tsx"],"verification":{"vitest":"pass","tsc":"pass","gaia_gate":"ALL GATES PASSED"}}`

DEPENDENCY: none on prior tasks (new files). But run AFTER Tasks 1-5 are committed so the tree is clean.
