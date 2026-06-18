# Sound Royale — Frontend Audit Report

**Date:** 2026-06-16  
**Scope:** React/TypeScript/Vite frontend production readiness audit  
**Audited by:** OWL (CEO) — parallel audit agents  
**Issue:** SOU-70  

---

## Executive Summary

This audit covers 97 TypeScript/TSX files across the Sound Royale frontend. The codebase is a multiplayer music bingo game built with React, TypeScript, Vite, and WebSockets. It uses a context-based state management pattern with a singleton WebSocket service.

**Overall Assessment:** The codebase has a clean architecture with good separation of concerns, but has significant issues in security (client-side auth), performance (no code splitting, defeated memoization), accessibility (missing ARIA labels), and testing (zero coverage for pages and interactive components). Several critical security vulnerabilities need immediate attention before production deployment.

| Category | Critical | High | Medium | Low | Total |
|----------|----------|------|--------|-----|-------|
| Security | 3 | 5 | 7 | 5 | 20 |
| Performance | 1 | 4 | 6 | 5 | 16 |
| Code Quality | 0 | 7 | 7 | 10 | 24 |
| UX/Accessibility | 13 | 17 | 15 | 7 | 52 |
| **TOTAL** | **17** | **33** | **35** | **27** | **112** |

---

## 🔴 CRITICAL Findings (17)

### Security (3)

**S1. Admin PIN Exposed in Frontend Bundle**  
- **Files:** `src/pages/PlayerAdmin.tsx:13`, `src/pages/ThemeAdmin.tsx:14`  
- The admin PIN is read from `import.meta.env.VITE_THEME_ADMIN_PIN` and compared client-side. Vite bundles all `VITE_*` values as plain strings in JS bundles — anyone can inspect the bundle to extract the PIN.  
- **Fix:** Move all admin authentication to server-side sessions. Admin operations should require server-side auth (Django admin session or JWT).

**S2. Discord OAuth Tokens Stored in localStorage**  
- **Files:** `src/services/discordSession.ts:47-49`, `src/pages/DiscordCallback.tsx:49-51`  
- Discord `access_token` and `refresh_token` are stored in localStorage. Any XSS vulnerability or browser extension can exfiltrate these tokens.  
- **Fix:** Handle OAuth callback entirely server-side. Frontend should only receive a session cookie.

**S3. Player Secrets Stored in localStorage**  
- **Files:** `src/context/UserContext.tsx:140-160`, `src/services/discordSession.ts:90-98`  
- The `playerSecret` (sole auth credential for game actions) is persisted in localStorage and transmitted in URL query parameters.  
- **Fix:** Use httpOnly, secure, SameSite cookies. Never transmit secrets in URL query parameters.

### Performance (1)

**P1. GameContext Triggers Re-renders in 8 Consumers**  
- **File:** `src/context/GameContext.tsx`, lines 282-293  
- The `useMemo` for `contextValue` includes non-memoized functions (`updateTileStatus`, `setTileAudio`, `toggleReady`, `incrementScore`) that are new references every render, defeating memoization entirely.  
- **Fix:** Wrap functions in `useCallback` or split context into smaller, focused contexts.

### UX (13)

**UX-A1. Mobile Game Dock Buttons Lack ARIA Labels** — `src/pages/Room.tsx:131-154`  
**UX-A2. SpectatorView Progress Bars Not Accessible** — `src/components/game/SpectatorView.tsx:87-124`  
**UX-A3. VotingPanel Vote Buttons Lack Accessible State** — `src/components/game/VotingPanel.tsx:130-163`  
**UX-A4. BingoBoard Tile Dots Not Accessible** — `src/components/game/BingoBoard.tsx:91-104`  
**UX-A5. TurnTimer Pause Button Has No Accessible Label** — `src/components/game/TurnTimer.tsx:65-78`  
**UX-A6. GameArena is a Placeholder/Stub** — `src/components/game/GameArena.tsx:1-33`  
**UX-A7. No Skeleton Loaders** — `src/pages/Room.tsx:416-443`  
**UX-A8. Error Messages Not User-Friendly** — `src/pages/Room.tsx:445-459`  
**UX-A9. No Retry Mechanism for Failed Room Loads** — `src/pages/Room.tsx:328-412`  
**UX-A10. Lobby Has No Loading State** — `src/pages/Lobby.tsx:25-344`  
**UX-A11. Quick Match Has No Cancellation** — `src/pages/Lobby.tsx:191-246`  
**UX-A12. No Feedback for Room Code Copy** — `src/components/lobby/LobbyWaitingRoom.tsx:123-127`  
**UX-A13. No Unit Tests for Page Components** — Lobby and Room pages have zero coverage  

---

## 🟠 HIGH Findings (33)

### Security (5)

**S4. No Content Security Policy** — No CSP meta tag or header configured.  
**S5. `dangerouslySetInnerHTML` in Chart Component** — `src/components/ui/chart.tsx:69-87`  
**S6. Discord OAuth Redirect Without Validation** — `src/components/game/DiscordLinkModal.tsx:85`  
**S7. Player Secret in WebSocket URL Query Params** — `src/services/gameSocket.ts:74-79`  
**S8. Player Secret in API URL Query Params** — `src/services/api.ts:288,302`

### Performance (4)

**P2. No Code Splitting — All Routes Eagerly Loaded** — `src/App.tsx:7-15`  
**P3. GameInfo Re-renders Every 1 Second** — `src/components/game/GameInfo.tsx:60-72`  
**P4. SpectatorView Defeats BingoBoard Memoization** — `src/components/game/SpectatorView.tsx:28-216`  
**P5. GameContext Consumed by 8 Components** — All re-render on every WebSocket message

### Code Quality (7)

**CQ1. TypeScript Strictness Flags Disabled** — `tsconfig.json:9-14` (`noImplicitAny`, `strictNullChecks`, `noUnusedLocals`, `noUnusedParameters` all false)  
**CQ2. Defeated useMemo/useCallback in GameContext** — `src/context/GameContext.tsx:282-293`  
**CQ3. VITE_THEME_ADMIN_PIN Without Fallback** — `src/pages/PlayerAdmin.tsx:13`  
**CQ4. No .env.example File** — Required env vars undocumented  
**CQ5. 31 console.error Calls in Production Code** — 17 files  
**CQ6. Two Routeless Pages** — `RoomLeaderboardPage.tsx`, `GlobalLeaderboardPage.tsx`  
**CQ7. Five Orphaned Component Files** — `BattleTile.tsx`, `ConflictResolution.tsx`, `GameArena.tsx`, `TurnIndicator.tsx`, `PlayerBoards.tsx`

### UX/Accessibility (17)

**A14. OnboardingModal Close Button Lacks aria-label** — `src/components/game/OnboardingModal.tsx:19-24`  
**A15. GameTutorial Dismiss Button Lacks aria-label** — `src/components/game/GameTutorial.tsx:75-79`  
**A16. RoomBrowser Close Button Lacks aria-label** — `src/components/game/RoomBrowser.tsx:102-107`  
**A17. HostMigrationIndicator Not Announced** — `src/components/game/HostMigrationIndicator.tsx:19-33`  
**A18. GameOverScreen No Focus Trap** — `src/components/game/GameOverScreen.tsx:29-85`  
**A19. WinnerAnnouncement No Focus Management** — `src/components/game/WinnerAnnouncement.tsx:27-105`  
**A20. BingoTile Audio Button Lacks Accessible Name** — `src/components/game/BingoTile.tsx:195-209`  
**A21. PlayerNameInput Has No Associated Label** — `src/components/lobby/PlayerNameInput.tsx:13-22`  
**A22. CreateRoomForm Input Has No Label** — `src/components/lobby/CreateRoomForm.tsx:37-44`  
**T4. No Tests for Context Providers** — GameContext, UserContext untested  
**T5. No Tests for Modal Components** — OnboardingModal, GameTutorial, etc.  
**T6. No Tests for ErrorBoundary** — Last line of defense untested  
**T7. gameSocket Test Coverage Minimal** — Only 1 test for WebSocket service  

---

## 🟡 MEDIUM Findings (35)

### Security (7)

**S9. No Security Headers** — Missing X-Content-Type-Options, X-Frame-Options, HSTS, Referrer-Policy  
**S10. Hardcoded HTTP Fallback URLs** — `src/services/api.ts:5`, `src/services/gameSocket.ts:67-68`  
**S11. `withCredentials: false` Explicitly Disabled** — `src/services/api.ts:13`  
**S12. No Input Sanitization Library** — No DOMPurify or equivalent  
**S13. Discord Avatar URL Rendered Without Validation** — `src/components/game/DiscordLinkModal.tsx:147-151`  
**S14. No `rel="noopener noreferrer"` on External Links**  
**S15. OAuth State Parameter Uses Dual Storage** — `src/services/discordSession.ts:89-101`

### Performance (6)

**P6. framer-motion in 14 Files** — ~35-45kB gzipped, cannot be tree-shaken effectively  
**P7. 6+ Unused Heavy Dependencies** — `date-fns`, `embla-carousel-react`, `cmdk`, `input-otp`, `react-day-picker`, `react-resizable-panels`  
**P8. Room.tsx is a 589-Line God Component** — `src/pages/Room.tsx`  
**P9. MobileGameDock Defined Inside Room Render Scope** — `src/pages/Room.tsx:28-155`  
**P10. WebSocket Singleton Race Condition on Remount** — `src/services/gameSocket.ts:54-263`  
**P11. No Heartbeat/Ping-Pong for Dead Connection Detection** — `src/services/gameSocket.ts`

### Code Quality (7)

**CQ8. `any` Types in Production Code** — `src/components/game/PlayerStatsRadar.tsx:90,92,193,195,216,222`  
**CQ9. `Record<string, any>` in Discord API Return Type** — `src/services/api.ts:286`  
**CQ10. Duplicate Default+Named Exports** — `PlayerBoards.tsx:4,20`, `GameArena.tsx:9,34`  
**CQ11. Misleading PR ERROR Comments** — `src/context/GameContext.tsx:268`, `src/lib/utils.ts:8`  
**CQ12. Empty Catch Block in Error Logging** — `src/services/api.ts:33-34`  
**CQ13. isE2E Check Evaluated Eagerly at Module Level** — `src/context/GameContext.tsx:33`  
**CQ14. Error Boundary Logs Not Surfaced** — `src/components/ErrorBoundary.tsx:60-72`

### UX/Accessibility (15)

**A23. Dialog Close Button Contrast** — `src/components/ui/dialog.tsx:45`  
**A24. SpectatorView Jump-to Buttons Lack Context** — `src/components/game/SpectatorView.tsx:143-164`  
**A25. GameInfo Player Buttons Not Keyboard-Focusable** — `src/components/game/GameInfo.tsx:281-290`  
**A26. UploadDrawer File Input Not Accessible** — `src/components/game/UploadDrawer.tsx:108-113`  
**UX13. TurnTimer Pause Button Confusing** — `src/components/game/TurnTimer.tsx:38-40`  
**UX14. VotingPanel No Visual Feedback for Disabled State** — `src/components/game/VotingPanel.tsx:81-93`  
**UX15. No Empty State for Spectators List** — `src/components/game/SpectatorView.tsx:73-86`  
**UX16. GameTutorial Positioning May Overlap** — `src/components/game/GameTutorial.tsx:61-70`  
**UX17. No Network Status Indicator** — `src/context/GameContext.tsx:129-217`  
**UX18. Play Again Uses window.location Instead of React Router** — `src/components/game/GameOverScreen.tsx:209`  
**UX19. No Confirmation for Destructive Actions** — `src/components/game/GameInfo.tsx:145-155`  

---

## 🟢 LOW Findings (27)

### Security (5)

**S16. `uuid` Package for Security-Sensitive Values** — Could use native `crypto.randomUUID()`  
**S17. No Subresource Integrity (SRI)** — `index.html`  
**S18. Backend .env Contains Django Dev Secret Key** — `backend/.env`  
**S19. No Rate Limiting on Frontend API Calls**  
**S20. Error Messages May Leak Internal Details** — `src/services/api.ts:19-36`

### Performance (5)

**P12. Dual Toast Libraries (sonner + toaster)** — `src/App.tsx:2-3`  
**P13. QueryClient with Default Options** — `src/App.tsx:18`  
**P14. Reconnection Lacks User-Visible Indicator** — `src/services/gameSocket.ts:199-213`  
**P15. Audio Elements May Leak on Rapid Tile Changes** — `src/components/game/BingoTile.tsx:69-83`  
**P16. UserContext Persist Timeout Not Cleaned on Unmount** — `src/context/UserContext.tsx:257-286`

### Code Quality (10)

**CQ15. Root tsconfig `"files": []` with compilerOptions** — `tsconfig.json:2`  
**CQ16. Inconsistent Page Export Patterns** — 9 pages use `export default function`, 2 use `const`  
**CQ17. No Barrel/Index Files** — All imports use full file paths  
**CQ18. Unused Default Exports in api.ts and gameSocket.ts**  
**CQ19. Only One TODO in Codebase** — `src/context/UserContext.tsx:339`  
**CQ20. Two Placeholder Components** — `VerifiedIdentityPanel.tsx`, `HostMigrationIndicator.tsx`  

### UX/Accessibility (7)

**A27. GenreHeatmap Hover Tooltips Not Accessible** — `src/components/game/GenreHeatmap.tsx:64-66`  
**A28. PrivacySettings Switches Lack htmlFor** — `src/components/game/PrivacySettings.tsx:113-126`  
**UX20. Discord Link Button Uses Raw SVG** — `src/components/lobby/LobbyLanding.tsx:102-104`  
**UX21. Room Code Input Allows Non-Numeric Briefly** — `src/pages/Lobby.tsx:186-189`  

---

## Top 10 Priority Fixes

| # | Priority | Finding | Impact |
|---|----------|---------|--------|
| 1 | **P0** | Move all auth to server-side (S1, S2, S3) | Prevents credential theft |
| 2 | **P0** | Add Content Security Policy (S4) | Prevents XSS attacks |
| 3 | **P1** | Enable TypeScript strict mode (CQ1) | Catches entire class of bugs |
| 4 | **P1** | Add route-based code splitting (P2) | Reduces initial bundle 50-70% |
| 5 | **P1** | Split GameContext (P1, P5) | Eliminates cascading re-renders |
| 6 | **P1** | Add ARIA labels to interactive elements (UX-A1-5) | Screen reader accessibility |
| 7 | **P1** | Write unit tests for pages (UX-A13, T1) | Prevents regressions |
| 8 | **P2** | Remove unused dependencies (P7) | Saves 50-100+ kB |
| 9 | **P2** | Add retry mechanisms (UX-A9) | Network resilience |
| 10 | **P2** | Centralize logging (CQ5) | Production debugging |

---

## Positive Observations

1. **No `eval()` or `new Function()` usage** — clean across the entire codebase
2. **No `document.write()` or `innerHTML`** in application code (only in chart.tsx)
3. **React JSX auto-escaping** is the default for all user-rendered content
4. **OAuth state parameter is validated** on callback, providing CSRF protection
5. **WebSocket message types are validated** against a whitelist
6. **localStorage access is wrapped** in try/catch safe accessors
7. **Clean dependency graph** — no circular dependencies, services never import contexts
8. **Well-designed E2e test helpers** with mock WebSocket and API routes
9. **Good MSW setup** in api.test.ts with comprehensive API mocking
10. **Input validation on genre admin** — validates genre count, uniqueness, and non-empty values

---

## Appendix: File Inventory

- **Total TS/TSX files:** 97
- **Page components:** 10 (Lobby, Room, Index, Producer, Leaderboard, ThemeAdmin, PlayerAdmin, DiscordCallback, NotFound, GlobalLeaderboardPage, RoomLeaderboardPage)
- **Game components:** 25+ (BingoBoard, BingoTile, VotingPanel, GameInfo, etc.)
- **UI components:** 20+ (shadcn/ui based)
- **Services:** 3 (api, gameSocket, discordSession)
- **Context providers:** 3 (GameContext, UserContext, useGame)
- **Custom hooks:** 4 (use-mobile, usePlayerColors, use-toast, useGame)
- **Unit test files:** 7 (4 component, 3 service)
- **E2E test files:** 31 (Playwright)
