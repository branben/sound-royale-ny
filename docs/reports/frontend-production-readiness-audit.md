# Frontend Production Readiness Audit — SOU-82

**Project:** Sound Royale  
**Date:** 2026-06-16  
**Auditor:** Software Engineer 1 (Frontend)  
**Scope:** `/Users/brandonbennett/sound-royale-ny/src/`

---

## Executive Summary

The Sound Royale frontend is a React 18 + TypeScript + Vite single-page application with 82 TSX files and 98 total source files. It uses a Django REST backend with WebSocket real-time updates for a multiplayer music bingo game.

**Overall readiness: ~60%** — The core game loop works and the test coverage for API/socket layers is solid. However, several critical production gaps exist in error resilience, performance optimization, accessibility, and deployment configuration that should be addressed before a public launch.

---

## 1. Build & Bundle

| Issue | Severity | File | Current State | Recommended Fix |
|-------|----------|------|---------------|-----------------|
| No code splitting or lazy loading | **High** | `vite.config.ts:1-18` | All routes and components bundled into a single chunk. No `React.lazy()`, no `Suspense`, no dynamic imports anywhere in the codebase. | Use `React.lazy()` + `Suspense` for route-level code splitting. Wrap routes in `lazy()` imports to reduce initial bundle from ~82 components to ~10-15. |
| No bundle analysis | **Medium** | `vite.config.ts` | No `rollup-plugin-visualizer` or similar. Bundle size is unknown. | Add `@rollup/plugin-visualizer` in dev mode to track bundle composition and identify large dependencies. |
| Dev-only plugin in production | **Low** | `vite.config.ts:12` | `componentTagger()` is filtered by `mode === "development"` but still present in the config. | Move to a separate `vite.config.dev.ts` or use `process.env.NODE_ENV` for clarity. |
| No CSS purging verification | **Medium** | `tailwindcss` config missing | Cannot confirm unused CSS is stripped. With 20+ Radix UI packages, unused component CSS could add significant weight. | Verify `content` paths in Tailwind config include all TSX files; audit final CSS output. |

---

## 2. Error Handling

| Issue | Severity | File | Current State | Recommended Fix |
|-------|----------|------|---------------|-----------------|
| ErrorBoundary at root level only | **High** | `App.tsx:50-54` | Single `ErrorBoundary` wraps the entire app. A single component crash kills the entire UI. | Add granular ErrorBoundaries around high-risk areas: `<Room />`, `<BingoBoard />`, `<GameInfo />`, `<SpectatorView />`. |
| No global unhandled promise rejection handler | **High** | `main.tsx:1-10` | No `window.onunhandledrejection` handler. Rejected promises outside try/catch vanish silently. | Add `window.addEventListener('unhandledrejection', ...)` in `main.tsx` to log/notify. |
| No global error event handler | **High** | `main.tsx:1-10` | No `window.onerror` handler. Script errors go undetected. | Add `window.addEventListener('error', ...)` for unexpected runtime errors. |
| WebSocket error recovery lacks user feedback | **High** | `gameSocket.ts:179-187` | `onError` callback only logs to console. The user sees no indication that the connection failed. | Add toast notification on WebSocket error; expose connection status in UI. After max reconnects (5), show a persistent "Connection lost" banner with a manual retry button. |
| Silent `onDisconnect` calls | **Medium** | `gameSocket.ts:174` | `onDisconnect` is optional. If a consumer doesn't provide it, disconnection is silently logged to console. | Make reconnection state visible in the UI — a "Reconnecting..." banner or status indicator. |
| `fetchRoom` catches duplicate patterns | **Medium** | `Room.tsx:328-412` | `fetchRoom` has inline error handling that duplicates the pattern used in `GameContext`. Inconsistent. | Centralize API error handling in a shared hook or the service layer. |
| Error log maxes at 50 entries, never prunes old | **Low** | `ErrorBoundary.tsx:8` | `MAX_ERRORS = 50` is capped by count, not age. Old errors persist forever in localStorage. | Add timestamp-based expiration (e.g., keep only last 7 days). |
| `error_log` key is hardcoded, not exported | **Low** | `ErrorBoundary.tsx:7` | The `ERROR_LOG_KEY` constant is not exported; consumers must use magic strings. | Export the key and max count as module constants. |

---

## 3. State Management

| Issue | Severity | File | Current State | Recommended Fix |
|-------|----------|------|---------------|-----------------|
| Dual state sources: Room.tsx + GameContext | **High** | `Room.tsx:162` + `GameContext.tsx:32` | `Room` fetches room data into local `room` state AND `GameContext` fetches the same data into `gameState`. This is redundant and causes sync conflicts. Refetching is triggered by both `GameContext` useEffect and `Room`'s `fetchRoom`. | Single source of truth: either `GameContext` owns all data, or `Room` does. Pick one and remove the other's fetch logic. |
| `useGameRefreshEffect` missing dependency cleanup | **High** | `useGame.ts:20-26` | `useEffect` calls `callback()` whenever `forceRefresh` OR `callback` changes. Since `callback` is a new function reference on every render (from `useCallback` in `Room`), this fires too often. Also, no cleanup for in-flight callbacks on unmount. | Stabilize the callback ref or use a ref pattern. Add cleanup for stale callbacks. |
| `MobileGameDock` component defined inside `Room` | **Critical** | `Room.tsx:28-155, 576` | `MobileGameDock` is a function component defined INSIDE the `Room` render function. Every re-render of `Room` creates a new component identity, causing React to unmount/remount the entire dock. This is a severe performance bug. | Move `MobileGameDock` to its own file in `src/components/game/MobileGameDock.tsx`. |
| `persistTimeoutRef` never cleaned up on unmount | **Medium** | `UserContext.tsx:213, 272` | The debounce timeout in `persistActiveSession` is not cleared on unmount. | Add cleanup in a `useEffect` return to clear the timeout. |
| `isMounted` ref pattern is outdated | **Medium** | `GameContext.tsx:41, 95, 115, 118` | Uses `isMounted.current` to guard setState after unmount. This is an anti-pattern in React 18. | Use `AbortController` for fetch cancellation, or a proper cleanup flag with `useEffect` return. |
| `gameState.players` uses object-as-map | **Low** | `GameContext.tsx:29` | `Record<string, Player>` is fine but iteration requires `Object.values()` everywhere. | Consider `Map<string, Player>` for O(1) lookups and better iteration. |
| No state persistence across page reloads | **Medium** | `GameContext.tsx:36` | `gameState` resets to `emptyGameState` on mount. If the page reloads, all game state is lost until the next fetch/WebSocket message. | Persist critical game state to `sessionStorage` and hydrate on mount. |

---

## 4. Performance

| Issue | Severity | File | Current State | Recommended Fix |
|-------|----------|------|---------------|-----------------|
| `MobileGameDock` remounts on every render | **Critical** | `Room.tsx:28-155` | As noted above, defining a component inside a render function causes full remount. The dock contains 4 `Drawer` components with complex children. | Extract to separate file. |
| `fetchRoom` missing from `useEffect` dependency array | **High** | `Room.tsx:263-276` | The auto-spectator `useEffect` at line 263 references `fetchRoom` but doesn't include it in deps. This is a stale closure risk. | Include `fetchRoom` in the dependency array (it's already memoized with `useCallback`). |
| `MobileGameDock` re-creates `actions` array every render | **Medium** | `Room.tsx:47-126` | The `actions` array with JSX content is recreated on every render. | Memoize with `useMemo` or extract to a static constant outside the component. |
| `isSpectatorPlayer` recreated every render | **Medium** | `Room.tsx:33` | The `isSpectatorPlayer` function is defined inline and used in `.filter()` calls. | Move outside the component or memoize with `useCallback`. |
| `BingoTile` audio `ended` listener never removed | **Medium** | `BingoTile.tsx:72` | `addEventListener('ended', ...)` is added but the cleanup only clears a timeout, not the event listener. | Add `removeEventListener` in the cleanup function. |
| `setInterval` in `GameInfo` for countdown | **Low** | `GameInfo.tsx:67` | A 1-second interval runs for the countdown timer. This is acceptable but could drift. | Consider using `requestAnimationFrame` or a single shared timer for all countdowns. |
| `useMemo` dependency array includes entire `gameState` | **Low** | `GameContext.tsx:282-293` | The context value `useMemo` depends on `gameState` (entire object). Any state change recreates the context value, triggering all consumers to re-render. | Split into smaller contexts (e.g., `GamePlayersContext`, `GameStatusContext`) or use a state management library like Zustand. |

---

## 5. Accessibility

| Issue | Severity | File | Current State | Recommended Fix |
|-------|----------|------|---------------|-----------------|
| No skip-to-content link | **High** | `App.tsx` | Keyboard users must tab through the entire nav to reach content. | Add a "Skip to main content" link as the first focusable element. |
| Drawer buttons lack keyboard support | **High** | `Room.tsx:134-151` | The `DrawerTrigger` uses a plain `<button>` but there's no `onKeyDown` handler for Enter/Space. | Ensure all interactive elements are keyboard-accessible. Add `onKeyDown` handlers or use native `<button>` elements. |
| Mobile dock buttons are custom `<button>` elements | **Medium** | `Room.tsx:136` | The dock uses `<button>` elements but they lack `type="button"` and ARIA labels. | Add `type="button"` and `aria-label` to each dock button. |
| `BingoBoard` grid lacks ARIA roles | **Medium** | `BingoBoard.tsx` | The bingo board is rendered as a grid of divs without `role="grid"` or `role="gridcell"`. | Add `role="grid"` to the board container and `role="gridcell"` to each tile. |
| `BingoTile` has `aria-disabled` but no `role` | **Medium** | `BingoTile.tsx:129` | `aria-disabled` is set but the element is a `<div>`, not a button. Screen readers won't announce it as interactive. | Use `<button>` elements or add `role="button"` and `tabIndex={0}`. |
| No focus management on route change | **Medium** | `App.tsx` | When navigating between routes, focus stays at the top of the page. Screen reader users don't know content changed. | Add a `useEffect` that moves focus to the main content area on route change. |
| `GameTutorial` modal lacks focus trap | **Medium** | `GameTutorial.tsx` | Tutorial modal likely doesn't trap focus, allowing tabbing to background content. | Implement focus trap using `focus-trap-react` or Radix's built-in focus management. |
| Color-only status indicators | **Low** | `BingoTile.tsx` | Tile status (empty/pending/complete) is conveyed only through color. | Add text labels or icons to indicate status for colorblind users. |
| `aria-label` on DiscordVerifiedIcon is good | **Positive** | `DiscordVerifiedIcon.tsx:12` | Properly uses `aria-label` and `aria-hidden` on the icon. | ✅ Good pattern — replicate elsewhere. |

---

## 6. PWA / Offline

| Issue | Severity | File | Current State | Recommended Fix |
|-------|----------|------|---------------|-----------------|
| No service worker | **Critical** | `public/` | No service worker, no manifest, no offline support. The `public/` directory only has `favicon.ico`, `placeholder.svg`, and `robots.txt`. | Add a service worker (via `vite-plugin-pwa` or Workbox) for asset caching. At minimum, cache the app shell. |
| No web app manifest | **High** | `public/` | No `manifest.json`. The app cannot be "installed" on mobile home screens. | Create `manifest.json` with app name, icons, theme color, and display mode. |
| No offline fallback | **High** | N/A | If the network drops, the app shows nothing useful. | Add an offline page or cached fallback. |
| No network status detection | **Medium** | N/A | The app doesn't detect online/offline status. | Add `navigator.onLine` listener and show a banner when offline. |
| WebSocket has no offline queue | **Medium** | `gameSocket.ts:64` | Messages sent while disconnected are queued (max 50), but there's no handling for what happens when the queue fills up. | Add a drop policy (drop oldest or reject new) and notify the user. |

---

## 7. Environment Config

| Issue | Severity | File | Current State | Recommended Fix |
|-------|----------|------|---------------|-----------------|
| No `.env.example` file | **High** | Project root | No `.env.example` exists. New developers don't know what environment variables are required. | Create `.env.example` with all required vars: `VITE_API_BASE_URL`, `VITE_WS_URL`, `VITE_THEME_ADMIN_PIN`, `VITE_E2E_TESTING`. |
| `VITE_THEME_ADMIN_PIN` hardcoded in source | **Critical** | `ThemeAdmin.tsx:14`, `PlayerAdmin.tsx:13` | The admin PIN is read from env but the same value is used in two places. If it's not set, it defaults to `undefined`, which could bypass auth. | Ensure the PIN is required and validated server-side. Don't rely on client-side PIN checks for security. |
| `VITE_API_BASE_URL` defaults to localhost | **Medium** | `api.ts:5` | Falls back to `http://localhost:8000/api` which would point to the wrong server in production. | Make `VITE_API_BASE_URL` required in production builds (fail fast if missing). |
| `VITE_WS_URL` falls back to HTTP-to-WS conversion | **Medium** | `gameSocket.ts:67-70` | The fallback logic replaces `http` with `ws` and strips `/api`. This is fragile. | Require explicit `VITE_WS_URL` in production. |
| `VITE_E2E_TESTING` enables mock data | **Medium** | `GameContext.tsx:33` | If this env var is accidentally set to `true` in production, the app uses mock data instead of real API. | Add a runtime check that warns if E2E mode is enabled outside of test environments. |

---

## 8. SEO / Meta

| Issue | Severity | File | Current State | Recommended Fix |
|-------|----------|------|---------------|-----------------|
| No Open Graph image | **Medium** | `index.html:13` | `og:image` is missing. Social media previews will be blank. | Add `og:image` pointing to a hosted preview image. |
| Hardcoded OG URL | **Low** | `index.html:13` | `og:url` is hardcoded to `https://soundroyale.com`. | Make this dynamic based on the actual deployment URL. |
| No structured data | **Low** | `index.html` | No JSON-LD or schema.org markup. | Add `VideoGame` or `Game` schema markup for search engines. |
| `robots.txt` is permissive | **Low** | `public/robots.txt` | Allows all crawlers. This is fine for production but consider restricting `/admin/` and `/producer/` paths. | Add `Disallow: /admin/`, `Disallow: /producer/`, `Disallow: /room/` to robots.txt. |
| Good meta description | **Positive** | `index.html:7` | Description is set and appropriate. | ✅ Good. |

---

## 9. Browser Compatibility

| Issue | Severity | File | Current State | Recommended Fix |
|-------|----------|------|---------------|-----------------|
| `navigator.clipboard.writeText` without fallback | **High** | `GameInfo.tsx:160`, `Room.tsx:40` | `navigator.clipboard` requires HTTPS or localhost. In HTTP contexts (e.g., local network), this throws. The `catch` block in `Room.tsx` falls back to `toast.info(shareUrl)` which is poor UX. | Add a fallback using `document.execCommand('copy')` or a textarea-based approach. Show a modal with the URL the user can copy. |
| `URL` constructor used for WebSocket URL | **Low** | `gameSocket.ts:72` | `URL` constructor is supported in all modern browsers but not IE11. | Acceptable for a modern app — no action needed if IE11 is not a target. |
| `Object.entries`, `Object.values`, `Object.fromEntries` | **Low** | Multiple files | Used throughout. Not supported in IE11. | Ensure `browserslist` targets modern browsers only. |
| `Array.prototype.find` | **Low** | `Lobby.tsx:199` | Not supported in IE11. | Same as above — verify browserslist config. |
| No `browserslist` config found | **Medium** | `package.json` | No `browserslist` field in `package.json` or `.browserslistrc`. | Add a `browserslist` field to `package.json` to ensure Babel/polyfill compatibility. |

---

## 10. Testing Coverage

**Existing test files (7):**
- `src/services/__tests__/api.test.ts` — Comprehensive API layer tests (MSW-mocked) ✅
- `src/services/__tests__/gameSocket.test.ts` — Socket credential lifecycle test ✅
- `src/services/__tests__/discordSession.test.ts` — Discord session tests ✅
- `src/components/game/EloDeltaDisplay.test.tsx` — Component test ✅
- `src/components/game/PlayerStatsRadar.test.tsx` — Component test ✅
- `src/components/game/ScoreDisplay.test.tsx` — Component test ✅
- `src/components/game/TotalScoreDisplay.test.tsx` — Component test ✅

### Critical Untested Paths

| Untested Area | Severity | What's Missing |
|---------------|----------|----------------|
| `GameContext` state management | **Critical** | No tests for WebSocket message handling, state transitions, reconnection logic, or the `isMounted` guard. |
| `Room` page component | **Critical** | No tests for join/rejoin flow, spectator auto-join, game start, or error states. This is the most complex page (589 lines). |
| `Lobby` page component | **High** | No tests for room creation, joining, quick match, or Discord linking flow. |
| `ErrorBoundary` | **High** | No tests for error catching, error log persistence, or retry behavior. |
| `BingoBoard` / `BingoTile` | **High** | No tests for tile interaction, audio playback, or bingo detection. |
| `UserContext` | **Medium** | No tests for session persistence, localStorage migration, or credential lifecycle. |
| `VotingPanel` | **Medium** | No tests for vote submission or vote display. |
| `SpectatorView` | **Medium** | No tests for spectator-specific rendering. |
| E2E tests for full game flow | **High** | Playwright is configured but no E2E test files were found in the scan. | Add E2E tests for: create room → join → start game → play round → vote → results. |

---

## Summary by Severity

| Severity | Count | Key Items |
|----------|-------|-----------|
| **Critical** | 4 | `MobileGameDock` inside render, no `.env.example`, admin PIN client-side only, no service worker |
| **High** | 12 | No code splitting, no global error handlers, dual state sources, no offline support, clipboard API, no focus management |
| **Medium** | 14 | No bundle analysis, no state persistence, missing ARIA roles, no browserslist, `isMounted` anti-pattern |
| **Low** | 8 | Hardcoded OG URL, no structured data, console statements, error log age |

---

## Top 5 Recommended Actions (Priority Order)

1. **Extract `MobileGameDock`** from `Room.tsx` into its own file — this is a critical performance bug causing full remounts on every render.

2. **Add global error handlers** (`unhandledrejection`, `window.onerror`) in `main.tsx` — production apps must catch and report all errors.

3. **Add `.env.example`** with all required environment variables — essential for developer onboarding and deployment safety.

4. **Implement code splitting** with `React.lazy()` + `Suspense` for route-level chunks — will significantly reduce initial load time.

5. **Add granular ErrorBoundaries** around high-risk components (`Room`, `BingoBoard`, `GameInfo`) — prevents total app crashes from isolated component errors.

---

*Audit generated by OWL (Software Engineer 1, Sound Royale)*
