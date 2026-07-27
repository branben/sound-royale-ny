# Sound Royale — Delegation Roadmap (CE /ce-plan, consolidation + non-colliding workstreams)

> Goal: get Sound Royale production-ready by decomposing the real blockers into
> independent student workstreams whose scopes cannot step on each other.
> Supersedes the narrative-only `prod-readiness-roadmap.md` with a delegation-aware cut:
> explicit file-ownership allowlists, isolated branches, serialized parent merge.

## Anti-collision principle (the only rule that matters)

1. **Isolated branch per student.** Every stream below runs in its own git branch /
   Orca worktree. Students write code only; they never `git push`, never `gh`, never
   merge. (Auth-boundary rule from agent-school-core — leaf agents have no gh/API keys.)
2. **File-allowlist per stream.** A student may only edit files in its allowlist.
   Edits outside it = scope breach → parent rejects the PR. Where two streams touch
   the same directory, they edit *different, non-adjacent lines* so a 3-way merge is clean.
3. **Serialized parent merge + re-gate.** Parent merges streams in dependency order
   (0 → 1 → 2 → 3 → 4), running `scripts/gaia-gate.sh` after each merge. Conflicts
   (if any) are resolved once, centrally, by the parent — never by students stomping
   each other. Each merged stream is re-verified green before the next lands.

## Stream 0 — GREEN PIPELINE (base, merge FIRST)

- **GitHub:** #137 (E5 CI-green gate) + #134 (E2: wire Django+Redis into e2e-full)
- **Branch:** `fix/ci-green-e2e-backend`
- **Allowlist:**
  - `.github/workflows/e2e.yml` (DELETE — orphaned npm duplicate)
  - `.github/workflows/gaia-guards-ci.yml` (drop `version:` pins on 4 `pnpm/action-setup` blocks; add Django+Redis service containers to `e2e-full` job)
  - `.github/workflows/visual-verify.yml` (drop `version: 9` pins)
  - `tests/e2e/playwright.config.ts` (baseURL, projects, webServer boot for Django+Redis)
  - backend e2e fixtures (`backend/game_engine/fixtures*.py` if needed for CI)
- **Out of scope:** any `*.spec.ts` test body, any `src/**`, any `backend/game_engine/*.py` logic.
- **Acceptance gate:** `gh run list --workflow "Sound Royale CI" --branch main` → all jobs
  `completed success`; the `e2e-full` job actually executes (not a 29s abort).
- **Judge:** CTO (CI correctness) + COO (no stray workflow references) before parent merge.
- **Why first:** every other stream's tests are unverifiable until CI runs. Nothing else lands
  on top of a red base.

## Stream 1 — UN-SKIP + REPAIR CORE E2E SPECS (parallel student)

- **GitHub:** #249 (E2E ~60 residual failures) + #137 (proves DoD)
- **Branch:** `test/e2e-core-flows`
- **Allowlist (owns ALL spec + POM files):**
  - `tests/e2e/live/create-join-start.spec.ts`, `casual-full-game.spec.ts`, `ranked-full-game.spec.ts`, `spectator-live.spec.ts`
  - `tests/e2e/multiplayer.spec.ts`, `producer-flow.spec.ts`, `host-migration.spec.ts`,
    `rejoin-recovery.spec.ts`, `reconnect-recovery.spec.ts`, `tie-breaking.spec.ts`,
    `score-display.spec.ts`, `leaderboard.spec.ts`
  - `tests/e2e/negative-scenarios/{disconnections,host-kick,invalid-votes}.spec.ts`
  - `tests/e2e/live/pom/GameOrchestrator.ts`, `tests/e2e/live/helpers.ts`
- **Out of scope:** workflow files (Stream 0), `playwright.config.ts` (Stream 0), `src/**`, `backend/**`.
- **Acceptance gate:** `grep -rn "test.fixme(true)" tests/e2e/` → **zero** matches;
  `e2e-full` green on the branch after rebasing onto Stream 0.
- **Judge:** CTO (spec correctness, no bypassed timer branches — the #125 trap) + COO (every DoD
  `testRefs` resolves to a now-real test).
- **Note:** depends on Stream 0 landing (needs backend in CI to verify). Developed in parallel
  against the known contract; rebased onto Stream 0 before merge.

## Stream 2 — GUARDRAIL #102 VISIBLE ERRORS (parallel student)

- **GitHub:** #102 (replace silent error handling)
- **Branch:** `feat/guardrail-102`
- **Allowlist:**
  - `backend/game_engine/consumers.py` (no swallowed DB exceptions), `views.py`, `serializers.py`
  - `src/**` catch/except blocks → surface via toast/banner/error state (NOT `console.error` only)
- **Out of scope:** `*.spec.ts` (Stream 1), workflow files (Stream 0), ReconnectingBanner (Stream 3),
  constant literals (Stream 4).
- **Acceptance gate:** `pnpm run test:backend` green; `pnpm run verify:types` clean;
  `grep -rnE "except:|catch\s*\(.*\)\s*\{\s*\}"` on changed files shows no empty bodies.
- **Judge:** CTO (no silent swallow remains) + COO (user-visible path added).
- **Merge note:** may share `src/components/**` files with Stream 4 but edits *different lines*
  (catch blocks vs constant literals) → 3-way merge clean. Parent merges Stream 2 before Stream 4.

## Stream 3 — DESIGN-SYSTEM REGRESSION #133 (parallel student)

- **GitHub:** #133 (ReconnectingBanner side-tab + animate-pulse)
- **Branch:** `fix/reconnecting-banner`
- **Allowlist:** `src/components/**/ReconnectingBanner.tsx` + its scoped CSS/Tailwind only.
- **Out of scope:** everything else (single-file stream — zero collision risk).
- **Acceptance gate:** tsc clean; `visual-verify.yml` snapshot diff reviewed (no `animate-pulse`,
  no glow/gradient per MASTER.md); no new always-on pulse.
- **Judge:** CTO (design-system compliance) + COO (regression fixed, not widened).

## Stream 4 — CHURN CONSTANT EXTRACTION #338–342 (parallel student)

- **GitHub:** #338–342 (extract magic numbers to named constants)
- **Branch:** `refactor/churn-constants`
- **Allowlist:**
  - `backend/game_engine/bingo_utils.py` (MIN_ROUNDS, MAX_ROUNDS, SWEEP_ROUNDS, SWEEP_VOTE_MARGIN, BINGO_LINE_COUNT)
  - `src/types/game.ts` (MAX_SPECTATORS, MIN_PRODUCERS_TO_PLAY)
  - `src/components/{VotingPanel,RoundStage,GameInfo,Room}.tsx` (replace hardcoded `>= 3` / literals)
- **Out of scope:** spec files (Stream 1), error-handling blocks (Stream 2), ReconnectingBanner (Stream 3).
- **Acceptance gate:** `grep -rnE ">= 3|< 3|\b(MIN|MAX|SWEEP)[A-Z_]*\b" src backend` for the OLD literals
  → **zero** remaining; tsc + `test:backend` green.
- **Judge:** CTO (name accuracy — e.g. `BINGO_LINE_COUNT` vs `MIN_TILES_FOR_BINGO_RESOLUTION`) + COO.
- **Merge note:** must run AFTER Stream 2 (both may touch the same 4 component files; Stream 2
  lands first, Stream 4 rebases on it). Constant-literal lines differ from catch-block lines → clean.

## Stream 5 — PARENT-ONLY: TRIAGE + DEPLOY GATE (no student)

- **GitHub:** #202/#203/#204/#205/#231 (bot-PR closure) + optional deploy gate
- **Owner:** parent session (needs `gh` + git push — students have no creds)
- **Work:**
  - `gh pr list --state open --label ready-for-agent` → close ~37 bot PRs as `superseded`/`duplicate`
    where their unique tests were merged into Stream 1; link owning PR.
  - After Stream 0 green, add a `deploy` job to `gaia-guards-ci.yml` gated on `e2e-full` success
    (edit lands AFTER Stream 0 merge to avoid workflow-file collision).
- **Acceptance gate:** open PR count drops; deploy job runs on `main` only after all checks green.

## Merge sequence (parent executes, re-gating each)

```
0  fix/ci-green-e2e-backend     → main   (gh run all green; e2e-full executes)
1  test/e2e-core-flows          → main   (rebase on 0; grep fixme=0; e2e-full green)
2  feat/guardrail-102           → main   (rebase on 1; backend+tsc green)
3  fix/reconnecting-banner      → main   (rebase on 2; visual-verify clean)
4  refactor/churn-constants     → main   (rebase on 2; grep old literals=0)
5  parent: close bot PRs + deploy gate
```

Each merge runs `scripts/gaia-gate.sh` (the ~90s pre-push full suite: tsc + eslint + secret scan +
vitest + django + vite build). Use `terminal(..., timeout=600)` for pushes.

## Guardian rules for the delegation

- **Students are leaves:** isolated worktree, no `gh`, no API keys, no merge. Parent owns all mutation.
- **Timeout ≠ failure:** a student that hits the 600s limit on its *summary return* may still have
  correct edits on disk. Verify with `git diff --stat` on its branch before trusting "it failed."
- **Two-judge is load-bearing:** CTO + COO review every stream before parent merge. Never collapse to
  single self-verify. Re-dispatch only a missing judge alone if one hangs.
- **No scope creep:** a student editing outside its allowlist → parent rejects the PR, respawns with note.
- **DOD gate is global:** `check-success-criteria.py` fails on ANY open gap; a single-stream PR is
  expected to "fail" the global gate — only its own criteria must be `covered`. Do NOT edit other
  streams' criteria to force green (collides with parallel branches).

## Stale items explicitly NOT in any stream (close as dup/false)

- `bd 4oq` migration fork → already fixed (`ffd7543`). Close.
- `bd qqk` player_secret double-hash → false (models.py guards correctly, backend tests pass). Close.
- `bd sh1` / `qf1` → orchestration/process, not product. Out of delegation scope.
- GitHub #135 (E3) / #136 (E4) → AGENTS.md + deploy already live. Close as done.
