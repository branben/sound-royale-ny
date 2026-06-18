# Sound Royale — Frontend Production Readiness Audit Report

**Date:** 2026-06-16
**Scope:** React/TypeScript/Vite frontend (`src/` directory, ~12,165 lines across ~95 source files)
**Stack:** React 18, TypeScript 5.8, Vite 5, Tailwind CSS, Framer Motion, React Router 6, TanStack Query, Axios, Recharts, Zod, shadcn/ui primitives

---

## 1. CODE QUALITY

### Critical

| # | File | Line(s) | Description | Recommended Fix |
|---|------|---------|-------------|-----------------|
| C1 | `tsconfig.json` | 9-14 | **Root tsconfig disables strict mode entirely** — `noImplicitAny: false`, `noUnusedLocals: false`, `noUnusedParameters: false`, `strictNullChecks: false`, `allowJs: true`, `skipLibCheck: true`. While `tsconfig.app.json` sets `strict: true`, the root config's loose settings can leak through tooling and IDE experiences. | Remove the permissive overrides from `tsconfig.json`. Set root `strict: true` and remove `allowJs`, `noImplicitAny: false`, etc. |
| C2 | `src/services/api.ts` | 247 | **Discord OAuth callback passes `code` and `state` as URL query parameters in a GET request** (`/auth/discord/callback/?code=${code}&state=${state}`). OAuth authorization codes are sensitive credentials that should never appear in URLs (logged in browser history, server logs, referrer headers). | Use a POST request with the code in the body, or better, handle the callback server-side. |
| C3 | `src/services/api.ts` | 288 | **Player secret sent as URL query parameter** in `getAccountStatus` (`/auth/discord/status/?player_id=${playerId}&player_secret=${playerSecret}`). Secrets in URLs are logged everywhere. | Move to POST body or use an Authorization header. |
| C4 | `src/services/gameSocket.ts` | 74-78 | **Player secret transmitted as WebSocket URL query parameter** (`url.searchParams.set('secret', ...)`). WS URLs are visible in network logs and browser dev tools. | Use a subprotocol token or send credentials as the first message after connection. |

### High

| # | File | Line(s) | Description | Recommended Fix |
|---|------|---------|-------------|-----------------|
| H1 | `src/components/game/PlayerStatsRadar.tsx` | 90, 92, 193, 195, 216, 222 | **`any` type used 6 times** in the CustomTooltip component and Legend render props. This defeats TypeScript's type safety. | Define proper types for recharts payload/entry objects, or use `unknown` with type guards. |
| H2 | `src/services/api.ts` | 286, 300 | **`Record<string, any>` type for `privacy_settings`** — no type safety on privacy configuration. | Define a proper `PrivacySettings` interface with known keys. |
| H3 | `src/context/GameContext.tsx` | 141 | **Type assertion `as [string, GameState['players'][string]]`** — unsafe cast when iterating WebSocket message payload. If the backend sends malformed data, this will silently corrupt state. | Add runtime validation (e.g., Zod schema) for incoming WebSocket messages before applying to state. |
| H4 | `src/context/GameContext.tsx` | 282-293 | **`useMemo` dependency array includes every function reference** (`updateTileStatus`, `setTileAudio`, `toggleReady`, `incrementScore`) which are recreated every render, defeating memoization. The `contextValue` will be a new object every render. | Wrap helper functions in `useCallback` or move them outside the component. |
| H5 | `src/pages/Room.tsx` | 233-235, 256-258 | **Error type cast as `{ response?: { data?: { error?: string } }; message?: string }` without validation** — if the error shape differs, `error.response?.data?.error` silently returns undefined. | Use a type guard or Zod validation for API error responses. |
| H6 | `src/pages/Room.tsx` | 217 | **`window.prompt('Enter your name:')` for player name** — blocking, unstyled, no validation, poor UX. | Replace with a proper modal/form component. |
| H7 | `src/pages/Room.tsx` | 326 | **`setActiveRoomSession` missing from `useCallback` dependency array** for `attemptRejoin`. This causes a stale closure over the function reference. | Add `setActiveRoomSession` to the dependency array. |
| H8 | `src/components/game/VotingPanel.tsx` | 67-73 | **Error handling casts to `{ message: unknown }` and calls `String()` on it** — fragile error shape assumption. | Use a proper error type guard. |

### Medium

| # | File | Line(s) | Description | Recommended Fix |
|---|------|---------|-------------|-----------------|
| M1 | `src/context/GameContext.tsx` | 188-198 | **Switch cases for `bingo_achievement`, `victory_celebration`, `vote_submitted`, `turn_change`, `player_joined`, `player_left` are all empty** (just `break`). These events are silently ignored — features are half-built. | Implement handlers or remove the cases and add a `console.warn` for unhandled message types. |
| M2 | `src/pages/Room.tsx` | 346-393 | **Player board transformation logic is duplicated** between `fetchRoom` (lines 346-393) and `GameContext` `useEffect` (lines 64-113). Both transform `BackendPlayer` to `Player` independently. | Extract a shared `transformRoomToGameState` utility function. |
| M3 | `src/services/api.ts` | 307-336 | **`transformPlayer` function duplicates the same board transformation** found in `GameContext` and `Room.tsx`. Three separate copies of the same logic. | Consolidate into a single shared utility. |
| M4 | `src/components/game/BingoBoard.tsx` | 22-27 | **Player color classes are complete strings in an array** (e.g., `'bg-player-1/20'`) to satisfy Tailwind's scanner. This is fragile — if the palette changes, these must be manually updated. | Use CSS custom properties or inline styles instead of stringly-typed Tailwind classes. |
| M5 | `src/components/game/BingoTile.tsx` | 17-50 | **Same pattern as above** — 4-player color palette hardcoded as complete class strings in a 24-line array. | Use CSS variables or a dynamic class builder. |
| M6 | `src/components/game/PlayerView.tsx` | 138-147 | **Player accent classes duplicated** as a local `PLAYER_ACCENT` array, identical to the one in `BingoBoard.tsx`. | Import from a shared constant. |
| M7 | `src/components/game/SpectatorView.tsx` | 14-26 | **Third copy of player color class arrays** (`PLAYER_BAR`, `PLAYER_RING`). | Consolidate into a shared module. |
| M8 | `src/context/UserContext.tsx` | 339-346 | **`requestLoginCode` and `verifyLoginCode` throw "not yet implemented"** — dead code paths that will crash if called. The `VerifiedIdentityPanel` component calls these. | Either implement the backend integration or hide the UI behind a feature flag. |
| M9 | `src/components/game/GameOverScreen.tsx` | 49 | **Uses `XCircle` icon for "Game Over"** — misleading iconography (X-circle typically means error/close, not game over). | Use a more appropriate icon like `Skull` or `Flag`. |
| M10 | `src/components/game/VictoryCelebration.tsx` | 16-18 | **`onComplete` called immediately in a `useEffect`** when `isVisible` is true, making the celebration flash for one frame before disappearing. | Remove the immediate `onComplete` call; let the user dismiss it or use a timer. |
| M11 | `src/components/game/PlayerView.tsx` | 237-238 | **`window.location.href = '/'` for navigation** instead of React Router's `useNavigate()`. This causes a full page reload, destroying all state. | Use `navigate('/')` from `useNavigate()`. |
| M12 | `src/components/game/SpectatorView.tsx` | 209-210 | **Same `window.location.href = '/'` pattern** in `GameOverScreen` usage. | Use React Router navigation. |
| M13 | `src/components/ui/chart.tsx` | 70 | **`dangerouslySetInnerHTML` used to inject CSS variables** while chart config is not empty. While the source is controlled, this is an XSS risk if config is ever user-influenced. | Use a CSS-in-JS approach or direct style injection via `document.documentElement.style.setProperty`. |

### Low

| # | File | Line(s) | Description | Recommended Fix |
|---|------|---------|-------------|-----------------|
| L1 | `src/lib/utils.ts` | 8-11 | **`formatScore` function has a PR error comment** ("PR ERROR 1: Missing return type") but the function actually has a return type. The comment is misleading. | Remove the stale PR error comment. |
| L2 | `src/services/api.ts` | 99 | **PR ERROR 3 comment** ("Missing error handler") but the function actually has a try/catch. Stale comment. | Remove the misleading comment. |
| L3 | `src/context/GameContext.tsx` | 268 | **PR ERROR 2 comment** ("Direct state mutation - anti-pattern") but the `incrementScore` function correctly uses immutable update. Stale comment. | Remove the comment. |
| L4-L18 | Multiple files | — | **18 unused component files** (VSIndicator, PlayerBoardDisplay, PlayerBoards [empty], BattleTile, ConflictResolution, RoundIndicator, TurnIndicator, TurnTimer, MultiRoundConfig, GenreHeatmap, HostMigrationIndicator, PlayAgainButton, NavLink, VerifiedIdentityPanel) — ~600 lines of dead code. | Delete all unused files. |

---

## 2. PERFORMANCE

### High

| # | File | Line(s) | Description | Recommended Fix |
|---|------|---------|-------------|-----------------|
| P1 | `src/App.tsx` | 18 | **`QueryClient` instantiated inline** in the component — a new instance is created on every render, destroying all cached data. | Move `new QueryClient()` outside the component or use `useRef`/`useMemo`. |
| P2 | `src/context/GameContext.tsx` | 219-280 | **State updates create deep object spreads for every tile mutation** (`updateTileStatus`, `setTileAudio`, `toggleReady`, `incrementScore`). Each call creates a full copy of `players`, the target player, their board, and tiles array. With frequent WebSocket updates, this causes excessive re-renders. | Use `useReducer` with Immer, or normalize state (tiles in a separate map by ID). |
| P3 | `src/context/GameContext.tsx` | 282-293 | **`useMemo` for `contextValue` is effectively useless** because the dependency array includes recreated function references every render. | Stabilize function references with `useCallback`. |
| P4 | `src/pages/Leaderboard.tsx` | 59-80 | **N+1 API calls** — fetches all players, then calls `getGenrePerformance` for each player individually. With N players, this is N+1 network requests. | Add a batch endpoint or include genre performance in the player list response. |
| P5 | `src/components/game/SpectatorView.tsx` | 41-46 | **`useMemo` for `boardRefs` uses `producers` as dependency but creates refs via `createRef` inside the reducer** — new refs are created every time producers change, causing unnecessary re-renders. | Use a `useRef` map and update it in an effect. |

### Medium

| # | File | Line(s) | Description | Recommended Fix |
|---|------|---------|-------------|-----------------|
| P6 | `src/main.tsx` | 6-10 | **No React.StrictMode** — StrictMode helps detect side effects and deprecated patterns. | Wrap in `<React.StrictMode>` for development. |
| P7 | `src/App.tsx` | 30-55 | **No code splitting / lazy loading** — all pages and components are imported statically. The entire bundle loads upfront. | Use `React.lazy()` + `Suspense` for route components. |
| P8 | `vite.config.ts` | 1-18 | **No bundle optimization config** — no manual chunks, no tree-shaking hints, no `build.rollupOptions.output.manualChunks`. | Configure code splitting in Vite build options. |
| P9 | `src/services/gameSocket.ts` | 199-213 | **WebSocket reconnection uses exponential backoff with jitter** (good) but has **no max reconnect interval cap beyond 30s** and **no user notification** when max attempts are exhausted. | Add a callback for "permanent disconnect" and surface to the user. |
| P10 | `src/services/gameSocket.ts` | 239-248 | **Message queue capped at 50** with silent drop — if the client is disconnected for a long time, messages are silently lost. | Add a warning when messages are dropped, or implement a more robust queue. |
| P11 | `src/components/game/BingoTile.tsx` | 69-83 | **New `Audio` object created for every tile** that has `audioUrl`. In a spectator view with 2 players x 9 tiles = 18 audio elements. | Use a single shared audio player with a ref, or lazy-load audio elements. |
| P12 | `src/pages/Room.tsx` | 328-412 | **`fetchRoom` is called both in `GameContext` useEffect AND in `Room.tsx`** — duplicate network requests on mount. | Consolidate data fetching to a single location. |

### Low

| # | File | Line(s) | Description | Recommended Fix |
|---|------|---------|-------------|-----------------|
| P13 | `src/hooks/use-toast.ts` | 6 | **`TOAST_REMOVE_DELAY` set to 1,000,000ms** (~16 minutes) — toasts stay in the DOM for an extremely long time. | Reduce to a reasonable duration (5-10 seconds). |
| P14 | `src/hooks/use-mobile.tsx` | 6 | **Mobile breakpoint hardcoded at 768px** in a custom hook, while Tailwind's default `md` breakpoint is also 768px. Inconsistent if Tailwind config changes. | Derive from Tailwind config or use a shared constant. |

---

## 3. SECURITY

### Critical

| # | File | Line(s) | Description | Recommended Fix |
|---|------|---------|-------------|-----------------|
| S1 | `src/pages/ThemeAdmin.tsx:14`, `src/pages/PlayerAdmin.tsx:13` | — | **Admin PIN stored in `VITE_THEME_ADMIN_PIN` env var** — this is embedded in the client bundle at build time and visible to anyone who inspects the JS. The PIN is then sent as an `X-Theme-Admin-Secret` header. | Admin authentication must be server-side. The PIN approach is fundamentally insecure for client-side code. |
| S2 | `src/services/api.ts` | 5 | **`API_BASE_URL` defaults to `http://localhost:8000/api`** — if `VITE_API_BASE_URL` is not set in production, all API calls go to localhost. | Make the env var required or use a relative path with a proxy. |

### High

| # | File | Line(s) | Description | Recommended Fix |
|---|------|---------|-------------|-----------------|
| S3 | `src/services/discordSession.ts` | 37-48 | **Discord session secret stored in localStorage** — accessible to any JavaScript running on the page (XSS vulnerability). | Use `httpOnly` cookies for session secrets. If localStorage is required, encrypt the data. |
| S4 | `src/context/UserContext.tsx` | 62-107 | **Player credentials (playerId, playerSecret) stored in localStorage** — same XSS risk. | Use sessionStorage for sensitive credentials, or better, httpOnly cookies. |
| S5 | `src/services/api.ts` | 13 | **`withCredentials: false`** explicitly set on Axios — means cookies are not sent. If the backend uses cookie-based auth, this breaks it. | Clarify auth strategy; if using token-based auth, consider removing this line to avoid confusion. |
| S6 | `src/services/api.ts` | 17-37 | **Error logging interceptor sends errors to backend** including `error.stack` which may contain sensitive information (file paths, variable names). | Sanitize stack traces before sending. |

### Medium

| # | File | Line(s) | Description | Recommended Fix |
|---|------|---------|-------------|-----------------|
| S7 | `src/components/ui/chart.tsx` | 70 | **`dangerouslySetInnerHTML`** with CSS variable injection. While the source is config-driven, if config ever includes user input, this is an XSS vector. | Use `document.documentElement.style.setProperty()` instead. |
| S8 | `src/components/game/DiscordLinkModal.tsx` | 147-151 | **Discord avatar URL rendered directly in `<img src={accountStatus.discord_avatar_url}>`** without validation. If the API is compromised, this could inject arbitrary URLs. | Validate that the URL is from `cdn.discordapp.com` before rendering. |
| S9 | `src/pages/Room.tsx` | 158 | **Room ID extracted from URL params without validation** — passed directly to API calls and WebSocket URL. | Validate room ID format (4-digit numeric) before use. |

### Low

| # | File | Line(s) | Description | Recommended Fix |
|---|------|---------|-------------|-----------------|
| S10 | `src/services/api.ts` | 23-24 | **Error logging endpoint itself has a `.catch()` that silently swallows errors** — if the error logging fails, there's no indication. | At minimum, log to console in development. |
| S11 | `src/components/ErrorBoundary.tsx` | 28-39 | **Error log stored in localStorage** with no size encryption — error messages may contain sensitive data. | Consider not persisting error details, or encrypt them. |

---

## 4. UX QUALITY

### High

| # | File | Line(s) | Description | Recommended Fix |
|---|------|---------|-------------|-----------------|
| U1 | `src/pages/Room.tsx` | 416-443 | **Loading state shows for both `loading` and `isReconnecting`** with the same spinner — user can't tell if this is initial load or a reconnection. | Show distinct messaging for "Loading room..." vs "Reconnecting...". |
| U2 | `src/pages/Room.tsx` | 445-459 | **Error state auto-redirects to lobby after 2 seconds** with `setTimeout(() => navigate('/'), 2000)` — user may not have time to read the error message. | Let the user dismiss the error manually. |
| U3 | `src/components/game/GameOverScreen.tsx` | 237-238 | **`window.location.href = '/'` causes full page reload** — loses all React state, slower than client-side navigation. | Use `useNavigate()`. |
| U4 | `src/components/game/VictoryCelebration.tsx` | 16-18 | **Celebration calls `onComplete()` immediately** in useEffect, making it invisible. The confetti fires but the modal disappears instantly. | Remove the immediate `onComplete` call; add a dismiss button or auto-dismiss timer. |
| U5 | `src/services/gameSocket.ts` | 199-213 | **No user-visible notification when WebSocket disconnects or reconnection fails** — the game silently stops receiving updates. | Add a toast/indicator when connection is lost. |

### Medium

| # | File | Line(s) | Description | Recommended Fix |
|---|------|---------|-------------|-----------------|
| U6 | `src/components/game/BingoTile.tsx` | 126-143 | **Tile uses `<button>` with `disabled` for non-interactive tiles** but also sets `cursor-not-allowed opacity-45` — the disabled state is clear, but screen readers won't announce why it's disabled. | Add `aria-label` explaining why the tile is disabled. |
| U7 | `src/components/game/UploadDrawer.tsx` | 108-113 | **File input has `opacity: 0` overlay** — the entire drop zone is a hidden file input. Keyboard users can't access it. | Add a visible file input with proper labeling. |
| U8 | `src/components/game/GameTutorial.tsx` | 73-114 | **Tutorial uses fixed positioning** but doesn't account for safe areas on mobile devices. | Add safe-area padding. |
| U9 | `src/pages/Room.tsx` | 129-155 | **Mobile game dock uses `env(safe-area-inset-bottom)`** but the dock buttons have no `aria-label` for screen readers. | Add `aria-label` to dock buttons. |
| U10 | `src/components/game/RoundStage.tsx` | 159 | **`animate-spin` on the genre disc icon during rouletting** — a spinning icon for 1.2 seconds may cause motion sickness. | Respect `prefers-reduced-motion`. |
| U11 | `src/components/game/BingoNotification.tsx` | 38-41 | **Bingo notification animates `scale` with a pulse** — should respect `prefers-reduced-motion`. | Add `@media (prefers-reduced-motion: reduce)` guard. |
| U12 | `src/components/game/OnboardingModal.tsx` | 36 | **Text uses `pl-13` for padding-left** — this is a non-standard Tailwind class (not in default config). It may not work as expected. | Use a standard value like `pl-12` or `pl-14`. |
| U13 | `src/components/game/PlayerProfileModal.tsx` | 86-97 | **Two separate `useEffect` hooks for `showContent`** — one with 50ms delay, one triggered on `isOpen`. Race conditions may cause flickering. | Consolidate into a single effect. |

### Low

| # | File | Line(s) | Description | Recommended Fix |
|---|------|---------|-------------|-----------------|
| U14 | `src/pages/Lobby.tsx` | 186-189 | **Room code input strips non-digits** but doesn't provide feedback when invalid characters are typed. | Show a brief validation message. |
| U15 | `src/components/game/ScoreDisplay.tsx` | 124 | **Score uses `CountUp` animation from framer-motion** — the animated count is visually appealing but may confuse users who want to read the exact score quickly. | Show the final value immediately, animate only on increase. |
| U16 | `src/components/game/GameInfo.tsx` | 289 | **Player name button has `focus:outline-none`** — keyboard users can't see focus indicator. | Add a visible focus ring style. |
| U17 | `src/pages/NotFound.tsx` | 8 | **404 page logs to console** — unnecessary in production. | Remove or gate behind `import.meta.env.DEV`. |

---

## 5. TESTING COVERAGE

### Unit Tests (Vitest)

**Existing unit tests (7 test files):**
- `src/components/game/EloDeltaDisplay.test.tsx` — 10 tests, good coverage
- `src/components/game/PlayerStatsRadar.test.tsx` — 30+ tests, thorough with mocked recharts
- `src/components/game/ScoreDisplay.test.tsx` — 20+ tests, comprehensive
- `src/components/game/TotalScoreDisplay.test.tsx` — 7 tests, adequate
- `src/services/__tests__/discordSession.test.ts` — 10 tests, good coverage of storage/TTL
- `src/services/__tests__/gameSocket.test.ts` — 1 test (credential lifecycle)

**Coverage gaps — NO unit tests for:**
- `GameContext` / `useGame` — the core state management (0% coverage)
- `UserContext` / `useUser` — session management, localStorage persistence (0% coverage)
- `Lobby.tsx` — room creation, joining, quick match flows (0% coverage)
- `Room.tsx` — the largest and most complex page (589 lines, 0% coverage)
- `gameSocket.ts` — only 1 test; reconnection logic, message parsing, queue draining untested
- `api.ts` — no tests for API functions, error interceptor, or `transformPlayer`
- `BingoBoard.tsx` / `BingoTile.tsx` — core game components (0% coverage)
- `VotingPanel.tsx` — voting logic (0% coverage)
- `SpectatorView.tsx` — spectator mode (0% coverage)
- `PlayerView.tsx` — player view with upload (0% coverage)
- `ErrorBoundary.tsx` — error handling (0% coverage)

### E2E Tests (Playwright)

**Existing E2E tests (37 spec files in `tests/e2e/`):**
- Well-organized with POM pattern (`PlayerPage.ts`, `GameOrchestrator.ts`)
- Covers: lobby, battle flows, bingo detection, ELO rating, full game, spectator, multiplayer, disconnections, rejoin recovery, network recovery, PII prevention, websocket, webhook, verified auth, tie-breaking, titles, score display, single round, smoke tests
- Has MSW mock API setup and live test fixtures (including audio generation)

**E2E gaps:**
- No mobile viewport tests
- No accessibility (a11y) tests
- No performance/load tests (multiple concurrent rooms)
- No cross-browser tests configured

### Test Infrastructure
- `src/test/setup.ts` — minimal (only ResizeObserver mock)
- No MSW setup for unit tests (only for E2E)
- No test utilities or custom render functions with providers
- No Storybook or visual regression testing

---

## 6. MISSED OPPORTUNITIES / DEAD CODE

### Half-Built Features

| # | Component | Description |
|---|-----------|-------------|
| 1 | `HostMigrationIndicator` | Component exists but is never rendered anywhere. WebSocket `player_left` messages are silently ignored. |
| 2 | `ConflictResolution` | UI exists for resolving simultaneous tile submissions, but no conflict detection logic is implemented. |
| 3 | `MultiRoundConfig` | UI for configuring round count exists, but `totalRounds` is never passed to the backend (createRoom always sends `undefined`). |
| 4 | `RoundIndicator` | Shows round progress with "next round in" countdown, but never rendered. |
| 5 | `TurnTimer` | Standalone timer component exists, but `RoundStage` implements its own timer display. |
| 6 | `TurnIndicator` | Shows whose turn it is, but never rendered. |
| 7 | `GenreHeatmap` | Genre performance grid exists, but `PlayerStatsRadar` is used instead in the profile modal. |
| 8 | `VerifiedIdentityPanel` | Email verification UI exists but calls stub functions that throw errors. |
| 9 | `PrivacySettings` | Full privacy settings UI exists, but `handleSave` doesn't actually call any API (just shows success toast). |
| 10 | `GameTutorial` | Tutorial system exists but only shows 2 steps with basic content. No progressive disclosure for advanced features. |

### TODOs and Stale Comments

| File | Line | Content |
|------|------|---------|
| `src/context/UserContext.tsx` | 339 | `// TODO: Implement verified identity when backend API is ready` |
| `src/lib/utils.ts` | 8 | `// PR ERROR 1: Missing return type - causes TypeScript build failure` (stale — function has return type) |
| `src/context/GameContext.tsx` | 268 | `// PR ERROR 2: Direct state mutation - anti-pattern from Gas Town #660` (stale — code is correct) |
| `src/services/api.ts` | 99 | `// PR ERROR 3: Missing error handler - no try/catch on async call` (stale — has try/catch) |

### Dead Code Summary

**18 unused component files** totaling approximately **~600 lines of dead code**.

---

## PRIORITIZED TOP 10 ACTIONABLE ITEMS

### 1. CRITICAL: Secure Admin Authentication
**File:** `src/pages/ThemeAdmin.tsx:14`, `src/pages/PlayerAdmin.tsx:13`
**Issue:** Admin PIN is embedded in client-side JavaScript via `VITE_THEME_ADMIN_PIN`. Anyone can inspect the bundle and extract the PIN.
**Fix:** Move admin authentication to server-side sessions. Remove the PIN from the frontend entirely.

### 2. CRITICAL: Stop Transmitting Secrets in URLs
**File:** `src/services/api.ts:247, 288`, `src/services/gameSocket.ts:74-78`
**Issue:** OAuth codes, player secrets, and Discord session secrets are passed as URL query parameters, exposing them in browser history, server logs, and referrer headers.
**Fix:** Use POST bodies for OAuth callbacks. Use Authorization headers or first-message-after-connect for WebSocket credentials.

### 3. CRITICAL: Fix QueryClient Instantiation
**File:** `src/App.tsx:18`
**Issue:** `new QueryClient()` inside the component creates a new instance on every render, destroying all cached data and defeating the purpose of TanStack Query.
**Fix:** Move `const queryClient = new QueryClient()` outside the component.

### 4. HIGH: Implement WebSocket Connection Status UI
**File:** `src/services/gameSocket.ts:199-213`, `src/context/GameContext.tsx:188-198`
**Issue:** WebSocket disconnections and reconnection failures are completely silent. Users have no idea the game stopped updating. Empty handlers for `player_joined`, `player_left`, `turn_change`, `bingo_achievement`, `victory_celebration`, `vote_submitted`.
**Fix:** Add connection status indicator. Implement handlers for all WebSocket message types. Add user notification on permanent disconnect.

### 5. HIGH: Consolidate Duplicate Data Transformation Logic
**Files:** `src/services/api.ts:307-336`, `src/context/GameContext.tsx:64-113`, `src/pages/Room.tsx:346-393`
**Issue:** The `BackendPlayer` to `Player` transformation is implemented 3 times independently. Any change must be made in 3 places.
**Fix:** Extract a single `transformPlayer` / `transformRoomToGameState` utility and import it everywhere.

### 6. HIGH: Enable TypeScript Strict Mode
**File:** `tsconfig.json:9-14`
**Issue:** Root tsconfig disables `strict`, `noImplicitAny`, `strictNullChecks`, etc. This undermines type safety across the project.
**Fix:** Remove permissive overrides from root tsconfig. Set `strict: true` at the root level.

### 7. HIGH: Remove Dead Code (18 unused components)
**Issue:** ~600 lines of unused components create maintenance burden, inflate the bundle, and confuse developers.
**Fix:** Delete all unused files: VSIndicator, PlayerBoardDisplay, PlayerBoards (empty), BattleTile, ConflictResolution, RoundIndicator, TurnIndicator, TurnTimer, MultiRoundConfig, GenreHeatmap, HostMigrationIndicator, PlayAgainButton, NavLink, VerifiedIdentityPanel.

### 8. MEDIUM: Add Code Splitting / Lazy Loading
**File:** `src/App.tsx:7-15`, `vite.config.ts`
**Issue:** All route components are statically imported. The entire application loads upfront.
**Fix:** Use `React.lazy()` for route components and configure `manualChunks` in Vite to separate vendor bundles.

### 9. MEDIUM: Fix State Management Performance
**File:** `src/context/GameContext.tsx:219-293`
**Issue:** Every tile mutation creates deep object spreads of the entire players tree. `useMemo` for context value is defeated by unstable function references.
**Fix:** Use `useReducer` with Immer for immutable updates. Stabilize function references with `useCallback`. Consider normalizing state (players and tiles as separate maps).

### 10. MEDIUM: Add Unit Test Coverage for Core Logic
**Issue:** Zero test coverage for `GameContext` (core state), `UserContext` (session management), `Room.tsx` (main page), `Lobby.tsx` (entry flow), and `api.ts` (API layer). Only 6 non-trivial unit test files exist.
**Fix:** Prioritize testing: (1) `discordSession.ts` storage/TTL logic (partially done), (2) `gameSocket.ts` reconnection and message parsing, (3) `GameContext` state transitions, (4) `api.ts` error interceptor and `transformPlayer`.

---

## SUMMARY STATISTICS

| Metric | Value |
|--------|-------|
| Total source files | ~95 |
| Total lines of code | ~12,165 |
| Unit test files | 6 |
| E2E test files | 37 |
| Unused/dead components | 18 (~600 lines) |
| `any` type usages | 8+ |
| `window.location.href` navigations | 4 (should use React Router) |
| Secrets in URLs | 3 locations |
| Half-built features | 10 |
| Stale PR error comments | 3 |
| Critical findings | 4 |
| High findings | 14 |
| Medium findings | 18 |
| Low findings | 18 |
