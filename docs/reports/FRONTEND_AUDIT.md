# Sound Royale — Frontend Production Readiness Audit

**Date:** 2026-06-16  
**Scope:** React/TypeScript/Vite frontend (`src/`)  
**Audited by:** Parallel audit (Code Quality, Performance/Security, UX/Testing)  
**Issues:** [SOU-69](/SOU/issues/SOU-69) (this audit), [SOU-62](/SOU/issues/SOU-62) (parent: Production Ready Audit)

---

## Executive Summary

Sound Royale's frontend has a solid foundation with good component architecture (shadcn/ui + Radix), reasonable E2E test infrastructure, and clean Tailwind styling. However, several critical issues must be addressed before production:

1. **Security vulnerabilities** in how player secrets and admin credentials are handled (secrets in URLs, exposed in client bundle)
2. **State management bugs** that can cause infinite re-fetch loops in production
3. **No code splitting** — the entire app ships as one bundle
4. **Zero accessibility for keyboard/screen reader users** — the game is unplayable without a mouse
5. **Critical test gaps** — GameContext and API layer are completely untested

**Overall Assessment:** Not production-ready. Address all Critical and High items before launch.

---

## Findings Summary

| Severity | Count |
|----------|-------|
| 🔴 Critical | 5 |
| 🟠 High | 12 |
| 🟡 Medium | 15 |
| 🟢 Low | 8 |
| **Total** | **40** |

### Critical (5)
- **C-1:** Player secrets in URL query parameters — logged in server history, browser history, proxy caches
- **C-2:** Admin PIN embedded in client-side bundle — extractable by anyone
- **C-3:** Infinite re-fetch loop in Room page (`useGameRefreshEffect` + `error` dep in `fetchRoom`)
- **C-4:** GameContext/useGame has zero test coverage — core state management untested
- **C-5:** Keyboard navigation non-functional — game unplayable without mouse

### High (12)
- **H-1:** No code splitting/lazy loading — entire app loads on first visit
- **H-2:** No bundle optimization in Vite config — single JS bundle
- **H-3:** GameContext memoization broken — deps include non-stable function refs
- **H-4:** Five WebSocket message types silently ignored (player_joined, player_left, turn_change, bingo_achievement, victory_celebration)
- **H-5:** Dual state management (Room.tsx + GameContext) — two sources of truth
- **H-6:** Conflicting TypeScript strictness configs between root and app tsconfig
- **H-7:** Discord OAuth tokens passed through frontend — visible in network requests
- **H-8:** No ARIA live regions — real-time game state invisible to screen readers
- **H-9:** WebSocket service has only 1 test — reconnection/message handling untested
- **H-10:** No optimistic updates — all UI waits for server, visible network lag
- **H-11:** `dangerouslySetInnerHTML` in chart component — latent XSS vector
- **H-12:** No CSRF protection on API calls

---

## Detailed Findings

### 🔴 Critical Findings

#### C-1: Player Secrets Exposed in URL Query Parameters
- **Files:** `src/services/gameSocket.ts:78`, `src/services/api.ts:288,300`
- **Impact:** The `player_secret` (bearer token for game actions) is sent in WebSocket URLs and API query params. Ends up in server logs, browser history, referrer headers, proxy caches.
- **Fix:** Send secrets via `Authorization` header. Store in httpOnly cookies instead of localStorage.

#### C-2: Admin PIN Embedded in Client-Side Bundle
- **Files:** `src/pages/ThemeAdmin.tsx:14`, `src/pages/PlayerAdmin.tsx:13`
- **Impact:** `VITE_THEME_ADMIN_PIN` is visible in built JS bundle. Anyone can extract it and perform admin operations.
- **Fix:** Implement server-side session authentication. Never embed shared secrets in frontend env vars.

#### C-3: Infinite Re-fetch Loop in Room Page
- **Files:** `src/context/useGame.ts:20-26`, `src/pages/Room.tsx:335,406,412`
- **Impact:** `useGameRefreshEffect` includes `callback` in its deps, and `fetchRoom` includes `error` in its `useCallback` deps. When `error` changes → `fetchRoom` recreated → `useGameRefreshEffect` triggers → calls `fetchRoom` again → infinite loop.
- **Fix:** Use `useRef` for callback in `useGameRefreshEffect`. Remove `error` from `fetchRoom`'s deps.

#### C-4: GameContext / useGame Has Zero Test Coverage
- **Files:** `src/context/GameContext.tsx`, `src/context/useGame.ts`
- **Impact:** Core state management for entire game is untested. The infinite loop bug (C-3) would have been caught by basic tests.
- **Fix:** Write unit tests for all WebSocket message handlers, state transitions, and edge cases.

#### C-5: Keyboard Navigation Non-Functional
- **Files:** All game interaction components
- **Impact:** Bingo tiles, voting buttons, upload drawer have zero keyboard handlers. Game is **completely unplayable** without a mouse.
- **Fix:** Add keyboard handlers to all interactive components. Focus traps in modals/drawers. "Skip to main content" link.

---

### 🟠 High Findings

#### H-1: No Code Splitting / Lazy Loading
- **File:** `src/App.tsx:7-14`
- **Impact:** All 9 page components load on initial visit.
- **Fix:** Use `React.lazy()` + `<Suspense>` for all route components.

#### H-2: No Bundle Optimization in Vite Config
- **File:** `vite.config.ts` (18 lines, no build config)
- **Impact:** React, 27 Radix UI packages, framer-motion, recharts, app code all in one bundle.
- **Fix:** Add `build.rollupOptions.output.manualChunks` to split vendor bundles.

#### H-3: GameContext Memoization is Broken
- **File:** `src/context/GameContext.tsx:282-294`
- **Impact:** `useMemo` includes non-stable function references in deps. All context consumers re-render on every state change.
- **Fix:** Wrap handler functions in `useCallback`.

#### H-4: Five WebSocket Message Types Silently Ignored
- **File:** `src/context/GameContext.tsx:188-198`
- **Impact:** `player_joined`, `player_left`, `turn_change`, `bingo_achievement`, `victory_celebration` messages discarded. UI never reflects real-time player changes, round transitions, or other players' events.
- **Fix:** Implement handlers for all five message types.

#### H-5: Dual State Management Creates Two Sources of Truth
- **Files:** `src/pages/Room.tsx:161-163`, `src/context/GameContext.tsx:36-39`
- **Impact:** `Room.tsx` maintains local state while `GameContext` also holds game state. Data can become inconsistent.
- **Fix:** Consolidate to single source of truth.

#### H-6: Conflicting TypeScript Strictness Configs
- **Files:** `tsconfig.json` (root) vs `tsconfig.app.json`
- **Impact:** Root config disables `noImplicitAny`, `strictNullChecks`, `noUnusedLocals`. App config sets `strict: true`.
- **Fix:** Remove permissive overrides from root tsconfig.

#### H-7: Discord OAuth Token Passed Through Frontend
- **Files:** `src/services/api.ts:238-266`, `src/pages/DiscordCallback.tsx:42-52`
- **Impact:** Discord `access_token` and `refresh_token` flow through frontend, visible in network requests.
- **Fix:** Move token exchange server-to-server.

#### H-8: No ARIA Live Regions
- **Files:** All real-time game components
- **Impact:** Round transitions, genre reveals, voting open, bingo events invisible to screen reader users.
- **Fix:** Add `aria-live="polite"` and `aria-live="assertive"` regions.

#### H-9: WebSocket Service Has Only 1 Test
- **File:** `src/services/__tests__/gameSocket.test.ts`
- **Impact:** Connection management, message handling, reconnection logic untested.
- **Fix:** Write comprehensive unit tests for all WebSocket lifecycle events.

#### H-10: No Optimistic Updates
- **Files:** `src/components/game/PlayerView.tsx:68-92` and all game action components
- **Impact:** All UI waits for server confirmation. Network latency visible as UI lag.
- **Fix:** Implement optimistic updates with rollback on failure.

#### H-11: `dangerouslySetInnerHTML` in Chart Component
- **File:** `src/components/ui/chart.tsx:70`
- **Impact:** CSS injected via `dangerouslySetInnerHTML`. Latent XSS vector.
- **Fix:** Use CSS-in-JS or construct style elements programmatically.

#### H-12: No CSRF Protection
- **File:** `src/services/api.ts:13`
- **Impact:** `withCredentials: false`, no CSRF tokens.
- **Fix:** Implement CSRF tokens if using cookies. Set `withCredentials: true` with `SameSite=Strict`.

---

### 🟡 Medium Findings

1. **M-1:** 17+ `any` types in production code (`PlayerStatsRadar.tsx`, `api.ts`)
2. **M-2:** ErrorBoundary lacks backend reporting — wire into `/errors/log/` API
3. **M-3:** Fire-and-forget `.catch(console.error)` swallows user-visible errors (`Room.tsx:232,255,275`)
4. **M-4:** DiscordCallback provides no error detail or recovery path
5. **M-5:** Duplicate `use-toast.ts` in `components/ui/` and `hooks/`
6. **M-6:** GameProvider instantiated per-route — state lost on navigation
7. **M-7:** No request cancellation on API calls (missing `AbortController`)
8. **M-8:** Heavy unused dependencies (27 Radix UI packages, recharts in 2 files, `embla-carousel-react` not imported)
9. **M-9:** No `<nav>` element for navigation links
10. **M-10:** Upload drawer drag-and-drop doesn't work on mobile
11. **M-11:** No retry mechanism for failed API calls
12. **M-12:** No network offline detection
13. **M-13:** `GameArena.tsx` is dead code (never imported)
14. **M-14:** Mock data file (`mockGameState.ts`) bundled in production
15. **M-15:** 17 timer usages with magic numbers — no named constants

---

### 🟢 Low Findings

1. **L-1:** JSDoc coverage at ~2% (only 2 of 97 files documented)
2. **L-2:** `any` types in recharts callbacks (18+ instances)
3. **L-3:** Empty catch block in error interceptor (`api.ts:33`)
4. **L-4:** Reduced motion not fully respected (confetti fires unconditionally)
5. **L-5:** Circular dependency risk between `api.ts` and `discordSession.ts`
6. **L-6:** `emptyGameState` shared mutable reference pattern
7. **L-7:** Inconsistent test file placement
8. **L-8:** Console statements not stripped in production builds

---

## Test Coverage Summary

| Area | Coverage | Notes |
|------|----------|-------|
| UI Components | Medium | 6 test files, 87+ tests, no interaction testing |
| WebSocket Service | Critical | 1 test only |
| GameContext/useGame | Critical | Zero tests |
| API Layer | Critical | Zero tests |
| E2E | Good | 28 spec files with robust mock infrastructure |
| Integration | Critical | Zero integration tests |
| Custom Hooks | Critical | Zero hook tests |

---

## Positive Findings

- Clean component architecture — consistent shadcn/ui + Radix patterns
- Good Tailwind responsive design — 50+ breakpoint classes, mobile-first approach
- Solid E2E infrastructure — MockWebSocket with inject/simulate capabilities
- No `eval()` or `Function()` constructor usage
- No hardcoded API keys in source
- Consistent focus-visible styles across all interactive components
- ErrorBoundary wraps the entire app
- Toast notifications used appropriately for user feedback
- Types centralized in `src/types/game.ts` with clear interfaces
- Husky pre-commit hooks configured

---

## Recommended Fix Order

1. **C-3** Fix infinite re-fetch loop (hotfix — will happen in production)
2. **C-1** Stop sending secrets in URLs (security)
3. **C-2** Remove admin PIN from client bundle (security)
4. **H-4** Implement handlers for 5 ignored WebSocket messages (game functionality)
5. **H-1 + H-2** Add code splitting + bundle optimization (performance)
6. **H-3** Fix broken memoization in GameContext (performance)
7. **H-5** Consolidate state management (correctness)
8. **C-5** Add keyboard navigation (accessibility)
9. **H-7** Move OAuth token exchange server-side (security)
10. **H-9 + C-4** Write tests for WebSocket and GameContext
