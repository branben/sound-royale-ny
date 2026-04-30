# Sound Royale - Agent Quick Ref

**Generated:** 2026-02-16 | **Branch:** main

---

## Key Anti-Patterns (MUST REMEMBER)

| Rule | Why |
|------|-----|
| Never expose playerSecret in logs/API | Security |
| Never mutate gameState directly | Use `setGameState()` with functional updates |
| Never run blocking ops in WebSocket consumers | Performance |
| Never use `as any`, `@ts-ignore` | Type safety |
| Never skip E2E for gameplay features | Trust but verify |
| **Never** `localStorage.setItem('userSession', JSON.stringify({...}))` in E2E tests | Silent failure — use `setupPlayerSession(page, {playerName, playerId, playerSecret})` from `tests/e2e/helpers.ts` |
| **Never** un-skip or edit `tests/e2e/_future/` tests to make them pass | They're deferred; un-skip only when the required infrastructure (e.g. WebSocket mocking) is built |
| **Never** "fix" a `test.skip('...[needs data-testid=...]')` by editing app components | These are implementation tasks — file them separately, don't mix test hygiene with feature work |
| **Never** silence a failing E2E test with `test.skip(...[needs X rendering investigation])` without first reading `test-results/<test>/error-context.md` | Skipping != fixing. The skill `.gaia_skills/e2e-test-hygiene/SKILL.md` Fast Debugging Protocol is mandatory before any skip. |
| **Never** fulfill `page.route('**/api/rooms/**')` with raw `gameState` fixture | `Room.tsx` calls `roomApi.getRoom()` which expects `RoomResponse` (snake_case, array `players`, `tiles` at root). Always wrap with `toRoomResponse(gameState)` from `tests/e2e/utils/game-fixtures.ts`. |
| **Never** add broad ad hoc `page.route('**/api/**')` mocks in active E2E specs | Use `mockApiRoutes(...)` so `/rooms/`, `/rejoin_game/`, `/join_game/`, and action endpoints stay consistent. If a stateful/error-path test truly needs a custom broad route, document why inline. |
| **Never** model a host-only E2E flow with `createMockProducer(...)` | It defaults `isHost=false`. Use `createMockHostProducer(...)` or pass `isHost: true` so `toRoomResponse(...)` emits `is_host` and host-gated UI renders. |
| **Never** put `data-testid` directly on a raw `lucide-react` SVG when visibility matters | Put it on a stable visible wrapper; SVGs can be rendered but intermittently considered hidden by Playwright. |
| **Never** relax a production conditional ("default to true for tests", remove `!winner` guard) to make a test pass | This is a test-driven regression. Fix the test fixture, not the product semantics. |
| **Never** strip imports before deleting the code body that uses them | Creates a compile-error cascade that hides the real issue. Delete body first, then clean imports. |
| **Never** open a passing test file to "verify coverage" after a green suite | Zero actionable signal, wastes context tokens. Open only on failure, new assertions, or explicit PR request. |
| **Never** re-read the same file in >2 chunks for planning edits | Read the entire file once instead. Chunked reading burns context-window budget and causes backtracking. |
| **Never** claim production user-flow coverage from API-driven live tests | `tests/e2e/live/golden-user-flow.spec.ts` is the browser-live gate; API helpers prove backend smoke only |
| **Never** treat `player_secret` as account authentication | It is room-action/rejoin authorization only; verified users own leaderboard identity |
| **Never** allow an unverified player to join as a protected verified display name | Prevent impersonation before ranked/leaderboard credit is assigned |

---

## TESTING REQUIREMENTS (CRITICAL - DO NOT SKIP)

### Django Backend Tests
- **Status:** 0 Django tests currently exist (empty `backend/game_engine/tests.py`)
- **Why this is a problem:** CI runs `python backend/manage.py test` which returns exit 0 with 0 tests
- **pytest tests exist:** 4 tests in `backend/gaia/tests/test_scanner_adapter_edgecases.py`
- **The fix:** Use `pytest` instead of Django test runner, OR add real Django tests

### Before ANY PR Merge - Verify Test Count
```bash
# Check Django test count (must be > 0 for main apps)
python backend/manage.py test --verbosity=2 2>&1 | grep -E "Ran [0-9]+ test"

# If 0 tests found, CI SHOULD FAIL - add this check to gaia-guards-ci.yml
```

### E2E Tests
- Location: `tests/e2e/`
- Preflight: `npm run test:e2e:preflight`
- Run: `npm run test:e2e`
- Required for any gameplay feature changes
- See `tests/e2e/README.md` for test conventions and fixture format rules
- `playwright.config.ts` currently expects the frontend to already be running on `localhost:8080`; start `npm run dev:frontend` manually before E2E runs unless the config is changed.
- Browser-live production gate: `npx playwright test tests/e2e/live/golden-user-flow.spec.ts --project=live --reporter=line`
- API-live smoke suite: `npx playwright test tests/e2e/live/ --project=live --reporter=line`
- If a "live" test uses direct API helpers for create/join/play/vote, it is backend/API smoke coverage, not proof that the production browser flow works.
- For local browser-live debugging, prefer explicit live URLs and a writable browser cache, e.g. `PLAYWRIGHT_BROWSERS_PATH=/private/tmp/ms-playwright LIVE_BROWSER=firefox LIVE_FRONTEND_URL=http://127.0.0.1:8081 LIVE_API_BASE_URL=http://127.0.0.1:8001/api npx playwright test tests/e2e/live/golden-user-flow.spec.ts --project=live --reporter=line`.
- If `8000` or `8080` are occupied by stale local servers, use clean alternate ports and run backend migrations before testing. Do not commit local SQLite changes from that setup.
- Browser-live flow fixes require desktop screenshot review at realistic desktop widths; passing API-live smoke tests alone is not enough.
- Verified leaderboard work must keep `/room/:id/leaderboard` separate from `/leaderboard`: room progress can include room players, global rankings must use verified accounts only.

---

## Key Files

| Purpose | Path |
|---------|------|
| WebSocket | `src/services/gameSocket.ts` |
| Audio playback | `src/components/game/BingoTile.tsx` |
| State management | `src/context/GameContext.tsx` |
| Game models | `backend/game_engine/models.py` |
| E2E tests | `tests/e2e/` |

---

## Architecture

- **Frontend:** React + TypeScript + Vite
- **Backend:** Django + Django REST Framework + WebSockets
- **Real-time:** WebSocket consumers for live game updates

---

## Commands

```bash
# Frontend
npm run dev              # Dev server
npm run test:e2e         # Playwright E2E
npx tsc --noEmit         # Type check

# Backend
python backend/manage.py runserver
python backend/manage.py test
```

---

## Where to Look

| Task | Location |
|------|----------|
| UI components | `src/components/` |
| Game logic | `backend/game_engine/` |
| API config | `backend/sound_royale_api/` |
| Design system | `design-system/sound-royale/` |

---

## Tools

| Tool | When to Use |
|------|-------------|
| `sequentialthinking` | Complex multi-step problems, architectural decisions, debugging deadends (built-in, use ad-hoc) |
| Seria MCP | Symbolic code navigation (`serena.find_symbol`, `serena_replace_symbol_body`) |

---

## Session Start

1. Read `current-session` memory
2. Check notepad: `.sisyphus/notepads/*/`
3. Check Gas Town mail: `gt mail inbox gastown/crew/sisyphus`
4. Proceed with work

---

## Before Commit

- [ ] Build passes (`npm run build && npx tsc --noEmit`)
- [ ] Tests pass (`npx playwright test tests/e2e/ --reporter=line` — 0 failures, skips OK)
- [ ] Update `current-session` memory
- [ ] `git push` succeeds

---

## E2E Test Conventions (read before touching `tests/e2e/`)

### Session injection — ONLY correct pattern
```ts
// ✅ Correct
await setupPlayerSession(page, { playerName, playerId, playerSecret });

// ❌ Wrong — causes silent failures
await page.addInitScript(() => {
  localStorage.setItem('userSession', JSON.stringify({ ... }));
});
```

### Skip tiers — three distinct meanings
| Pattern | Meaning | Action |
|---|---|---|
| `test.describe.skip(...)` inside `_future/` | Deferred — infrastructure not built | Un-skip only when infra is ready |
| `test.skip('...[needs data-testid="..."]')` | In-scope but selector missing | File implementation task; don't edit app |
| Deleted (no trace) | CUT feature | Do not recreate |

### Fixture format — camelCase vs snake_case
| Helper | Format | Safe for |
|---|---|---|
| `createMockPlayingState()` | camelCase | Weak assertions only (name visibility, etc.) |
| `toRoomResponse(gameState)` or inline `mockRoomResponse` object | snake_case | Strong assertions (`data-testid`, counts) |

The app API layer expects snake_case. Strong assertions fail silently with camelCase fixtures.

### GAIA usage model
- Local GAIA/polecat work can run from feature branches; it does not require `main`.
- A normal Codex session is not automatically a GAIA run. GAIA skills are injected only when using `scripts/gaia-polecat.py` or the external `~/gaia-polecat` workflow.
- Do not invoke GAIA orchestration from a branch where `scripts/gaia-polecat.py` has unrelated dirty changes unless the task is specifically to validate the runner.

## Skills Reference

| Skill | When to Consult |
|-------|-----------------|
| `.gaia_skills/react-refactoring-hygiene/SKILL.md` | Multi-file React/TypeScript refactors touching Context providers, component props, dead code, WebSocket/polling infra |
| `.gaia_skills/e2e-test-hygiene/SKILL.md` | Any E2E test failure or skip decision |
| `.gaia_skills/verification-before-completion/SKILL.md` | Before PR merge, CI gate failures |
