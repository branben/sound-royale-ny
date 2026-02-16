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
- Run: `npm run test:e2e`
- Required for any gameplay feature changes

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

## Session Start

1. Read `current-session` memory
2. Check notepad: `.sisyphus/notepads/*/`
3. Proceed with work

---

## Before Commit

- [ ] Build passes (`npm run build && npx tsc --noEmit`)
- [ ] Tests pass
- [ ] Update `current-session` memory
- [ ] `git push` succeeds
