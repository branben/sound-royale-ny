# E2E Test-Rot Remediation (issue #169) — Implementation Plan

> **For Hermes:** Execute AFK via agent-school (Hermes-native student dispatch, `agent-school-hermes-dispatch`). Parent owns all `git`/gh; students edit+verify only.

**Goal:** Remediate the 50 disabled e2e tests (42 `test.fixme` + 8 `test.skip`) tagged "issue #169 e2e test rot" — delete the obsolete ones, fix-and-un-fixme the ones whose UI still exists (stale selectors/text only), and keep-fixme the ones with no current UI.

**Architecture:** The 2026-07-15 PR #168 (commit `7b09b15`) disabled 54 failing tests in ONE commit via a CI-run-based *blanket sweep* — no per-test root-cause. Investigation (this session) confirms the redesign (AI-slop strip, game-show, GSAP removal, lobby/room simplification, June–July 2026) predated the sweep and KEPT most features but changed DOM/testids/copy. So ~20 specs are FIXABLE (stale selectors), ~6 are DELETE (feature removed: `data-testid="request-to-play"` + "Battle Arena" heading gone entirely), ~few KEEP-FIXME (no UI / needs secret).

**Tech Stack:** Playwright (`@playwright/test` ^1.57), mock helpers in `tests/e2e/helpers.ts` (`setupPlayerSession`, `mockApiRoutes`, `mockWebSocketConnection`, `createMock*`). No backend needed for mock-based specs. Single shared Vite on `localhost:8081` (config `baseURL`, NO `webServer` block).

**Critical constraint:** Playwright `baseURL` = `http://localhost:8081`. There is NO auto-start. The conductor MUST run ONE `pnpm exec vite --port 8081 --host` in the parent session; all students hit that shared port. Do NOT let students start their own Vite (port collision). Mock-based specs need no Django; only `webhook.spec.ts` needs `LINEAR_WEBHOOK_SECRET` + backend → KEEP-FIXME, exclude from AFK batch.

---

## Disposition (from audit)

### DELETE (feature removed as slop) — 6 tests, 5 files
- `single-round.spec.ts:32` (host lobby inside room — `data-testid="lobby"` not in Room.tsx)
- `single-round.spec.ts:61` (non-host waiting — wrong testid)
- `single-round.spec.ts:203` (`request-to-play` + "Battle Arena" gone)
- `spectator.spec.ts:50` (`request-to-play` + "Battle Arena" gone)
- `spectator.spec.ts:144` (same)
- `producer-flow.spec.ts:169` (`request-to-play` + "Your Status" gone)
- `rejoin-recovery.spec.ts:68` (same)

### FIXABLE (UI exists, stale text/selector) — ~20 tests
| Spec | Lines | Fix |
|------|-------|-----|
| `single-round.spec.ts` | 91, 123 | :91 game-board/Round N/"Game in progress" valid; :123 drop "Time Remaining" label assert (removed), keep "Round: {n}"→"Round {n}" + "--:--" |
| `battle-flows.spec.ts` | 83 | testids exist; "Waiting for contestants"→"Waiting for opponent…" |
| `multiplayer.spec.ts` | 95, 141 | game-board exists; trivial |
| `spectator.spec.ts` | 81, 113 | :81 drop "Jump to:" text (removed), `player-name-{name}` exists; :113 board in accordion, h3=playerName |
| `producer-flow.spec.ts` | 198, 228 | :198 `start-battle` testid exists→"Start Match" (not "Start Battle"), drop `lobby` testid; :228 "Waiting for opponent…" |
| `lobby.spec.ts` | 20 | `lobby` testid + h1 "SOUND ROYALE" exist; update tagline text to current (Lobby.tsx:312) |
| `integration-verification.spec.ts` | 10 | enter player name first to unlock join mode before asserting `room-code-input` |
| `host-migration.spec.ts` | 21 | `host-migration-indicator` intact ("New host: {name}") — minimal |
| `score-display.spec.ts` | 98,107,116,125,134 | ScoreDisplay.tsx has `score-display`,`elo-rating`,`elo-delta`, multi_line+speed bonuses — align asserted text |
| `elo-rating.spec.ts` | 97,163 | ELO in standings + persist |
| `titles.spec.ts` | 66,106 | PlayerAdmin CheckedIn toggle + ranked title in match surfaces |
| `verified-auth.spec.ts` | 13 | request+verify producer identity flow |
| `pii-prevention.spec.ts` | 5 | assert no playerSecret in console (behavioral) |
| `live-websocket.spec.ts` | 14 | credentialed producers/spectators receive host-started messages |
| `leaderboard.spec.ts` | 13 | verified global leaderboard rows |
| `genre-heatmap-leaderboard.spec.ts` | 25,96 | leaderboard sorted by ELO + radar chart in profile modal |

### KEEP-FIXME (no UI / needs secret) — exclude from AFK batch
- `tie-breaking.spec.ts` (4) — backend logic in `bingo_utils.py`, no dedicated victory tie-break UI. DECISION: delete or build UI. Parent to decide.
- `webhook.spec.ts` (4) — needs `LINEAR_WEBHOOK_SECRET` + backend. KEEP-FIXME.

---

## Execution (AFK via agent school)

**Conductor (parent session):**
1. Start `pnpm exec vite --port 8081 --host` (background). Keep alive for all students.
2. Dispatch student agents (parallel, max 3) per cluster below. Each student: read its spec + current src, fix stale text/selectors, remove `test.fixme`, run `pnpm exec playwright test <spec> --reporter=line` against shared :8081 until GREEN, then `npx tsc --noEmit` + `eslint <spec>`, commit as isolated bead.
3. After all students: parent runs FULL suite (`pnpm exec playwright test tests/e2e --reporter=line`), `tsc`, `lint`, and `pnpm run verify:visual:e2e` + `verify:visual` to confirm no regression. Verify on disk.
4. Parent commits DELETE cluster (if not done by student) and any keep-fixme notes.

**Student clusters (parallel):**
- S1 (DELETE): the 6 delete targets across single-round/spectator/producer-flow/rejoin-recovery. Remove the `test.fixme` lines + the test bodies (or whole `describe` if all disabled). Commit `test: delete obsolete e2e specs (request-to-play/Battle Arena removed)`.
- S2 (game-loop): single-round:91/123, battle-flows:83, multiplayer:95/141, host-migration:21. Commit `test: fix + un-fixme game-loop specs`.
- S3 (spectator/producer/lobby): spectator:81/113, producer-flow:198/228, lobby:20, integration-verification:10. Commit `test: fix + un-fixme spectator/producer/lobby specs`.
- S4 (scoring/ranking): score-display, elo-rating, titles. Commit `test: fix + un-fixme scoring/elo/titles specs`.
- S5 (auth/leaderboard/misc): verified-auth, pii-prevention, live-websocket, leaderboard, genre-heatmap. Commit `test: fix + un-fixme auth/leaderboard/websocket specs`.

**Per-student verification gate (run by student, reported):**
```
pnpm exec playwright test tests/e2e/<spec>.spec.ts --reporter=line   # all targeted tests PASS
npx tsc --noEmit                                                     # exit 0
npx eslint tests/e2e/<spec>.spec.ts                                  # clean
```

**Parent final gate (run after all students):**
```
pnpm exec playwright test tests/e2e --reporter=line                  # targeted specs green, no new failures
npx tsc --noEmit && pnpm run lint && pnpm run test                   # unit/vitest clean
pnpm run verify:visual:e2e && npm run verify:visual                  # visual gates still 9/8 + 9/9
```

**Risks:** (1) Students share :8081 — only ONE Vite, started by parent. (2) `fullyParallel:false`, `workers:2` — if 2 students run Playwright simultaneously they may interleave on :8081; safer to run students SEQUENTIALLY or ensure their specs don't both drive the same room state. Mitigation: dispatch sequentially if parallel flakes. (3) Some "FIXABLE" specs may reveal deeper drift on real run — student reports, does not guess; parent decides delete-vs-keep.

**Open questions (parent decides, not student):**
- `tie-breaking.spec.ts`: delete (no UI) or keep-fixme pending UI build?
- `webhook.spec.ts`: keep-fixme (needs secret) — confirm `LINEAR_WEBHOOK_SECRET` is not local.

---

## Post-Mortem & Outcome (2026-07-20)

**Agent-school dispatch FAILED for this task.** Diagnosis (from on-disk + execution evidence):
1. **Summary-call timeout** — all 5 student tasks hit the 600s hard cap with `status=timeout` and NO returned summary, despite real work landing on disk (S1/S2/S3 left 245 deletions). The 50-spec tree + src archaeology exceeded a 600s leaf with no streaming progress, so the parent got zero signal.
2. **Students un-fixme'd BROKEN tests** — when S1/S2/S3 work was verifiable, they had removed `test.fixme` on 5 tests that STILL FAILED (host-migration, multiplayer sync/round-transition, single-round live-battle, spectator board). They treated "remove the tag" as done, not "make it pass." Net-negative.
3. **Blind parent** — students can't commit; parent must verify-on-disk, but timeouts made that invisible, costing re-run cycles.

**Root cause:** mis-scoped for the tool. 50 tests / 19 files / per-spec src archaeology is too large/long for a 600s leaf. Fix = smaller beads (1 file/student), explicit guard "do NOT remove fixme unless `playwright test <file>` is green", shorter timeout + streaming. Skill-patch candidate, not a re-dispatch.

**Parent took over (commit `0e4df88`, verified 24 passed / 6 skipped / 0 failed):**
- DELETED 7 obsolete specs (UI removed during redesign: `request-to-play` testid + "Battle Arena" heading gone): single-round:32/:61/:203, spectator:50/:144, producer-flow:169, rejoin-recovery:68.
- FIXED 4 trivial-stale-text specs: battle-flows:83 ("Waiting for contestants"→"Waiting for opponent…"), lobby:20 (tagline), spectator:81 (dropped "Jump to:" text).

**Remaining 41 disabled (kept `test.fixme`) — NOT trivially fixable, need a mock-layer/fixture follow-up:**
- `score-display` (5) — raw `mockScoreRoomResponse` doesn't render `game-board` (verified: run hangs on `waitForSelector`). Needs `createMockPlayingState` fixture or WS `game_state_update`.
- `elo-rating:97/:163`, `titles:106` — assert `player-elo-stats-{id}` testid that **does not exist in src** (only `elo-rating`/`elo-delta-display` exist). Need UI/testid build.
- `multiplayer:95/:141`, `host-migration:21`, `single-round:91/:123`, `spectator:113`, `bingo-line-detection:42/:57` — need `game_state_update` injection from `mockWebSocketConnection` to render playing board.
- `verified-auth`, `pii-prevention`, `live-websocket`, `leaderboard`, `genre-heatmap`, `integration-verification`, `tie-breaking` (4), `webhook` (needs secret) — per-spec verification pending; several hit same missing-testid/mock gaps.

**Disposition:** issue #169 closed as PARTIALLY-REMEDIATED. Remediable safe portion shipped (0e4df88, CI green). True completion requires a scoped mock-layer follow-up (build `game_state_update` injection + add missing testids) — tracked separately, not via AFK student dispatch.
