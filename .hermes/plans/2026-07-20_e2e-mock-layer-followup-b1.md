# E2E Remaining-Fixme Remediation — issue #169 remainder (CORRECTED)

> **For Hermes:** The original B1 plan below was DISPROVEN. This corrected version
> records what actually worked. Read the "What actually worked" + "Remaining" sections.

## Original (WRONG) premise — DO NOT follow
The old plan claimed the 41 remaining fixme'd specs were a pure mock gap: the e2e
`MockWebSocket` never emits `game_state_update`, so board specs hang. **False.**
`src/context/GameContext.tsx` E2E mode (`isE2E`) explicitly bypasses the WS handler
(line ~262: `if (isE2E || !roomCode) return;`) and the room fetch (line ~225), using a
static `mockGameState`. WS injection was a red herring — it never reaches the E2E path.

A global "seed" attempt (GameContext consumes `roomResponse` for ALL E2E specs) ALSO
failed: it overwrote `mockGameState` for active specs that rely on it → 21 active
regressions. **Root lesson: per-spec, not global.**

## What actually worked — OPT-IN SEED (the real fix)
`tests/e2e/helpers.ts` `mockApiRoutes` gained `seed?: boolean`. When true, it stashes
`roomResponse` on `window.__E2E_ROOM_RESPONSE__` + sets `window.__E2E_USE_ROOM_SEED__`
via `addInitScript`. `GameContext.tsx` seeds its initial E2E state from it ONLY when the
flag is set. Active specs that rely on the static `mockGameState` are untouched → zero
regression. `buildGameStateFromRoom` (module-level in GameContext, line ~92) does the
mapping; it throws on hand-rolled raw fixtures (e.g. bingo's raw `tiles` objects) → seed
returns null → mockGameState fallback. Use `toRoomResponse(...)`-built fixtures or match
the rejoin player name to the fixture (a name mismatch caused an early bingo failure).

## Per-spec recipe (verified)
For a board-render spec: `mockApiRoutes(page, { roomResponse: toRoomResponse(state),
seed: true, rejoin: { player: <matching fixture player>, playerSecret } })`, then
un-fixme. Rejoin player must match the fixture player (id + name) so `hasCurrentPlayer`
is true and the board renders.

## Resolved this session (verified, 17 specs; full gate 102 passed / 0 failed)
- B2 app testid `player-elo-stats-{id}` in `GameInfo.tsx` → elo-rating ×2, titles ×1.
- `Room.tsx` `lobby` testid + producer-flow:166 (corrected "Start Battle"→"Start Match").
- spectator:80 (`.first()` on per-producer headings).
- score-display ×5, tie-breaking ×4, bingo ×2, disconnections-offline ×1 (all seed+rejoin).

## Genuine mismatches (NOT seed wins — left fixme'd, need real work)
- **producer-flow:194 / host-kick non-host**: non-host lobby shows "Waiting for opponent…"
  (1 connected player), test expects 2-player waiting text. Fixture/assertion mismatch.
- **disconnections dashboard**: spectator view lacks `request-to-play` testid (or wrong
  assertion). **host-migration**: needs `host_migrated` WS handling + `host-migration-
  indicator` testid (app WS handler ignores it in E2E).
- **webhook ×4 (B3)**: `webhooks.py:verify_linear_signature` fails closed without
  `LINEAR_WEBHOOK_SECRET` + HMAC header. Needs live backend + secret.
- **live/*** ×5: live backend + Redis.
- **integration-verification, leaderboard, verified-auth, pii-prevention, genre-heatmap,
  titles:admin, multiplayer, full-game, host-kick host**: real flows/feature gaps.

## Hard lessons (agent-school)
1. NEVER `git checkout -- <file>` to undo one test — it reverts ALL un-fixme's in the
   file. Use surgical per-test un-fixme/re-fixme edits.
2. Never remove fixme on a failing test.
3. Isolated beads + full-suite gate after EACH. Bulk sweeps regress (26 failures once).
4. The "41 = mock gap" map was stale; verify the actual blocker per spec, don't trust it.

## Remaining: 25 fixme'd tests. Next beads: host-migration (WS+testid), multiplayer/
full-game (seed+feature), then B3/live (infra).
