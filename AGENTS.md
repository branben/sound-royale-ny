# Sound Royale - Agent Quick Ref

**Generated:** 2026-02-15 | **Branch:** main

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
