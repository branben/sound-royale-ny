# Sound Royale — Production-Readiness Roadmap (end → goal)

> **For Hermes:** Use `software-development/plan` framing + `subagent-driven-development` to execute task-by-task.
> This is a PLAN. No code changes in this turn.

**Goal:** Make Sound Royale genuinely production-ready: a green, trustworthy CI pipeline, a completed security guardrail (#105), and real end-to-end coverage for every user flow so the definition-of-done is *proven by tests*, not asserted by spec labels.

**Architecture:** Four sequential phases. Each phase ends with a verifiable green gate before the next begins. We do NOT touch game logic or feature code — this is readiness hardening only. Order is dependency-driven: **pipeline first** (nothing else can be trusted until CI runs), **security second** (cheap, closes a real guardrail gap, independent of test debt), **test-debt third** (the largest phase — un-skip + repair the live per-user-flow specs and bind them to the DoD), **hygiene fourth** (clear the bot-PR noise so green actually means green).

**Tech Stack:** GitHub Actions (`.github/workflows/`), Playwright (`tests/e2e/`), Django DRF backend (`backend/game_engine/`), pnpm 10.23.0, success-criteria gate (`docs/specs/success-criteria.json` + `check-success-criteria.py`).

---

## Verification state established before planning (grounded, not assumed)

- CI is **red on every push to main** for two independent reasons (verified via `gh run view`):
  1. `.github/workflows/e2e.yml` is an orphaned duplicate that runs `npm install` + `cache:"npm"` on a **pnpm** repo (no `package-lock.json`) → dies at setup-node in ~29s.
  2. `gaia-guards-ci.yml` and `visual-verify.yml` pin `pnpm/action-setup@v4` `version: 10`/`9`, but `package.json` declares `"packageManager":"pnpm@10.23.0"` → `ERR_PNPM_BAD_PM_VERSION`, fails before install.
- Security guardrail #105 is **half-done**: secret out of URL (post-handshake `auth` in `gameSocket.ts`) ✅, secret hashed at rest (`security.py` SHA-256) ✅, but **rotation endpoint is absent** (no route in `urls.py`, no view, no consumer action).
- DoD spec (`docs/specs/success-criteria.json`) claims **19/19 `covered` / 0 gaps** — but the live specs that should prove the headline criteria are themselves `test.fixme(true)`:
  - `tests/e2e/live/casual-full-game.spec.ts:12` → `fixme` (covers `casual-full-game`, `casual-no-voting`, `casual-no-elo`)
  - `tests/e2e/live/ranked-full-game.spec.ts:12` → `fixme` (covers `ranked-full-game`, `ranked-voting-gate`, `ranked-elo`, `ranked-leaderboard`)
  - `tests/e2e/live/create-join-start.spec.ts` → has fixme'd tests too
  - 18 e2e files total carry `test.fixme(true)` (full list in Phase 3).
  → The `covered` labels are **false-positive closures** per the define-project-success pitfalls: CI is red, so the e2e-full job never runs, and the specs behind the criteria are skipped.
- Deploy target exists: `SOUND_ROYALE_URL=https://soundroyale.pages.dev` returns HTTP 200. Frontend is live; `railway.toml`/`wrangler.toml` present. This is NOT a blocker — but there is no CI deploy step gating it.
- No project-level bare-except / empty-catch anti-patterns in `src/` or `backend/` (hits were all in `venv/` deps).

---

## PHASE 1 — Make CI green (the gate everything else hangs on)

**Why first:** Until CI runs, every "it's covered" claim is unverifiable. The fixes are tiny and zero-risk. After this phase, `gaia-guards-ci.yml` jobs are green on `main` and the real e2e-full suite executes.

### Task 1.1 — Remove orphaned e2e.yml
- **Files:** Delete `.github/workflows/e2e.yml` (it duplicates `gaia-guards-ci.yml` and uses the wrong package manager).
- **Step:** Confirm `gaia-guards-ci.yml` already covers e2e-full + e2e-smoke (it does — `e2e-full`/`e2e-smoke` jobs present). Delete the orphan.
- **Verify:** `git rm .github/workflows/e2e.yml`; confirm no other workflow references it.

### Task 1.2 — Fix pnpm version conflict in gaia-guards-ci.yml
- **Files:** Modify `.github/workflows/gaia-guards-ci.yml` (4 `pnpm/action-setup@v4` blocks at lines 82, 106, 160, 237).
- **Step:** Remove the `with: version: 10` line from each so the action reads `packageManager` from `package.json` (pnpm@10.23.0). Leave `uses: pnpm/action-setup@v4`.
- **Verify:** `gh workflow view "Sound Royale CI"` parses; push and confirm the `E2E Smoke` job no longer throws `Multiple versions of pnpm specified`.

### Task 1.3 — Fix pnpm version conflict in visual-verify.yml
- **Files:** Modify `.github/workflows/visual-verify.yml` (lines 22, 67 — `version: 9`).
- **Step:** Remove `version: 9` from both `pnpm/action-setup@v4` blocks (let it inherit `packageManager` from package.json).
- **Verify:** Visual Verify workflow installs pnpm cleanly.

### Task 1.4 — Green confirmation
- **Step:** Push the three changes; wait for `gh run list --workflow "Sound Royale CI" --branch main` → all jobs `completed success`.
- **Verify:** `gh run list --workflow "Sound Royale CI" -L1` shows success. Capture the run ID. The e2e-full job must actually execute (not 29s abort).
- **Commit:** `ci: fix pnpm version conflict + remove orphan npm e2e workflow`

**Phase 1 exit gate:** `Sound Royale CI` green on main, e2e-full executes against real backend+frontend+Redis.

---

## PHASE 2 — Close security guardrail #105 (secret rotation)

**Why second:** Small, isolated, no dependency on test debt. Completes the only half-finished security guardrail. Pattern from `compound-engineering-workflow/references/websocket-secret-rotation.md`.

### Task 2.1 — Add rotate_secret backend endpoint
- **Files:** Modify `backend/game_engine/urls.py` (add `path('api/rooms/<uuid:room_id>/rotate_secret/', ...)`); Modify `backend/game_engine/views.py` (add `rotate_player_secret` view or `@action` on `RoomViewSet`).
- **Spec (from reference):** authenticate with current `player_id` + `player_secret` (reuse `resolve_player_from_request`); generate raw secret via `new_player_secret()`; store only `hash_secret(raw)` on the Player; return raw secret **once** in response body; document that old sessions lose access.
- **Code shape:**
  ```python
  @require_player_auth  # reuse existing resolver
  def rotate_player_secret(request, room_id):
      player = request.player
      raw = new_player_secret()
      player.player_secret = raw  # model hashes on assignment
      player.save()
      return JsonResponse({"player_secret": raw})
  ```
- **Test:** `backend/game_engine/tests/test_security.py` — assert (a) old secret rejected after rotate, (b) new secret accepted, (c) response contains the raw secret exactly once.

### Task 2.2 — Frontend rotation call (optional for launch, required for guardrail completeness)
- **Files:** `src/services/api.ts` (add `rotateSecret(roomCode, playerId, playerSecret)`); `src/context/GameContext.tsx` (expose action). Wire to reconnect flow so rotation = intentional reconnect.
- **Verify:** typecheck `pnpm exec tsc --noEmit` clean.

### Task 2.3 — Guardrail + commit
- **Step:** Run `pnpm run test:backend` → new security test passes. Update `AGENTS.md` guardrails `#105` to mark rotation DONE.
- **Commit:** `feat(security): add player_secret rotation endpoint (#105)`

**Phase 2 exit gate:** #105 fully closed (out-of-URL ✅, hashed-at-rest ✅, rotation endpoint ✅). Backend test green.

---

## PHASE 3 — Eliminate test debt & bind specs to the DoD (the big one)

**Why third / largest:** This is what makes "ready" mean something. The per-user-flow live specs are the only things that actually prove the 19 DoD criteria; today they are `fixme`'d. We un-skip + repair them, then enforce provenance so a `covered` label can never again be a false-positive closure.

### Task 3.1 — Establish the real disabled-test inventory
- **Step:** `grep -rln "test.fixme(true)" tests/e2e/` → 18 files. Categorize each:
  - **Core user-flow (must un-skip + repair):** `live/casual-full-game.spec.ts`, `live/ranked-full-game.spec.ts`, `live/create-join-start.spec.ts`, `live/spectator-live.spec.ts`, `multiplayer.spec.ts`, `producer-flow.spec.ts`, `host-migration.spec.ts`, `rejoin-recovery.spec.ts`, `reconnect-recovery.spec.ts`, `tie-breaking.spec.ts`, `score-display.spec.ts`, `leaderboard.spec.ts`, `negative-scenarios/*` (disconnections, host-kick, invalid-votes).
  - **Secondary (repair or delete if obsolete):** `genre-heatmap-leaderboard.spec.ts`, `pii-prevention.spec.ts`, `verified-auth.spec.ts`, `webhook.spec.ts`, `integration-verification.spec.ts`, `titles.spec.ts`, `live-websocket.spec.ts`.
- **Verify:** list matches the 18-file count; no `fixme` remains unaccounted.

### Task 3.2 — Repair the live create→join→start flow first (foundation)
- **Files:** `tests/e2e/live/create-join-start.spec.ts`, `tests/e2e/live/pom/GameOrchestrator.ts`, `tests/e2e/live/helpers.ts`.
- **Step:** Remove `test.fixme` from the primary create/join/start test. Run it against the real stack (Phase 1 made this possible): `LIVE_API_BASE_URL=http://localhost:8000/api npx playwright test tests/e2e/live/create-join-start.spec.ts --workers=1`. Fix whatever breaks (fixture shape, WS `auth` message contract, CORS). This validates the `setup-create-room` / `setup-join` / `play-start` DoD criteria with a REAL test.
- **Verify:** test passes against live backend. (Use `test:backend` + `dev:frontend` locally, or rely on the now-green e2e-full CI job.)

### Task 3.3 — Repair casual full-game live spec
- **Files:** `tests/e2e/live/casual-full-game.spec.ts:12` (remove `fixme`), `pom/GameOrchestrator.ts` (`playUntilBingo`, `allPlayersReady`).
- **Step:** Un-skip; run; ensure it reaches bingo with **no spectators** and asserts the **timer-up branch** runs (do NOT bypass the 60s timer — that was the PR #125 false-close trap). Asserts `casual-full-game`, `casual-no-voting`, `casual-no-elo`.
- **Verify:** passes; asserts time-up ends round, no voting panel, ELO unchanged.

### Task 3.4 — Repair ranked full-game live spec (voting + ELO + leaderboard)
- **Files:** `tests/e2e/live/ranked-full-game.spec.ts:12` (remove `fixme`), `pom/GameOrchestrator.ts` (`playRankedUntilBingo`).
- **Step:** Un-skip; run with **≥3 spectators** so the voting gate (`MIN_SPECTATORS_FOR_RANKED`) is actually evaluated. Assert voting resolves, ELO updates + persists, leaderboard renders. Covers `ranked-full-game`, `ranked-voting-gate`, `ranked-elo`, `ranked-leaderboard`.
- **Verify:** passes with real spectator fixtures.

### Task 3.5 — Repair recovery / negative specs
- **Files:** `rejoin-recovery.spec.ts`, `reconnect-recovery.ts`, `host-migration.spec.ts`, `negative-scenarios/*`.
- **Step:** Un-skip each; run; repair (`#101` reconnect must re-fetch full state; `#103` host-migration needs `host_migrated` WS flow). Covers `rejoin-recovery`, `host-migration`, `tie-breaking`, `scoring-display`.
- **Verify:** each passes against live stack.

### Task 3.6 — Secondary specs: repair or delete-with-evidence
- **Files:** `genre-heatmap-leaderboard.spec.ts`, `pii-prevention.spec.ts`, `verified-auth.spec.ts`, `webhook.spec.ts`, `integration-verification.spec.ts`, `titles.spec.ts`, `live-websocket.spec.ts`.
- **Step:** For each, either repair to a passing real test or, if obsolete (references deleted UI), delete the file and note it. Do NOT leave `fixme`.
- **Verify:** `grep -rn "test.fixme(true)" tests/e2e/` returns **zero** matches.

### Task 3.7 — Add `verify-testref.py` provenance gate to CI (stops future false closures)
- **Files:** Create `verify-testref.py` (repo root, next to `check-success-criteria.py`) — per `define-project-success/references/testref-provenance.md`; wire into `gaia-guards-ci.yml` `definition-of-done` job as a second step after `check-success-criteria.py`.
- **Step:** Re-point every DoD criterion's `testRefs` to the NOW-REAL specs from 3.2–3.5 (e.g. `tests/e2e/live/ranked-full-game.spec.ts > should play full ranked game with voting to bingo`). Run `python3 verify-testref.py` → exit 0.
- **Verify:** gate fails on any dangling ref; currently all resolve.

### Task 3.8 — Re-run the full DoD gate against truth
- **Step:** `python3 check-success-criteria.py` (must pass — 19/19, gaps 0) AND `python3 verify-testref.py` (must pass). Then confirm `Sound Royale CI` e2e-full is green on main with the previously-fixme'd specs now executing.
- **Commit:** `test(e2e): un-skip + repair all live user-flow specs; bind DoD to real tests (#169)`

**Phase 3 exit gate:** zero `test.fixme` in `tests/e2e/`; e2e-full green on main; DoD gate + testref gate both pass; every DoD criterion's `testRefs` points at a test that actually executes the behavior.

---

## PHASE 4 — Pipeline hygiene (so green means green)

**Why last:** Not a launch blocker, but ~37 bot PRs + 21 TestDriver PRs flood CI and the PR queue, making "is main green?" unreadable. Parent session owns `gh` (subagents have no creds).

### Task 4.1 — Triage the bot-PR backlog
- **Step:** `gh pr list --state open --label "ready-for-agent"` → close the ~37 bot PRs (`#231/#203/#202`) as `superseded`/`duplicate` where their unique tests were merged into the live specs (Phase 3), or re-link the owning PR.
- **Verify:** open PR count drops; no orphaned TestDriver PRs claiming tests already in `tests/e2e/live/`.

### Task 4.2 — Add a deploy gate (optional but recommended)
- **Files:** Add a `deploy` job to `gaia-guards-ci.yml` (or a dedicated workflow) that runs only after `e2e-full` passes, deploying frontend to Pages / backend to Railway.
- **Step:** Gate production deploy on green e2e-full so a red pipeline blocks ship.
- **Verify:** deploy job runs on main only after all checks green.

### Task 4.3 — Final commit
- **Commit:** `chore: close bot-PR backlog; gate deploy on green CI`

**Phase 4 exit gate:** PR queue readable; deploy gated on green pipeline.

---

## Dependency / ordering rationale (the "correct order")

1. **Pipeline (P1) before everything** — without a running CI, no other phase's "done" is observable. The fixes are 4 lines.
2. **Security (P2) independent of tests** — cheap, closes a real gap, no risk of interfering with test repair. Do it while test-debt context is being built.
3. **Test-debt (P3) is the real work** — it both repairs coverage AND converts the DoD from aspirational to enforced (testref gate). Must come after P1 so we can actually run the specs.
4. **Hygiene (P4) last** — purely signal/noise; doing it earlier would just re-flood a pipeline we're still stabilizing.

## Risks / open questions
- Live e2e specs may need backend fixture/WS-contract fixes beyond un-skipping (the `GameOrchestrator` POM + `auth` message). Budget for repair, not just `fixme` removal.
- Some secondary specs (`webhook.spec.ts`, `integration-verification.spec.ts`) may be obsolete — delete-with-evidence is acceptable and preferred over silent `fixme`.
- `verify-testref.py` catches dangling refs but NOT semantic false-closures (test exists but bypasses the trigger branch). The manual trace rule still applies before flipping `status` to `covered`.
- The `pre-push` gaia-gate (`scripts/gaia-gate.sh`) runs the FULL suite (~90s) on every push — use `terminal(..., timeout=600)` for `git push`.

## What is explicitly NOT in scope
- No game-logic or feature changes. MVP lock is frozen.
- No new user flows. Only validate what exists.
- Design-system/visual work is covered by the existing `visual-verify.yml` + `visual-regression.spec.ts` snapshots; not a readiness blocker per the gap analysis.
