# Sound Royale — Definition of Success

Generated 2026-07-08. Source of truth: `success-criteria.json` (this doc is rendered from it).

A criterion is **covered** only when a named, runnable test asserts the success behavior. A criterion with no test is a **gap** — listed honestly, not silently passed.

## Cross-mode (shared)
| ID | Criterion | Covering test(s) | Status |
|----|-----------|------------------|--------|
| setup-create-room | Host creates a room; code + player info returned | `api.test.ts > roomApi > createRoom > sends correct payload and returns room code + player info` | covered |
| setup-join | Second player joins; lobby syncs | `create-join-start.spec.ts > both players see correct lobby state after join` | covered |
| play-start | Host starts; both see board | `create-join-start.spec.ts > host starts game and both players see game board` | covered |
| play-tile-submit | Producers submit tiles | `casual-full-game.spec.ts > should handle tile submission for random genres`; `api.test.ts > gameApi > submitTile` | covered |
| play-round-advance | Rounds advance to bingo | `casual-full-game.spec.ts > should play full casual game to bingo`; `ranked-full-game.spec.ts > should play full ranked game with voting to bingo` | covered |
| rejoin-recovery | Reload restores board/state | `rejoin-recovery.spec.ts` (×2); `create-join-start.spec.ts > host status is restored after page refresh` | covered |
| host-migration | Host disconnect → migration indicator | `host-migration.spec.ts > host migration indicator appears when host disconnects` | covered |
| tie-breaking | Winner by lines; efficiency + simultaneous tie-breakers | `tie-breaking.spec.ts` (×4) | covered |
| scoring-display | Score: base/multi-line/speed/combined + viz | `score-display.spec.ts` (×5) | covered |
| pii-safety | Player secret never in console | `pii-prevention.spec.ts > should not expose playerSecret in console logs` | covered |
| share-invite | Share button visible + works | `share-invite.spec.ts` (×2) | covered |
| lobby-shell | Lobby/room/leaderboard/admin/404 render | `integration-verification.spec.ts` (×5) | covered |

## Casual mode
| ID | Criterion | Covering test(s) | Status |
|----|-----------|------------------|--------|
| casual-full-game | Full casual game to bingo, no voting | `casual-full-game.spec.ts` (×2) | covered |
| casual-no-voting | Time-up ends round, no spectator voting | — | **GAP** |
| casual-no-elo | Casual results excluded from ELO/leaderboard | — | **GAP** |

## Ranked mode
| ID | Criterion | Covering test(s) | Status |
|----|-----------|------------------|--------|
| ranked-full-game | Full ranked game with spectator voting to bingo | `ranked-full-game.spec.ts` (×2) | covered |
| ranked-voting-gate | Voting requires ≥3 spectators | — | **GAP** |
| ranked-elo | ELO win/loss, persists, skips spectators | `elo-rating.spec.ts` (×6) | covered |
| ranked-leaderboard | Ranked players + profile modal + radar chart | `leaderboard-profile.spec.ts` (×2); `genre-heatmap-leaderboard.spec.ts` (×2); `titles.spec.ts` | covered |

## Gaps (next work — not silent passes)
1. **casual-no-voting** — `GameInfo.tsx:95` says casual rounds end on time-up with no voting, but no e2e asserts it.
2. **casual-no-elo** — no test asserts casual results stay out of ELO/leaderboard.
3. **ranked-voting-gate** — `VotingPanel.tsx:105` enforces ≥3 spectators; no e2e asserts the gate blocks voting below threshold.

## Gate contract
A CI gate should load `success-criteria.json` and fail the merge if any `status !== 'covered'` or `gaps.length !== 0`. Today 3 gaps exist → the "definition of done" is NOT fully met; closing them is the path to green.
