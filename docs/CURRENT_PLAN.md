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
| Game Round Transitions | Round timer, winner announcements, round-to-round transitions |
| Spectator Experience | Leaderboard, game phase, request to play, jump to player |
| E2E Test Expansion | WebSocket, spectator, and multiplayer tests added |

### 🔄 IN PROGRESS

| Goal | Blocker |
|------|---------|
| None | - |

### ⏳ NOT STARTED

| Priority | Goal |
|----------|------|
| - | All tasks completed! |

---

## 🚧 Current Blocker

**None** - All in-progress items completed.

---

## Next Steps

All tasks from the plan have been completed!

### Recent PR
- **PR #21**: feat: enhance spectator experience and add E2E tests
  - Branch: `feature/spectator-e2e`
  - All Qodo feedback addressed
  - GAIA guards passing

### What's Done
- SpectatorView: Leaderboard, game phase indicator, request to play button, jump to player
- E2E Tests: WebSocket, Spectator, Multiplayer scenarios

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
