# Sound Royale MVP Scope

**Source of truth for what is in scope, what is cut, and what is deferred.**
Referenced by `docs/E2E_TASK_LIST.md` and `docs/FIXTURE_FRONTEND_ALIGNMENT_AUDIT.md`.

---

## Core Loop (LOCKED)

```
1. Two producers join a lobby (via share link)
2. Game auto-starts when 2 producers are ready (or host clicks Start)
3. Genre is randomly selected from pool of 9
4. Production timer: 15min prod / 30s test-mode
5. Producers upload beat to the active tile
6. Spectators listen to both beats and vote
7. Winning producer gets the tile marked 'complete'
8. Repeat from step 3 until a producer hits BINGO
9. Show winner + producer ELO rating surfaces
10. Host can "Play Again" to reset
```

**Producer role:** Competes by uploading beats. Does NOT vote.
**Spectator role:** Judges by voting. Cannot produce.
**Host:** Can start match, kick, reset.

---

## IN SCOPE (MVP)

| Feature | Status | Location |
|---------|--------|----------|
| Share-link lobby entry | Exists | `src/pages/Room.tsx` |
| 2-producer + N-spectator room | Exists | `src/pages/Room.tsx` |
| 3x3 BingoBoard with genre tiles | Exists | `src/components/game/BingoBoard.tsx` |
| Beat upload per tile | Exists | `src/components/game/UploadDrawer.tsx` |
| Spectator-only voting | Exists | `src/components/game/VotingPanel.tsx` via `SpectatorView.tsx` |
| BINGO detection | Exists | `src/components/game/BingoNotification.tsx` |
| ELO rating/stats display (producers) | Exists | `PlayerView.tsx`, `GameInfo.tsx` |
| API rejoin/session recovery | Exists; E2E covered | `src/pages/Room.tsx`, `src/services/api.ts` |
| Production timer | `TurnTimer.tsx` exists, needs wiring | `src/components/game/TurnTimer.tsx` |
| Play Again (host) | Exists | `src/components/game/GameInfo.tsx` |
| Game over screen | Says "Done"; aligning tests to match | `src/components/game/GameInfo.tsx` |

---

## OUT OF SCOPE — CUT

These contradict the core loop. Tests asserting these are deleted.

- Producer voting (only spectators vote)
- Kick confirmation UI for kicked player (nice-to-have, not core)
- Host controls beyond Start/Reset

---

## OUT OF SCOPE — DEFER

Ship post-MVP. Tests moved to `tests/e2e/_future/` with `test.skip()`.

- Jackpot genre animation (5s spin)
- Spectator coins / Jackbox-style effects
- Player profile modals
- Admin genre rotation panel
- Homepage lobby discovery
- Discord integration
- Weekly/themed genre tiers
- Losing-streak bonuses
- ELO delta display on game-over screen (icons exist, placement later)
- Real-time WebSocket mocking in E2E (infrastructure work)
- Network recovery/reconnect E2E flows that depend on WebSocket mocking

---

## Defaults for Open Questions

| Question | Default |
|----------|---------|
| Auto-start or host-start? | Host-start (matches current code) |
| Timer duration in test mode | 30 seconds |
| Producer doesn't upload in time | Tile stays empty, genre re-rolls |
| Spectator votes "neither"? | No for MVP |
| Vote tie-breaking | Random winner |
| Genre pool | 9 hardcoded (TBD) |

---

## Success Criteria

- `npx playwright test tests/e2e --reporter=line` passes 3 consecutive runs
- Every remaining test covers an IN SCOPE behavior
- Every `_future/` test is explicitly `.skip()`'d and references this doc
- GAIA can classify any feedback as IN SCOPE / CUT / DEFER using this doc
