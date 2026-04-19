# Sound Royale E2E Task List (Phased)
This document defines a phased, red-green-refactor approach to building reliable E2E coverage without test flake or accidental scope creep.

## Principles (non-negotiable)
- **Red-Green-Refactor**
  - **Red**: write the test for a real user-visible behavior and confirm it fails for the right reason.
  - **Green**: implement the smallest change to make it pass.
  - **Refactor**: reduce duplication and tighten assertions *without expanding scope*.
- **One user journey per file**
  - Keep tests small and composable; avoid mega-specs.
- **Determinism over realism**
  - Prefer stable fixtures, seeded data, and explicit waits for UI states (never `waitForTimeout`).
- **No hidden mutations**
  - Don’t let E2E runs pollute the repo with `dist/`, `.serena/`, `test-results/` changes.

## Success criteria (what “done” looks like)
- **Baseline smoke**: lobby renders, basic input gating works, and test mode is enabled.
- **Core flows**: happy-path user journeys covered end-to-end (create/join room, play a round).
- **Critical assertions**:
  - game state transitions (lobby → match → results)
  - scoring/ELO updates (where applicable)
  - WebSocket connectivity and reconnection behavior (at least one test)
- **Reliability**:
  - zero `waitForTimeout()`
  - tests pass **3 consecutive runs** locally
  - runs with **1 worker** and **2 workers** without flake (where feasible)
- **CI-ready**:
  - deterministic test data setup
  - consistent selectors and accessibility roles

## Critical gaps to avoid
- **Gap: “assertions too vague”**
  - Bad: “page has some content.”
  - Good: assert exact headings, key instructions, and disabled/enabled transitions.
- **Gap: unstable selectors**
  - Avoid `.css-xyz` and brittle DOM structure selectors.
  - Prefer `getByRole`, `getByLabel`, `getByPlaceholder`, `getByText`.
- **Gap: coupling tests to build artifacts**
  - Don’t test `dist/` outputs; test UI behavior.
- **Gap: uncontrolled external dependencies**
  - If tests require network/API, add mocks or stable local fixtures.
- **Gap: leaking PII/secrets in logs**
  - Don’t dump full env/config; keep logs minimal.

## Naming conventions (implications + stability)
- **Describe blocks** should reflect product areas:
  - `Smoke`, `Lobby`, `Battle Flows`, `Scoring/ELO`, `Reconnect/Resilience`
- **Test names** should encode the behavior and expected outcome:
  - `enables Join Room after a four digit room code`
- **File names** should map to journeys:
  - `tests/e2e/smoke.spec.ts`
  - `tests/e2e/lobby.spec.ts`
  - `tests/e2e/battle-flows.spec.ts`
  - `tests/e2e/scoring-elo.spec.ts`

## Phase 0 — Harness and hygiene (foundation)
**Goal:** ensure tests run reliably and don’t cause repo churn.

- **Step 0.1: Confirm Playwright config + baseURL**
  - Ensure `playwright.config.ts` uses the correct `baseURL` and that `npm run dev` / `npm run preview` path is defined.
- **Step 0.2: Standardize E2E mode**
  - Use one helper (e.g. `enableE2EMode(page)`) that sets `window.__E2E_TESTING__ = true` before app load.
- **Step 0.3: Add a “no forbidden diff” guard (recommended)**
  - If `dist/` or `.serena/` changes appear after a run, revert them automatically or fail the run.

**Success:** `npx playwright test tests/e2e/smoke.spec.ts` passes consistently and does not dirty the working tree.

## Phase 1 — Smoke (fast, always-on)
**Goal:** a fast test suite that catches broken builds/routing immediately.

- **Red:**
  - `smoke.spec.ts`: lobby shell renders
  - `smoke.spec.ts`: join button disabled until room code is valid
- **Green:** implement the minimal UI/validation fixes.
- **Refactor:** extract `enableE2EMode` helper and reuse.

**Success:** 2–5 tests complete in <10s and pass 3 consecutive runs.

## Phase 2 — Lobby journey (realistic user flow)
**Goal:** cover the full “join/create room” experience.

- **Red:**
  - Enter room code → join
  - Invalid code shows error state (if applicable)
- **Green:** implement only what’s necessary.
- **Refactor:** add reusable helpers for “enter room code”, “click join”, “assert lobby state”.

**Success:** deterministic navigation into the room with stable assertions.

## Phase 3 — Battle flows (core gameplay)
**Goal:** cover one end-to-end round.

- **Red:**
  - Start match
  - Perform one gameplay action
  - Reach results screen
- **Green:**
  - Add test hooks/fixtures only if they don’t leak into production behavior.
- **Refactor:**
  - isolate websocket waits; assert specific state transitions.

**Success:** one full round flow is covered with explicit state assertions.

## Phase 4 — Scoring/ELO (the fragile / high-value area)
**Goal:** validate the correctness of scoring updates, including ELO.

- **Red:**
  - Assert pre-match ELO
  - Complete match
  - Assert post-match ELO and/or `elo_change`
- **Green:**
  - Ensure backend and UI expose the necessary fields.
- **Refactor:**
  - replace brittle UI parsing with explicit labels/roles.

**Success:** ELO changes are asserted end-to-end (UI + websocket/API), not just unit-level.

## Phase 5 — Resilience (reconnect + retry)
**Goal:** ensure the game survives transient failures.

- **Red:** simulate websocket drop and confirm UI recovers.
- **Green:** implement minimal reconnection UI/logic.
- **Refactor:** ensure logs are quiet and assertions are stable.

**Success:** one reconnection scenario is covered without flake.

## Verification checklist (per PR)
- **Typecheck:** `npx tsc --noEmit`
- **Build:** `npm run build`
- **E2E:** `npx playwright test tests/e2e --reporter=line`
- **Repeatability:** run E2E 3 times in a row if touching gameplay or websockets

## Notes for GAIA (x10 autonomy integration)
- Each Phase should map to a **queueable GAIA task** with:
  - explicit success criteria
  - explicit file allowlist
  - explicit verification commands
- The LM Studio compiler stage should output:
  - `phase`, `goal`, `files`, `skills_to_inject`, `stop_conditions`
  - and a strict “do not touch” path list (`dist/`, `.serena/`, `test-results/`).

---

## Keyword → Phase mapping

Used by `scripts/qodo-feedback-loop.sh` to classify Qodo feedback into the correct phase.
Update this table when new phases or keywords are added.

| Priority | Keywords (case-insensitive) | Phase | Verify command |
|---|---|---|---|
| 1 | `e2e`, `playwright`, `selector`, `flake`, `harness`, `fixture`, `test-results`, `baseurl`, `config` | Phase 0 | `npx playwright test tests/e2e/smoke.spec.ts --reporter=line` |
| 2 | `smoke`, `lobby shell`, `join room`, `room code`, `enableE2EMode` | Phase 1 | `npx playwright test tests/e2e/smoke.spec.ts --reporter=line` |
| 3 | `lobby`, `join`, `create room`, `room list`, `room entry` | Phase 2 | `npx playwright test tests/e2e/lobby.spec.ts --reporter=line` |
| 4 | `battle`, `gameplay`, `match`, `round`, `websocket`, `ws`, `game start` | Phase 3 | `npx playwright test tests/e2e/battle-flows.spec.ts --reporter=line` |
| 5 | `score`, `elo`, `elo_change`, `rating`, `points`, `leaderboard` | Phase 4 | `npx playwright test tests/e2e/scoring-elo.spec.ts --reporter=line` |
| 6 | `reconnect`, `resilience`, `retry`, `disconnect`, `drop` | Phase 5 | `npx playwright test tests/e2e --reporter=line` |
| default | _(no match)_ | Phase 2 | `npx playwright test tests/e2e --reporter=line` |

**Rules:**
- Higher priority wins — if a comment mentions both `smoke` and `elo`, assign Phase 1.
- Unknown keywords → default Phase 2.

---

## GAIA task template

Canonical shape every task enqueued by `qodo-feedback-loop.sh` must follow.
The LM Studio compiler tier should validate and output this shape.

```
Phase: <Phase 0 | Phase 1 | Phase 2 | Phase 3 | Phase 4 | Phase 5>
Goal: <one sentence>
Success: <exact observable outcome — not "it works">
Verification: <exact shell command>
Files:
- <relative/path/to/file.ts>
Do not touch:
- dist/
- .serena/
- test-results/
- scripts/gaia-polecat.py
Notes: <optional — Qodo excerpt, PR link, Linear ID>
```

**LM Studio compiler contract keys:**
```json
{
  "phase": "Phase 1",
  "goal": "...",
  "success": "2 tests pass 3 consecutive runs with no waitForTimeout",
  "verification": "npx playwright test tests/e2e/smoke.spec.ts --reporter=line",
  "files": ["tests/e2e/smoke.spec.ts"],
  "do_not_touch": ["dist/", ".serena/", "test-results/", "scripts/gaia-polecat.py"],
  "skills_to_inject": ["systematic-debugging", "verification-before-completion"],
  "stop_conditions": ["Provide verification evidence"],
  "provider_recommendation": "opencode"
}
