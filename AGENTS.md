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

## Code Discovery Guardrails

Use discovery tools in this order:

1. `ccc status` before relying on CocoIndex. If stale or missing, run `ccc index`.
2. `ccc search "<concept>"` for broad semantic discovery across frontend, backend, tests, docs, and GAIA workflow files.
3. `rg "<exact string>"` for exact matches, anti-pattern scans, secret scans, and test convention checks.
4. Serena MCP for exact symbol navigation, references, and scoped edits.
5. Read the target file/test before changing behavior.

CocoIndex narrows the search space; it is not proof. Never edit solely from a CocoIndex result. Verify with source reads, `rg`, or Serena first.

Good CocoIndex queries:
- `ccc search "player session and secret handling"`
- `ccc search --lang python "title ELO calculation"`
- `ccc search --lang typescript "leaderboard player profile heatmap"`
- `ccc search "GAIA polecat task contract guardrails"`

Never stage `.cocoindex_code/`, `.serena/cache/`, `.gaia_private/`, `.beads/`, or generated search/index state.

RTK (`rtk`) is optional command-output compression. Use it for noisy commands such as `rtk git status`, `rtk rg ...`, `rtk npm run build`, and `rtk pytest` when a compact summary is enough. Use raw commands or `rtk proxy <command>` for security reviews, exact diffs, migrations, destructive operations, and suspicious failures where full output matters.

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
| CocoIndex Code (`ccc`) | Semantic codebase discovery before broad or unfamiliar tasks |
| `rg` | Exact text search, anti-pattern scans, secret scans |
| RTK (`rtk`) | Optional high-volume shell output compression; bypass for exact/security-sensitive output |
| `sequentialthinking` | Complex multi-step problems, architectural decisions, debugging deadends (built-in, use ad-hoc) |
| Serena MCP | Exact symbolic code navigation (`serena.find_symbol`, `serena.replace_symbol_body`) |

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
- GAIA/polecat task contracts should include: discovery query, file allowlist, forbidden paths, required skills, stop conditions, and verification commands.
- For unfamiliar GAIA/Gas Town/polecat work, run `ccc search "GAIA polecat <task concept>"` before choosing files or spawning agents.
- CocoIndex is discovery-only in GAIA. Serena and direct file reads remain authoritative for edits.
