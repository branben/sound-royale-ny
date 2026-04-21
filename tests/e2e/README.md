# E2E Test Suite — Quick Reference

Read this before touching any file in `tests/e2e/`.

---

## Preflight — run before editing E2E

```bash
npm run test:e2e:preflight
```

This prints the current dirty tree, the active Playwright `baseURL` / `webServer` config, and existing route fixture patterns. Use it to define the allowed file list for the task before editing.

Current config note: `playwright.config.ts` expects the frontend to already be running at `http://localhost:8080`. Start `npm run dev:frontend` manually before Playwright unless the config is changed to restore `webServer`.

---

## Session injection — the ONLY correct pattern

```ts
// ✅ Correct — values are passed as serializable arguments
await setupPlayerSession(page, { playerName, playerId, playerSecret });

// ❌ Wrong — closure variables don't serialize; causes silent test failures
await page.addInitScript(() => {
  localStorage.setItem('userSession', JSON.stringify({ playerName, playerId }));
});
```

`setupPlayerSession` is in `tests/e2e/helpers.ts`. It writes three individual keys:
`playerName`, `playerId`, `playerSecret` — matching what `UserContext.tsx` reads.

---

## Skip tiers — three distinct meanings

| Pattern | Meaning | What to do |
|---|---|---|
| `test.describe.skip(...)` inside `_future/` | Deferred — required infra not built | Un-skip only when infra is ready (e.g. WebSocket mocking) |
| `test.skip('...[needs data-testid="..."]')` | In-scope but app selector missing | File an implementation task; do NOT edit app to make test pass |
| `test.skip('...[deferred: ...]')` in an active spec | Deferred product/UI scope | Keep skipped until `docs/MVP_SCOPE.md` promotes the behavior |
| Deleted, no trace | CUT feature — will not be built | Do not recreate |

**Rule:** never change a skip tier without checking `docs/MVP_SCOPE.md` first.

Current skip audit: the full suite has 19 intentional skips — 17 in `_future/**` for multi-round/WebSocket/network recovery infrastructure, and 2 ELO delta assertions in `elo-rating.spec.ts` for Phase 4B.

---

## Fixture format — camelCase vs snake_case

The app's API layer returns **snake_case** JSON. The React context parses that format.

| Helper | JSON format | Use for |
|---|---|---|
| `createMockPlayingState()` | camelCase (`playerId`, `isSpectator`) | Weak assertions only (text visibility, player name) |
| `toRoomResponse(gameState)` | snake_case (`player_secret`, `is_spectator`) | Strong assertions (`data-testid`, tile counts, state transitions) |
| Inline `mockRoomResponse` object | snake_case (`player_secret`, `is_spectator`) | Only when a fixture helper cannot represent the payload |

If you write a strong assertion using `createMockPlayingState()` and it silently fails,
the fixture format is the likely cause — wrap it with `toRoomResponse(...)`.

When adding a backend snake_case field that the UI reads, update every active hydration path:
`RoomResponse` type, API transformer, `Room.tsx` room reducer, `toRejoinResponse(...)`, `toRoomResponse(...)`, and at least one UI assertion.

---

## API route mocks

Use `mockApiRoutes(...)` for active specs. It handles `/rooms/`, `/rejoin_game/`, `/join_game/`, `/start_game/`, `/kick_player/`, and `/vote/` consistently.

Avoid broad ad hoc `page.route('**/api/**')` blocks unless the test is specifically exercising custom route behavior. If you need one, document why in the test.

---

## Stable selectors

Put `data-testid` on visible, stable elements. Do not put visibility-sensitive test IDs directly on raw `lucide-react` SVG icons; wrap the icon in a sized `span` or assert a nearby accessible label instead.

---

## File map

| File / Directory | Purpose |
|---|---|
| `helpers.ts` | `enableE2EMode`, `setupPlayerSession` |
| `utils/game-fixtures.ts` | Fixture factories (`createMockProducer`, etc.) |
| `smoke.spec.ts` | Phase 1 — app loads, basic routing |
| `lobby.spec.ts` | Phase 2 — room code input gating |
| `battle-flows.spec.ts` | Phase 3 — state transitions (lobby→playing→results) |
| `elo-rating.spec.ts` | Phase 4 — ELO rating/stats display complete, ELO deltas deferred |
| `rejoin-recovery.spec.ts` | Phase 5B — API rejoin recovery without WebSocket dependency |
| `spectator.spec.ts` | Spectator view and voting (only spectators vote — producers cannot) |
| `negative-scenarios/` | Edge cases (disconnections, invalid votes) |
| `_future/` | Deferred tests — all skipped, do not un-skip without infrastructure |

---

## Verification commands

```bash
# Preflight before editing
npm run test:e2e:preflight

# Run full suite (target: 0 failures, skips OK)
npx playwright test tests/e2e/ --reporter=line

# Run a single file
npx playwright test tests/e2e/lobby.spec.ts --reporter=line

# Type check
npx tsc --noEmit

# Check artifact churn after E2E
npm run test:e2e:guard
```

---

## MVP scope quick-ref

Full source of truth: `docs/MVP_SCOPE.md`

- **Spectator-only voting** ✅ In scope — `VotingPanel.tsx` via `SpectatorView.tsx`
- **Producer voting** ❌ CUT — tests deleted from `producer-flow.spec.ts`
- **Producer ELO rating/stats display** ✅ Phase 4A complete — room/rejoin fixtures normalize ELO fields and UI renders stable rating/stat surfaces
- **ELO delta display** ⏸ Deferred — assertions have `TODO(Phase 4B)` comments
- **Multi-round UI** ⏸ Deferred — tests in `_future/full-game.spec.ts`
- **API rejoin recovery** ✅ Phase 5B complete — active producer/spectator reload coverage uses `mockApiRoutes(...)` and `/rejoin_game/`
- **WebSocket E2E mocking** ⏸ Deferred — tests in `_future/websocket.spec.ts`
- **Network recovery/reconnect E2E** ⏸ Deferred — tests in `_future/network-recovery.spec.ts`; scope Phase 5 before moving them
