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
- **Preflight before edits**
  - Run `npm run test:e2e:preflight`, capture the dirty tree, and define the task's allowed file list before changing tests or fixtures.

## Success criteria (what “done” looks like)
- **Baseline smoke**: lobby renders, basic input gating works, and test mode is enabled.
- **Core flows**: happy-path user journeys covered end-to-end (create/join room, play a round).
- **Critical assertions**:
  - game state transitions (lobby → match → results)
  - scoring/ELO updates (where applicable)
  - WebSocket connectivity/reconnection only after Phase 5 scope and mocking infrastructure are explicitly promoted
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
  - Put visibility-sensitive `data-testid` attributes on stable visible wrappers, not raw SVG icons.
- **Gap: coupling tests to build artifacts**
  - Don’t test `dist/` outputs; test UI behavior.
- **Gap: uncontrolled external dependencies**
  - If tests require network/API, add mocks or stable local fixtures.
- **Gap: route mocks drift from app behavior**
  - Prefer `mockApiRoutes(...)`; broad ad hoc `page.route('**/api/**')` mocks often miss `/rejoin_game/`.
- **Gap: snake_case payloads drift from camelCase state**
  - For every new backend field consumed by UI, update the API type, transformer, `Room.tsx` reducer, rejoin mock, room fixture converter, and UI assertion together.
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
  - `tests/e2e/elo-rating.spec.ts`

## Phase 0 — Harness and hygiene (foundation) ✅ COMPLETE
**Goal:** ensure tests run reliably and don’t cause repo churn.

- **Step 0.1: Confirm Playwright config + baseURL** ✅
  - Ensure `playwright.config.ts` uses the correct `baseURL` and that `npm run dev` / `npm run preview` path is defined.
- **Step 0.2: Standardize E2E mode** ✅
  - `enableE2EMode(page)` in `tests/e2e/helpers.ts` sets `window.__E2E_TESTING__ = true` before app load.
- **Step 0.3: Add a "no forbidden diff" guard** ✅
  - `scripts/e2e-guard.sh` checks/cleans `dist/`, `.serena/`, `test-results/`, and `playwright-report/` after runs. These artifact paths are also ignored.

**Current hygiene checkpoint — 2026-04-21**
- Allowed file list for this pass: `AGENTS.md`, `docs/E2E_TASK_LIST.md`, `scripts/e2e-guard.sh`, `scripts/gaia-polecat.py`, and active specs under `tests/e2e/**` except `_future/**`.
- Active broad API route cleanup: simple room-response mocks should use `mockApiRoutes(...)`; custom broad routes must document their stateful/error-path reason inline.

**Success:** ✅ `npx playwright test tests/e2e/smoke.spec.ts` passes consistently and does not dirty the working tree.

## Phase 1 — Smoke (fast, always-on) ✅ COMPLETE
**Goal:** a fast test suite that catches broken builds/routing immediately.

- **Red:** ✅
  - `smoke.spec.ts`: lobby shell renders
  - `smoke.spec.ts`: join button disabled until room code is valid
- **Green:** ✅ minimal UI/validation fixes implemented.
- **Refactor:** ✅ `enableE2EMode` helper extracted in `tests/e2e/helpers.ts`.

**Success:** ✅ 3 consecutive passing runs confirmed.

## Phase 2 — Lobby journey (realistic user flow) ✅ COMPLETE
**Goal:** cover the full "join/create room" experience.

- **Red:** ✅
  - Enter room code → join button enables (4-digit gate)
  - Page renders correct heading and input placeholder
- **Green:** ✅ `tests/e2e/lobby.spec.ts` plus joined-room lobby coverage in `single-round.spec.ts`, `producer-flow.spec.ts`, and `negative-scenarios/host-kick.spec.ts`.
- **Refactor:** ✅ reusable route/session helpers now drive deterministic joined host and non-host lobby assertions.

**Success:** ✅ deterministic navigation into the room with stable assertions for host and non-host lobby states.

## Phase 3 — Battle flows (core gameplay) ✅ COMPLETE
**Goal:** cover one end-to-end round.

- **Red:** ✅
  - Start match
  - Perform one gameplay action
  - Reach results screen
- **Green:** ✅ current MVP round coverage is exercised through `single-round.spec.ts`, `producer-flow.spec.ts`, `spectator.spec.ts`, `negative-scenarios/invalid-votes.spec.ts`, and `negative-scenarios/host-kick.spec.ts` using API fixtures only.
- **Refactor:** ✅ explicit route mocks, rejoin-aware fixtures, and explicit host-state normalization now cover the active Phase 3 specs without skips or flaky waits.

**Success:** ✅ one full round flow is covered with explicit lobby → live → finished assertions for producer and spectator MVP paths, including live host controls.

## Phase 4 — Scoring/ELO ✅ COMPLETE
**Goal:** validate producer ELO rating, stats, and delta display end-to-end.

- **Phase 4A — Rating/stats display (MVP):** ✅ COMPLETE
  - ✅ Normalize backend `elo_rating`, `elo_wins`, `elo_losses`, and `elo_matches` into frontend player state.
  - ✅ Render producer ELO rating/stats on stable UI surfaces.
- **Phase 4B — Delta wiring (MVP):** ✅ COMPLETE
  - ✅ Added `EloDelta` type and `eloDeltas` field to `GameState` / `RoomResponse`.
  - ✅ Wired `elo_deltas` through `Room.tsx` `fetchRoom` mapping, `GameContext` WebSocket handler, and `WinnerAnnouncement` component.
  - ✅ Moved `EloDeltaDisplay` from `GameOverScreen` (abandoned-game semantic) to `WinnerAnnouncement` (natural game-end semantic).
  - ✅ Extended `toRoomResponse(...)` fixtures to compute and emit `elo_deltas` on finished states.
  - ✅ `tests/e2e/elo-rating.spec.ts`: 6/6 passing.
- **Audit note:**
  - Backend serializers expose per-player `elo_rating/wins/losses/matches`; frontend derives deltas for display.
  - Fixture `createMockFinishedState(...)` now auto-computes `eloDeltas` (+25 winner, −15 loser).
  - `toRoomResponse(...)` must be used for all API mocks — raw fixture objects cause `players.reduce is not a function`.

## Skipped Test Audit — Verified 2026-04-21
**Current full-suite skip count:** 5 intentional skips (all with inline `[needs ...]` reasons).

| File | Skips | Reason |
|---|---|---|
| `tests/e2e/full-game.spec.ts` | 5 | Multi-round UI components not yet implemented (`multi-round-config`, round progression, `total-score`, play-again button). Each skip cites the missing component inline. |

**Previously claimed counts (corrected):**
- ❌ Removed: `_future/full-game.spec.ts` (7 skips) — **file never existed**; `full-game.spec.ts` is in active directory.
- ❌ Removed: `_future/network-recovery.spec.ts` (5 skips) — **file was in `_future/` without `.skip()` calls**, not actually skipped; Playwright discovered and ran it. Now excluded via `testIgnore: ['**/_future/**']`.
- ❌ Removed: `_future/websocket.spec.ts` (5 skips) — **same issue**; duplicate copies existed in active dir, originals deleted.
- ❌ Removed: `elo-rating.spec.ts` (2 skips) — **tests were active and failing**, not skipped; now fixed and passing 6/6.

**Rule:** Every `.skip()` must include an inline `[needs X]` reason. No skip without a file/line reference and a path to resolution.

## Phase 5 — Resilience (reconnect + retry) ✅ PHASE 5B COMPLETE / PHASE 5C-D DEFERRED
**Goal:** validate the smallest deterministic resilience slice first, then defer broader network/WebSocket recovery until test infrastructure exists.

**Phase 5A — Scope + first-slice decision:** ✅ COMPLETE
- Existing behavior audit:
  - `Room.tsx` already attempts `/rejoin_game/` when `playerSecret` exists.
  - `mockApiRoutes(...)` already handles `/rejoin_game/` consistently for active specs.
  - `src/context/useGame.ts` still has a placeholder `useWebSocketConnection()`.
  - `src/services/gameSocket.ts` and backend `is_connected` support exist, but deterministic E2E mocking is not ready.
- First implementation target: **Phase 5B API rejoin recovery**, because it is closest to current app behavior and avoids flaky browser-network/WebSocket simulation.

**Phase 5B — API rejoin recovery:** ✅ COMPLETE
- `tests/e2e/rejoin-recovery.spec.ts` proves returning producers and spectators with stored credentials land back in the correct UI after reload-style navigation.
- The active tests observe `/rejoin_game/` requests through `mockApiRoutes(...)`; no real WebSockets are required.
- Coverage stays focused on session recovery and state hydration, not live network-loss behavior.

**Phase 5C — Visible reconnect/offline UI:** 
- Requires a product UX decision for reconnecting/offline states beyond current static player connection indicators.

**Phase 5D — WebSocket E2E mocking:** ✅ COMPLETE
- Implemented `MockWebSocket` class in `tests/e2e/helpers.ts` with full WebSocket API compatibility.
- Added `mockWebSocketConnection()` helper for deterministic socket lifecycle simulation.
- `tests/e2e/websocket-direct.spec.ts`: **5/5 passing** — verifies connection, messaging, disconnect/reconnect, instance tracking, message preservation.
- Deleted redundant POC files (`websocket-mock-poc.spec.ts`, `websocket-infrastructure.spec.ts`).
- Deleted duplicate `_future/` copies (`websocket.spec.ts`, `network-recovery.spec.ts`, `websocket-debug.spec.ts`).
- Added `testIgnore: ['**/_future/**']` to `playwright.config.ts` so deferred tests are properly excluded.

**Success:** WebSocket E2E mocking infrastructure is complete, verified, and deduplicated.

## Verification checklist (per PR)
- **Preflight:** `npm run test:e2e:preflight`
- **Typecheck:** `npx tsc --noEmit`
- **Build:** `npm run build`
- **E2E:** `npx playwright test tests/e2e --reporter=line`
- **Artifact guard:** `npm run test:e2e:guard`
- **Repeatability:** run E2E 3 times in a row if touching gameplay or websockets

`playwright.config.ts` currently uses `baseURL: http://localhost:8080` and does not auto-start a `webServer`. Start `npm run dev:frontend` before Playwright runs unless the config is intentionally changed.

## Notes for GAIA (x10 autonomy integration)
- Local GAIA/polecat work can run from feature branches; it does not require `main`.
- A direct Codex session is not automatically a GAIA run. GAIA skills are injected only when a task is launched through `scripts/gaia-polecat.py` or the external `~/gaia-polecat` workflow.
- Avoid invoking GAIA orchestration from a branch where `scripts/gaia-polecat.py` has unrelated dirty changes unless the task is specifically to validate the runner.
- Each Phase should map to a **queueable GAIA task** with:
  - explicit success criteria
  - explicit file allowlist
  - explicit verification commands
- The LM Studio compiler stage should output:
  - `phase`, `goal`, `files`, `skills_to_inject`, `stop_conditions`
  - and a strict “do not touch” path list (`dist/`, `.serena/`, `test-results/`, `playwright-report/`).

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
| 5 | `score`, `elo`, `elo_change`, `rating`, `points`, `leaderboard` | Phase 4 | `npx playwright test tests/e2e/elo-rating.spec.ts --reporter=line` |
| 6 | `reconnect`, `resilience`, `retry`, `disconnect`, `drop`, `websocket` | Phase 5 | `rg -n "Phase 5|WebSocket|deferred|_future" docs tests/e2e` |
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
- playwright-report/
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
  "do_not_touch": ["dist/", ".serena/", "test-results/", "playwright-report/", "scripts/gaia-polecat.py"],
  "skills_to_inject": ["systematic-debugging", "verification-before-completion", "e2e-test-hygiene", "react", "websocket"],
  "stop_conditions": ["Provide verification evidence"],
  "provider_recommendation": "opencode"
}
