# Sound Royale - Current Plan

**Last Updated:** 2026-02-15
**Status:** COMPLETED

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
| E2E Infrastructure Fix | Fixed WebSocket connection errors, VITE_E2E_TESTING runtime detection |
| E2E Test UI Updates | Fixed test selectors to match actual UI components |

### 🔄 IN PROGRESS

| Goal | Blocker |
|------|---------|
| - | None - all tasks complete! |

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

### E2E Test Infrastructure Fix (2026-02-15)
**Problem:** All E2E tests failing with `WebSocket connection refused` errors
- Frontend tried to connect to Django backend at localhost:8000
- `VITE_E2E_TESTING` env var not available at runtime (Vite bundles at build time)
- MSW mocking not intercepting browser requests

**Solution:**
1. Added runtime E2E detection in `GameContext.tsx`:
   ```typescript
   const isE2E = import.meta.env.VITE_E2E_TESTING === 'true' || 
     (typeof window !== 'undefined' && (window as any).__E2E_TESTING__ === true);
   ```
2. Added init script in Playwright tests to inject flag:
   ```typescript
   await page.addInitScript(() => {
     (window as any).__E2E_TESTING__ = true;
   });
   ```
3. Replaced MSW with Playwright's `page.route()` for API mocking
4. Fixed Qodo feedback: removed redundant `.ssh/*` and `.aws/*` globs

**Test Results:**
- `smoke.spec.ts`: 2/2 ✅
- `bingo-line-detection.spec.ts`: 2/2 ✅
- All 35 E2E tests passing ✅
- Core E2E infrastructure working - no more WebSocket errors

---

## Verification Commands

```bash
# Build
npm run build && npx tsc --noEmit

# Security
rg "playerSecret" src/context/GameContext.tsx  # Should be 0

# Design System
ls design-system/sound-royale/MASTER.md

# E2E Tests (core)
npx playwright test tests/e2e/smoke.spec.ts tests/e2e/bingo-line-detection.spec.ts
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
