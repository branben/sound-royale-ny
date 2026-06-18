# Frontend Audit Report: Production Readiness

**Project:** Sound Royale (React/TypeScript/Vite)  
**Date:** 2026-06-17  
**Scope:** `src/`, `App.tsx`, `pages/`, `components/`, `hooks/`, `services/`, `vite.config.ts`  
**Audited by:** Royale CEO (orchestrated parallel sub-agent audit)

---

## Executive Summary

The Sound Royale frontend is a well-structured React/TypeScript application with solid architectural patterns (context-based state management, service layer separation, custom hooks). However, several critical issues must be addressed before production deployment:

- **2 CRITICAL** security findings (admin PIN in bundle, secrets in URLs)
- **10 HIGH** severity findings across security, performance, accessibility, and code quality
- **30+ MEDIUM/LOW** findings for incremental improvement

**Top 3 priorities:** (1) Move admin auth server-side, (2) Implement route-level code splitting, (3) Add aria-labels to all interactive elements.

---

## 1. Security Findings

### CRITICAL

#### SEC-1: Admin PIN Exposed in Client Bundle
- **File:** `src/pages/ThemeAdmin.tsx:13`, `src/pages/PlayerAdmin.tsx:13`
- **Detail:** `VITE_THEME_ADMIN_PIN` is embedded in the JavaScript bundle at build time. Anyone can extract it from deployed assets. The PIN is compared client-side and sent as a plaintext parameter to the backend.
- **Fix:** Move all admin authentication server-side. Use HttpOnly session cookies or JWTs. Remove `VITE_THEME_ADMIN_PIN` from the frontend entirely.

#### SEC-2: Player Secrets Transmitted via URL Query Parameters
- **File:** `src/services/api.ts:288,302`, `src/services/gameSocket.ts:78`
- **Detail:** Player secrets and Discord session secrets are passed as URL query parameters in GET requests and WebSocket connection URLs. These end up in browser history, server logs, proxy logs, and referrer headers.
- **Fix:** Use `Authorization` headers or POST bodies for secrets. For WebSockets, send auth via an initial message frame after connection.

### HIGH

#### SEC-3: Credentials Stored in localStorage Without Encryption
- **File:** `src/services/discordSession.ts:17-18,47-48,89-102`, `src/context/UserContext.tsx:47-48,64-76,139-157`
- **Detail:** Discord session secrets, player secrets, and OAuth state stored as plaintext JSON in `localStorage`/`sessionStorage`. Accessible to any JavaScript (XSS, browser extensions).
- **Fix:** Use `HttpOnly`, `Secure`, `SameSite=Strict` cookies for session tokens. Minimize sensitive data stored client-side.

#### SEC-4: OAuth Authorization Code Sent via GET Query Parameters
- **File:** `src/services/api.ts:247`, `src/pages/DiscordCallback.tsx:13-16`
- **Detail:** The Discord OAuth `code` and `state` are extracted from the URL and re-sent as query parameters in a GET request, duplicating exposure in server logs and browser history.
- **Fix:** Handle OAuth callback server-side, or send the code via POST body.

#### SEC-5: dangerouslySetInnerHTML Used for Dynamic CSS
- **File:** `src/components/ui/chart.tsx:69-87`
- **Detail:** Chart config values are interpolated into a `<style>` tag via `dangerouslySetInnerHTML` without sanitization. If any value becomes user-controlled, this enables CSS injection.
- **Fix:** Use inline styles or pre-computed static CSS. Whitelist-validate all interpolated values.

### MEDIUM

#### SEC-6: No Content Security Policy
- **File:** `index.html`, `vite.config.ts`
- **Detail:** No CSP defined anywhere — no protection against inline script injection, third-party script loading, or clickjacking.
- **Fix:** Add strict CSP header: `script-src 'self'`, `style-src 'self' 'unsafe-inline'`, `connect-src 'self' wss://api.soundroyale.com`, `frame-ancestors 'none'`.

#### SEC-7: No CORS Configuration on Dev Server
- **File:** `vite.config.ts:8-11`
- **Detail:** Dev server binds to `::` (all interfaces) with no CORS restrictions.
- **Fix:** Add `cors: { origin: ['http://localhost:8081'] }` to dev server config.

#### SEC-8: Insufficient Input Validation on Forms
- **File:** `src/components/lobby/PlayerNameInput.tsx:11`, `src/components/lobby/CreateRoomForm.tsx`
- **Detail:** Player names only length-capped (20 chars), no character allowlisting. Room names only trimmed. No server-side validation confirmed.
- **Fix:** Add allowlist validation (`/^[a-zA-Z0-9 _-]+$/`) on client. Ensure server-side validation exists.

#### SEC-9: WebSocket Messages Not Schema-Validated
- **File:** `src/services/gameSocket.ts:34-40`
- **Detail:** Only the `type` field is validated. Payloads are cast via `as GameSocketMessage` without runtime validation.
- **Fix:** Add runtime payload validation using `zod` or similar for each message type.

#### SEC-10: OAuth Redirect URL Not Validated
- **File:** `src/components/game/DiscordLinkModal.tsx:85`
- **Detail:** `window.location.href = authorization_url` with no domain validation.
- **Fix:** Validate URL hostname is `discord.com` or `discordapp.com` before redirecting.

---

## 2. Performance Findings

### CRITICAL

#### PERF-1: No Code Splitting or Lazy Loading of Routes
- **File:** `src/App.tsx:7-14,38-49`
- **Detail:** All 9 page components are statically imported. Admin pages, Discord OAuth, producer view, and heavy dependencies (recharts, framer-motion, canvas-confetti) are bundled into a single chunk delivered to every user.
- **Fix:** Wrap routes with `React.lazy()` and `<Suspense>`. Especially lazy-load admin pages, DiscordCallback, and PlayerProfileModal.

### HIGH

#### PERF-2: No Bundle Optimization in Vite Config
- **File:** `vite.config.ts`
- **Detail:** No `build.rollupOptions`, no manual chunks, no minify tuning, no `optimizeDeps`.
- **Fix:** Add `manualChunks` to split vendor chunks (react-vendor, animation-vendor, ui-vendor, chart-vendor). Set `build.minify: 'esbuild'`.

#### PERF-3: Large Bundle from Heavy Dependencies
- **File:** `package.json`
- **Detail:** `framer-motion` (~130KB), `recharts` (~100KB+), 20+ `@radix-ui/*` packages, `canvas-confetti` — all eagerly loaded for every user.
- **Fix:** Lazy-load `PlayerProfileModal` (recharts) and `VictoryCelebration` (canvas-confetti). Audit lucide-react tree-shaking.

#### PERF-4: useGameRefreshEffect Unstable Callback Reference
- **File:** `src/context/useGame.ts:20-26`, `src/pages/Room.tsx:414`
- **Detail:** `callback` in the `useEffect` dependency array causes effect re-runs on every parent re-render if the callback isn't perfectly memoized.
- **Fix:** Use `useRef` or `useEvent` pattern for the callback.

#### PERF-5: Lobby Page — No Memoization of Callbacks
- **File:** `src/pages/Lobby.tsx` (344 lines)
- **Detail:** 0 `useMemo` and 0 `useCallback` calls. All handlers recreated on every render, causing child re-renders. Discord status effect re-runs on every keystroke.
- **Fix:** Wrap handlers in `useCallback`. Debounce or remove `playerNameInput` from Discord status effect deps.

#### PERF-6: Full Game State Reconstructed on Every WebSocket Message
- **File:** `src/context/GameContext.tsx:134-186`
- **Detail:** Every `game_state_update` WebSocket message rebuilds the entire `players` object (all 9 tiles per player). With `timer_tick` every second, this triggers full re-renders of all context consumers.
- **Fix:** Diff changed players only. Consider Zustand/Jotai for granular reactivity.

### MEDIUM

#### PERF-7: Context Value Recreated Every Render
- **File:** `src/context/GameContext.tsx:282-293`
- **Detail:** `updateTileStatus`, `setTileAudio`, `toggleReady`, `incrementScore` not wrapped in `useCallback`, causing `contextValue` memo to be useless.
- **Fix:** Wrap action functions in `useCallback`. Consider splitting state and actions into separate contexts.

#### PERF-8: SpectatorView Un-memoized Filters/Sorts
- **File:** `src/components/game/SpectatorView.tsx:34-61`
- **Detail:** `players`, `producers`, `spectators` recomputed every render. `boardRefs` memo depends on recreated `producers` array.
- **Fix:** Memoize derived arrays with `useMemo`.

#### PERF-9: GameInfo Expensive Un-memoized Computations
- **File:** `src/components/game/GameInfo.tsx:205-228`
- **Detail:** Player derivations and 6 inline helper functions recreated every render.
- **Fix:** Memoize derivations. Move helper functions outside the component.

#### PERF-10: Leaderboard N+1 API Calls
- **File:** `src/pages/Leaderboard.tsx:56-87`
- **Detail:** Fetches genre performance individually for every player. Dozens of concurrent API calls.
- **Fix:** Create a batch endpoint. Limit concurrency with `p-limit`. Cache with TanStack Query.

#### PERF-11: WebSocket Reconnection Lacks Network Awareness
- **File:** `src/services/gameSocket.ts:199-213`
- **Detail:** No `navigator.onLine` check before reconnecting. No visibility change listener. No user notification when retries are exhausted.
- **Fix:** Add online/offline event listeners. Surface disconnect state to user with a banner.

#### PERF-12: BingoBoard Renders Tiles Twice
- **File:** `src/components/game/BingoBoard.tsx:92-118`
- **Detail:** Two separate `.map()` iterations over the same 9 tiles (dot indicators + grid).
- **Fix:** Combine into a single pass or extract dot indicators into a memoized sub-component.

---

## 3. Code Quality Findings

### HIGH

#### QA-1: TypeScript Strictness Disabled
- **File:** `tsconfig.json:9-14`
- **Detail:** `noImplicitAny: false`, `strictNullChecks: false`, `noUnusedParameters: false`, `noUnusedLocals: false`. ESLint `no-unused-vars` also disabled.
- **Fix:** Enable all strict flags. Enable ESLint unused-vars rule. Fix resulting errors incrementally with `// @ts-expect-error` where needed.

#### QA-2: Duplicate State Management in Room.tsx
- **File:** `src/pages/Room.tsx:162-163`
- **Detail:** `Room.tsx` maintains its own `loading`/`error` state that duplicates `GameContext`. Every room is fetched twice on mount.
- **Fix:** Consolidate to a single source of truth.

#### QA-3: setGameState Exposed Directly in Context
- **File:** `src/context/GameContext.tsx:10,283`
- **Detail:** Any component can replace the entire game state with an unvalidated partial object.
- **Fix:** Remove `setGameState` from context. Expose specific action functions that enforce invariants.

### MEDIUM

#### QA-4: 33 console.error Calls as Error-Handling Dead-Ends
- **File:** Multiple files (Lobby.tsx, Room.tsx, GameContext.tsx, gameSocket.ts, api.ts, etc.)
- **Detail:** API errors are logged to console but users only see generic toasts. Error details are hidden.
- **Fix:** Add centralized error reporting (e.g., Sentry). Surface error details in toast messages.

#### QA-5: ErrorBoundary "Try Again" Doesn't Retry
- **File:** `src/components/ErrorBoundary.tsx:74-76`
- **Detail:** The "Try again" button resets `hasError` to `false` without retrying the failed operation, potentially causing an infinite error loop.
- **Fix:** Implement a proper retry mechanism or navigate away.

#### QA-6: Unhandled Promise in GlobalLeaderboardPage
- **File:** `src/pages/GlobalLeaderboardPage.tsx:13-16`
- **Detail:** If the API fails, the UI stays in loading forever with no error feedback.
- **Fix:** Add error state and display an error message with retry button.

#### QA-7: any Types in Production Code
- **File:** `src/services/api.ts:286,300`, `src/components/game/PlayerStatsRadar.tsx:90-222`
- **Detail:** `Record<string, any>` erases privacy settings type. 6 `any` types in Recharts render props.
- **Fix:** Define proper `PrivacySettings` interface. Create typed wrappers for Recharts.

#### QA-8: No Prettier Configuration
- **Detail:** No `.prettierrc`, no `prettier` dependency, no formatting script.
- **Fix:** Add Prettier with a standard config. Add `format` and `format:check` scripts.

#### QA-9: No Test Coverage Measurement
- **File:** `vitest.config.ts`
- **Detail:** No coverage provider configured. No way to measure coverage percentages.
- **Fix:** Add coverage provider (v8 or istanbul) with thresholds.

#### QA-10: Vite Dev Server Missing API Proxy
- **File:** `vite.config.ts`
- **Detail:** No `server.proxy` for `/api` requests. CORS issues likely in development.
- **Fix:** Add `server.proxy: { '/api': 'http://localhost:8000' }`.

---

## 4. UX Quality & Accessibility Findings

### CRITICAL

#### UX-1: Missing aria-labels on Interactive Elements (40+ instances)
- **Files:** `Room.tsx:134-139`, `GameInfo.tsx:330-335,383-388`, `TurnTimer.tsx:65-67`, `OnboardingModal.tsx:19-24`, `GameTutorial.tsx:75-79`, `RoomBrowser.tsx:102-107`, `BingoTile.tsx:195-208`, `VotingPanel.tsx:130-145`, `SpectatorView.tsx:87-90`, `ThemeSelector.tsx:35-49`
- **Detail:** Raw `<button>` elements with only icon content and no accessible name. Screen readers announce "button" with no description.
- **Fix:** Add `aria-label` to every `<button>` that lacks visible text. This is the single highest-impact accessibility fix.

#### UX-2: No Skip-to-Content Link
- **File:** `src/App.tsx`
- **Detail:** Keyboard users must tab through all navigation to reach main content.
- **Fix:** Add `<a href="#main-content" className="sr-only focus:not-sr-only">Skip to main content</a>`.

### HIGH

#### UX-3: Touch Targets Too Small on Mobile
- **File:** Multiple components
- **Detail:** Close buttons (20px), kick buttons (24px), audio play/pause (24px) — all below WCAG 2.5.5 minimum 44x44px.
- **Fix:** Wrap small icons in larger touch areas with `min-h-[44px] min-w-[44px]`.

#### UX-4: Missing Form Field Labels
- **File:** `PlayerNameInput.tsx:13`, `Leaderboard.tsx:134`, `PlayerAdmin.tsx:178`
- **Detail:** Inputs rely solely on `placeholder` text. No associated `<Label>` or `aria-label`.
- **Fix:** Add `<Label>` elements or `aria-label` attributes to all inputs.

#### UX-5: cursor-pointer Elements Not Keyboard Accessible
- **File:** `Leaderboard.tsx:172`, `ScoreDisplay.tsx:82`
- **Detail:** `<motion.div>` with `onClick` and `cursor-pointer` but no `tabIndex`, `role`, or keyboard handlers.
- **Fix:** Add `tabIndex={0}`, `role="button"`, and `onKeyDown` handler for Enter/Space.

#### UX-6: Color-Only Status Indicators
- **File:** `RoomBrowser.tsx:88-93`, `GameInfo.tsx:239`, `BingoTile.tsx:116`
- **Detail:** Room status, game status, and tile status conveyed only through color changes.
- **Fix:** Pair color with text labels or icon changes for colorblind users.

#### UX-7: Hardcoded text-white Instead of Semantic Tokens
- **File:** 20+ components
- **Detail:** `text-white`, `text-gray-400` used instead of `text-foreground`, `text-muted-foreground`. Will fail contrast on light themes.
- **Fix:** Replace with semantic design tokens throughout.

#### UX-8: No Inline Error Messages on Forms
- **File:** `JoinRoomForm.tsx:56-59`, `CreateRoomForm.tsx:68-72`
- **Detail:** Forms show generic error banners but no field-level validation messages.
- **Fix:** Add field-level validation with error messages attached to specific inputs.

#### UX-9: Room Not Found Auto-Redirects Without User Control
- **File:** `src/pages/Room.tsx:401-405`
- **Detail:** 404 triggers a toast + `setTimeout(() => navigate('/'), 2000)`. User cannot cancel.
- **Fix:** Show a full error screen with a manual "Back to Lobby" button.

#### UX-10: Inconsistent Loading States
- **File:** `Leaderboard.tsx:143-146`, `Lobby.tsx`, `ThemeAdmin.tsx`
- **Detail:** Some pages have spinners, others show empty content. No skeleton screens.
- **Fix:** Add consistent loading indicators and skeleton placeholders.

### MEDIUM

#### UX-11: Minimal Responsive Breakpoints on Several Pages
- **File:** `Producer.tsx`, `NotFound.tsx`, `DiscordCallback.tsx`
- **Detail:** Zero or minimal responsive breakpoints. Layout may break on mobile.
- **Fix:** Add mobile-first responsive layouts with consistent breakpoints.

#### UX-12: No Error role="alert" on Error States
- **File:** `Room.tsx:445-459`, `NotFound.tsx`
- **Detail:** Error messages not announced to screen readers.
- **Fix:** Add `role="alert"` to error message containers.

#### UX-13: PrivacySettings Labels Not Associated with Switches
- **File:** `src/components/game/PrivacySettings.tsx:115,130,145,160,175`
- **Detail:** `<label>` elements lack `htmlFor`/`id` association with `<Switch>` inputs.
- **Fix:** Add unique `id` to each Switch and match with `htmlFor` on labels.

---

## 5. Testing Coverage Findings

### HIGH

#### TEST-1: No Unit Tests for Pages, Contexts, or Core Game Components
- **Detail:** 97 source files, only 6 test files — all concentrated in `components/game/` (display components) and `services/__tests__/`. Zero tests for:
  - All page components (Room.tsx, Lobby.tsx, Producer.tsx, Leaderboard.tsx, etc.)
  - Context providers (GameContext.tsx, UserContext.tsx)
  - Core game components (BingoBoard, BingoTile, PlayerView, GameInfo, VotingPanel, SpectatorView)
  - API service layer (api.ts, 370+ lines)
  - Custom hooks (usePlayerColors, useGame, useGameRefresh)
- **Fix:** Prioritize testing for GameContext, Room.tsx, Lobby.tsx, and the API service layer.

#### TEST-2: Only 1 Test for WebSocket Service
- **File:** `src/services/__tests__/gameSocket.test.ts`
- **Detail:** Single test covers one reconnection scenario. No tests for message handling, connection lifecycle, or error recovery.
- **Fix:** Add tests for all WebSocket event handlers and edge cases.

### MEDIUM

#### TEST-3: No Test Coverage Reporting
- **Detail:** Vitest configured without coverage. No way to measure or enforce coverage thresholds.
- **Fix:** Add `coverage: { provider: 'v8', thresholds: { lines: 70, branches: 60 } }` to vitest config.

#### TEST-4: E2E Tests Well-Organized but 19 Intentional Skips
- **File:** `tests/e2e/`
- **Detail:** 31 spec files with good POM pattern, but 19 tests skipped (17 in `_future/`, 2 ELO delta assertions).
- **Fix:** Track skipped tests as technical debt. Prioritize unskipping the ELO delta tests.

---

## 6. Missed Opportunities & Dead Code

### HIGH

#### OPP-1: 690 Lines of Dead Component Code (10 Files)
- **Files:**
  - `HostMigrationIndicator.tsx` (34 lines)
  - `MultiRoundConfig.tsx` (96 lines)
  - `PlayerBoardDisplay.tsx` (47 lines)
  - `RoundIndicator.tsx` (65 lines)
  - `TurnIndicator.tsx` (63 lines)
  - `GameArena.tsx` (33 lines)
  - `NavLink.tsx` (28 lines)
  - `VerifiedIdentityPanel.tsx` (134 lines)
  - `GenreHeatmap.tsx` (84 lines)
  - `ConflictResolution.tsx` (106 lines)
- **Detail:** All exported but never imported. Adds bundle size and maintenance burden.
- **Fix:** Either integrate these components or remove them. If planned for future use, move to a `wip/` directory.

#### OPP-2: Verified Identity System — UI Complete, Backend Unimplemented
- **File:** `src/components/auth/VerifiedIdentityPanel.tsx`, `src/context/UserContext.tsx:339-346`
- **Detail:** Full UI exists but `requestLoginCode`/`verifyLoginCode` throw at runtime. Component is never rendered.
- **Fix:** Either implement the backend integration or remove the UI to avoid confusion.

#### OPP-3: Multi-Round Game Support — UI Complete, Unused
- **File:** `src/components/game/MultiRoundConfig.tsx` (96 lines)
- **Detail:** Full UI with round selection (1/3/5/7/10) and host controls. Never imported.
- **Fix:** Integrate into the game flow or move to `wip/`.

### MEDIUM

#### OPP-4: Unused Utility Exports
- `formatScore` in `src/lib/utils.ts:9` — exported, never imported
- `getErrorLog`/`clearErrorLog` in `src/components/ErrorBoundary.tsx:42` — exported, never imported

#### OPP-5: mockGameState Adds Bundle Size (E2E-Only Usage)
- **File:** `src/data/mockGameState.ts`
- **Detail:** Only referenced in GameContext for E2E testing path, but bundled for all users.
- **Fix:** Move to test utilities or conditionally import.

#### OPP-6: package.json Has Generic Name
- **Detail:** `"name": "vite_react_shadcn_ts"` — the default template name.
- **Fix:** Change to `"sound-royale-frontend"`.

---

## Severity Summary

| Severity | Count | Categories |
|----------|-------|------------|
| **CRITICAL** | 2 | Security (admin PIN in bundle, secrets in URLs) |
| **HIGH** | 18 | Security (3), Performance (5), Code Quality (3), Accessibility (5), Testing (2) |
| **MEDIUM** | 24 | Security (4), Performance (3), Code Quality (5), Accessibility (5), Testing (2), DX (5) |
| **LOW** | 12 | Various minor improvements |
| **TOTAL** | **56** | |

---

## Recommended Fix Order

1. **Immediate (this week):**
   - SEC-1: Move admin auth server-side
   - SEC-2: Stop sending secrets in URL query params
   - PERF-1: Implement React.lazy() code splitting for routes
   - UX-1: Add aria-labels to all icon-only buttons

2. **Short-term (next 2 weeks):**
   - SEC-3: Migrate localStorage credentials to HttpOnly cookies
   - PERF-2: Add Vite bundle optimization
   - PERF-6: Fix game state reconstruction on WebSocket messages
   - QA-1: Enable TypeScript strict mode
   - QA-2: Consolidate duplicate state in Room.tsx
   - TEST-1: Add unit tests for GameContext and Room.tsx

3. **Medium-term (next month):**
   - OPP-1: Remove or integrate 690 lines of dead code
   - PERF-10: Fix Leaderboard N+1 API calls
   - UX-3: Fix touch target sizes for mobile
   - UX-7: Replace hardcoded colors with semantic tokens
   - QA-8: Add Prettier configuration
   - TEST-3: Add test coverage reporting
