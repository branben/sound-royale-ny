# Sound Royale - Current Plan

**Last Updated:** 2026-02-15
**Status:** IN PROGRESS

---

## 🎯 Active Mission: Complete Userflow - Create Room + Join

**Critical Gap:** App has NO "Create Room" UI. Users can only join existing rooms by code. The `createRoom` API exists but is never called.

---

## Current Status

### ✅ COMPLETED

| Goal | Notes |
|------|-------|
| Security Fixes | playerSecret removed, test file deleted, host detection fixed |
| GAIA Polecat Setup | qodo-feedback-loop.sh working, beads persisting |
| Design System | design-system/sound-royale/MASTER.md generated |
| Mock Data Policy | VITE_E2E_TESTING gating enforced |
| Lobby UI Redesign | Design system applied |
| Room UI Redesign | Design system applied |
| Qodo PR Feedback | PR #5 fixes applied (.beadsignore, gaia-guards-ci.yml, guards_adapter.py) |
| Create Room UI | Toggle between Join/Create, roomApi.createRoom() wired to Lobby |
| Room Load Errors | One-shot guard added to prevent fetch loop |
| WebSocket Real-time Connection | gameSocket.ts created, integrated with GameContext |
| Audio Playback System | Play button added to BingoTile, audio playback works |
| Player Reconnection | Enhanced rejoin with localStorage, better error handling |

### 🔄 IN PROGRESS

| Goal | Blocker |
|------|---------|
| None | - |

### ⏳ NOT STARTED

| Priority | Goal |
|----------|------|
| MEDIUM | Game Round Transitions |
| MEDIUM | Spectator Experience |
| MEDIUM | E2E Test Expansion |

---

## 🚧 Current Blocker

**None** - All in-progress items completed.

---

## Next Steps

### Step 1: Game Round Transitions (MEDIUM PRIORITY)

- Implement round-to-round transitions
- Handle round timer and winner announcements
- Location: GameContext + Room page

### Step 2: Spectator Experience (MEDIUM PRIORITY)

- Enhance spectator view with player boards
- Add spectator-only chat or reactions
- Location: SpectatorView component

### Step 3: E2E Test Expansion (MEDIUM PRIORITY)

- Expand Playwright tests to cover full game flow
- Test WebSocket real-time updates
- Location: tests/e2e/

---

## Verification Commands

```bash
# Build
npm run build && npx tsc --noEmit

# Security
rg "playerSecret" src/context/GameContext.tsx  # Should be 0

# Design System
ls design-system/sound-royale/MASTER.md
```

---

## Quick Reference

| Command | Description |
|---------|-------------|
| `npm run dev` | Start frontend |
| `python backend/manage.py runserver` | Start backend |
| `npm run test:e2e` | Run E2E tests |
| `../gaia-polecat "task"` | Run Codex task |

---

## Resources

- Design System: `design-system/sound-royale/MASTER.md`
- GameContext: `src/context/GameContext.tsx`
- API: `src/services/api.ts`
- Backend: `backend/game_engine/`
