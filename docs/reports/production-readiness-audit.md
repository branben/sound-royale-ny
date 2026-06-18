# Frontend Production Readiness Audit — SOU-81

**Date:** 2026-06-16
**Auditor:** Software Engineer 1 (Frontend)
**Scope:** `/Users/brandonbennett/sound-royale-ny/src/`
**Status:** Complete

---

## Executive Summary

Sound Royale is a real-time multiplayer music bingo game built with React 18, TypeScript, Vite, and WebSocket-driven state. The codebase has a solid foundation with 29 E2E test files and adequate error recovery logic. However, there are several high-severity gaps in **code splitting, global error handling, and memory leak prevention** that should be addressed before production deployment.

### Severity Legend
- **CRITICAL** — Will cause production incidents (data loss, security breach, total failure)
- **HIGH** — Will degrade user experience at scale (slow loads, crashes, data leaks)
- **MEDIUM** — Should fix before or shortly after launch
- **LOW** — Nice to fix, can be scheduled post-launch
- **INFO** — Observation / recommendation

---

## 1. Build & Bundle

| # | Severity | Issue | File | Current State | Recommended Fix |
|---|----------|-------|------|---------------|-----------------|
| 1.1 | **HIGH** | Zero code splitting — all 90 source files bundled in a single initial chunk | `vite.config.ts` | No `manualChunks`, no `React.lazy()`, no dynamic imports. All 12 page components statically imported in `App.tsx`. | Implement `React.lazy()` + `Suspense` for all routes except the initial `/` lobby route. Add `manualChunks` in Vite config to separate vendor bundles (react, recharts, framer-motion, lucide-react). |
| 1.2 | MEDIUM | No build target specified | `vite.config.ts:7` | Vite defaults to `esnext` — may output syntax unsupported by older Safari/Firefox. | Add `build: { target: 'ES2020' }` to Vite config (matches tsconfig.app.json target). |
| 1.3 | MEDIUM | No bundle analyzer in build pipeline | `package.json` | No `rollup-plugin-visualizer` or similar. Bundle size is unknown. | Add bundle size monitoring to catch regressions before deploy. |
| 1.4 | LOW | `lovable-tagger` in production build path | `vite.config.ts:12` | The `componentTagger` plugin is filtered to dev-only via `.filter(Boolean)`, but still imported in all environments. | Confirm tree-shaking eliminates it; otherwise make the import conditional. |
| 1.5 | LOW | No sourcemap configuration | `vite.config.ts` | Defaults to Vite's default (inline in dev, none in prod). | Set `build.sourcemap: 'hidden'` for production to enable error tracking without exposing source. |

---

## 2. Error Handling

| # | Severity | Issue | File | Current State | Recommended Fix |
|---|----------|-------|------|---------------|-----------------|
| 2.1 | **HIGH** | No global `unhandledrejection` handler | `App.tsx` | Promise rejections that aren't caught locally will be silently lost. | Add `window.addEventListener('unhandledrejection', ...)` in `main.tsx` to log/capture unhandled promise rejections. |
| 2.2 | **HIGH** | No global `window.onerror` handler | `App.tsx` | Synchronous errors outside React render cycle (event handlers, setTimeout callbacks, WebSocket message parsing errors) go undetected. | Add `window.onerror` handler or `window.addEventListener('error', ...)` in `main.tsx`. |
| 2.3 | MEDIUM | ErrorBoundary only catches render errors | `ErrorBoundary.tsx:56-62` | `componentDidCatch` only catches errors during React render/commit phase. API failures, async effect errors, and event handler errors are not captured. | Supplement with global handlers (2.1, 2.2). Consider error reporting to external service (Sentry, etc.). |
| 2.4 | MEDIUM | No error reporting to external service | `ErrorBoundary.tsx:60-62` | Errors are logged to localStorage (max 50 entries) and shown as toast. This is invisible to the team in production. | Integrate an error monitoring service or at minimum POST errors to a logging endpoint. |
| 2.5 | LOW | WebSocket error recovery is silent | `gameSocket.ts:179-187` | `onerror` handler logs to console and calls `onError` callback, but the `onError` callback in `GameContext.tsx:211` only does `console.error`. No user-facing error for persistent connection failures. | After max reconnect attempts, surface a user-facing banner/modal indicating connection loss with a manual reconnect option. |
| 2.6 | LOW | `JSON.parse` without try/catch in WebSocket handler | `gameSocket.ts:35` | `parseGameSocketMessage` calls `JSON.parse(data)` without try/catch. Malformed messages will crash the handler. | Wrap `JSON.parse` in try/catch, log the raw data on failure, and return `null`. |

---

## 3. State Management

| # | Severity | Issue | File | Current State | Recommended Fix |
|---|----------|-------|------|---------------|-----------------|
| 3.1 | **HIGH** | Single GameContext re-renders all consumers on any state change | `GameContext.tsx:282-294` | The `contextValue` useMemo depends on all state fields. Any change (e.g., timer tick) triggers re-render of every component that calls `useGame()`. | Split into separate contexts (e.g., `GamePlayersContext`, `GameStatusContext`, `GameTimerContext`) or use a state management library that supports selectors (Zustand, Valtio, or Redux Toolkit). |
| 3.2 | MEDIUM | No state persistence/refresh recovery | `GameContext.tsx` | If the page refreshes, all game state is lost and must be re-fetched. The `isMounted` ref (line 41) protects against updates after unmount but there's no state hydration. | Consider persisting critical state to sessionStorage and reconciling on mount, or accept current behavior with a loading state. |
| 3.3 | MEDIUM | `mockGameState` imported in production bundle | `GameContext.tsx:4` | `mockGameState` is only used when `VITE_E2E_TESTING === 'true'`, but the import is unconditional. This adds to bundle size. | Use dynamic import or environment-conditional import to exclude mock data from production builds. |
| 3.4 | LOW | `useUserSession` hook duplicates `useUser` | `UserContext.tsx:380-383` | `useUserSession` just destructures `userSession` from `useUser`. It's a thin alias. | Evaluate if this abstraction adds value; if not, remove it to reduce hook count. |

---

## 4. Performance

| # | Severity | Issue | File | Current State | Recommended Fix |
|---|----------|-------|------|---------------|-----------------|
| 4.1 | MEDIUM | Only 3 components use `React.memo` | `BingoTile.tsx:52`, `PlayerView.tsx:21`, `BingoBoard.tsx:29` | 3 out of ~40+ components are memoized. `SpectatorView` renders multiple `PlayerView` components but isn't memoized itself. | Add `React.memo` to `SpectatorView`, `RoomBrowser`, `Leaderboard`, and other frequently re-rendered list containers. |
| 4.2 | MEDIUM | `useCallback` only used in 2 locations | `Room.tsx:296,328`, `GameContext.tsx` | Most event handlers and callbacks are recreated on every render. | Memoize callbacks that are passed as props to child components, especially in `Room.tsx` and lobby components. |
| 4.3 | LOW | No virtualization for large lists | `SpectatorView.tsx`, `RoomBrowser.tsx`, `Leaderboard.tsx` | All items are rendered even if off-screen. For games with many spectators or rooms, this causes DOM bloat. | Add `react-window` or `react-virtuoso` for lists that could exceed ~50 items. |
| 4.4 | LOW | `contextValue` useMemo has too many dependencies | `GameContext.tsx:282-294` | The dependency array includes all state fields, defeating the purpose of memoization since any state change triggers recalculation. | Split context (see 3.1) or use a custom comparison function. |

---

## 5. Accessibility

| # | Severity | Issue | File | Current State | Recommended Fix |
|---|----------|-------|------|---------------|-----------------|
| 5.1 | MEDIUM | No `<nav>` landmark for navigation | All pages | Navigation uses `<NavLink>` component but is not wrapped in a `<nav>` element with `aria-label`. | Wrap navigation in `<nav aria-label="Main navigation">`. |
| 5.2 | MEDIUM | No ARIA live regions for dynamic game state | `GameContext.tsx`, game components | Timer ticks, vote counts, player join/leave events, and score updates are never announced to screen readers. | Add `aria-live="polite"` regions for timer, score changes, and game status. Add `aria-live="assertive"` for turn changes. |
| 5.3 | MEDIUM | Only 2 `onKeyDown` handlers in codebase | `ThemeAdmin.tsx:157`, `PlayerAdmin.tsx:136` | Most interactive elements (bingo tiles, voting buttons, dialog triggers) have no keyboard handlers beyond native `<button>` behavior. | Ensure all custom interactive elements (divs with onClick) have keyboard support. Add keyboard shortcuts for common actions. |
| 5.4 | MEDIUM | Incomplete ARIA grid pattern in GenreHeatmap | `GenreHeatmap.tsx:56-57` | Uses `role="gridcell"` but no parent with `role="grid"` or `role="row"`. Screen readers won't interpret this correctly. | Add proper ARIA grid structure or use `role="table"` with appropriate row/cell semantics. |
| 5.5 | LOW | No skip-to-content link | `index.html`, all pages | Keyboard users must tab through the entire navigation to reach content. | Add a visually-hidden skip link at the top of the page. |
| 5.6 | LOW | No `<footer>` landmark | All pages | No footer with secondary links, copyright, or help information. | Add a `<footer>` with relevant links. |
| 5.7 | LOW | No `aria-label` on main game controls | Game components | Buttons for ready, vote, start game may lack descriptive labels. | Audit all interactive buttons for meaningful accessible names. |

---

## 6. PWA / Offline

| # | Severity | Issue | File | Current State | Recommended Fix |
|---|----------|-------|------|---------------|-----------------|
| 6.1 | LOW | No PWA infrastructure | N/A | No service worker, no manifest, no offline support. The public dir only has favicon.ico, placeholder.svg, and robots.txt. | Acceptable for a WebSocket-based real-time game. If mobile installability is desired, add a manifest and basic service worker. |
| 6.2 | INFO | No offline handling | GameContext | If the network drops, the WebSocket reconnects automatically, but there's no user-facing offline indicator. | Add a banner that appears when `navigator.onLine === false` or after the first failed reconnect. |

---

## 7. Environment Config

| # | Severity | Issue | File | Current State | Recommended Fix |
|---|----------|-------|------|---------------|-----------------|
| 7.1 | MEDIUM | No `.env.example` file | Project root | No `.env.example` exists. New developers or deploy scripts have no reference for required variables. | Create `.env.example` documenting: `VITE_API_BASE_URL`, `VITE_WS_URL`, `VITE_THEME_ADMIN_PIN`, `VITE_E2E_TESTING`. |
| 7.2 | MEDIUM | `VITE_THEME_ADMIN_PIN` has no fallback | `PlayerAdmin.tsx:13`, `ThemeAdmin.tsx:14` | If unset, the PIN check compares `undefined` against localStorage values, which could result in a trivially bypassable client-side gate. Admin operations are validated server-side, but the client gate is cosmetic. | Add a default fallback or enforce the PIN requirement more clearly in the UI. Document that client-side PIN is UX-only, not security. |
| 7.3 | LOW | 4 env vars across 5 files | `api.ts:5`, `gameSocket.ts:67-68`, `GameContext.tsx:33`, `Index.tsx:7`, `Producer.tsx:101` | Env vars are scattered and some have fallbacks while others don't. | Centralize env var access in a single `src/config.ts` module for type safety and consistent fallbacks. |

---

## 8. SEO / Meta

| # | Severity | Issue | File | Current State | Recommended Fix |
|---|----------|-------|------|---------------|-----------------|
| 8.1 | MEDIUM | No `og:image` meta tag | `index.html:10-13` | Social media previews (Twitter/Facebook) will render without an image. | Add `og:image` pointing to a production image URL. Add `og:image:width` and `og:image:height`. |
| 8.2 | LOW | No per-page titles | `index.html:6` | Every page shares the same `<title>`. `react-helmet-async` is not installed. | Install `react-helmet-async` and set per-route titles (e.g., "Room ABC123 — Sound Royale"). |
| 8.3 | LOW | SEO is inherently limited for this app type | N/A | Content is entirely client-side rendered with WebSocket-driven state. Search engines will see an empty shell. | This is acceptable and expected for a real-time game. No SSR needed. |

---

## 9. Browser Compatibility

| # | Severity | Issue | File | Current State | Recommended Fix |
|---|----------|-------|------|---------------|-----------------|
| 9.1 | LOW | No browserslist config | None | No `.browserslistrc` or `browserslist` in package.json. Vite defaults to modern targets. | Add a browserslist config if targeting specific browser versions. Currently acceptable for the game's audience. |
| 9.2 | LOW | `ResizeObserver` mocked in tests only | `src/test/setup.ts:5` | `ResizeObserver` has 97%+ global browser support. The mock in test setup is appropriate. | No action needed. Just ensure production code doesn't assume `ResizeObserver` exists if targeting very old Safari. |
| 9.3 | INFO | ES2020 target confirmed | `tsconfig.app.json:3` | Targets ES2020. All used APIs (optional chaining, nullish coalescing, Promise, WebSocket) are safe for ES2020. | No action needed. |

---

## 10. Testing Coverage

| # | Severity | Issue | File | Current State | Recommended Fix |
|---|----------|-------|------|---------------|-----------------|
| 10.1 | **HIGH** | Zero unit tests for any page component | All `src/pages/` | 90 source files, only 7 unit test files. No tests for `Lobby.tsx`, `Room.tsx`, `Producer.tsx`, `Index.tsx`, `Leaderboard.tsx`, or admin pages. | Add unit tests for: `Lobby.tsx` (room creation, player name input), `Room.tsx` (game state integration, reconnection logic), and `Index.tsx` (spectator redirect). |
| 10.2 | **HIGH** | No tests for `GameContext` | `src/context/GameContext.tsx` | The core game state management has zero unit tests. WebSocket integration, message handling, and state transforms are untested. | Add unit tests for: initial state, WebSocket message handlers, `updateTileStatus`, `toggleReady`, `incrementScore`, error handling, and reconnection logic. |
| 10.3 | MEDIUM | No tests for `ErrorBoundary` | `src/components/ErrorBoundary.tsx` | Error boundary behavior (state derivation, retry, error logging) is untested. | Add tests for error capture, retry functionality, and localStorage error log. |
| 10.4 | MEDIUM | `helpers.ts` E2E file is 14,306 lines | `tests/e2e/helpers.ts` | This single test utility file is larger than the entire `src/` directory. It's a maintenance risk. | Decompose into focused helper modules (e.g., `game-helpers.ts`, `room-helpers.ts`, `player-helpers.ts`, `ws-helpers.ts`). |
| 10.5 | MEDIUM | Playwright only runs on Chromium | `playwright.config.ts` | No cross-browser testing on Firefox or WebKit (Safari). | Add Firefox and WebKit browser projects, especially for WebSocket and audio playback features. |
| 10.6 | LOW | 7 unit test files cover ~2,500 lines | `src/` `__tests__/` dir | Good test-to-source ratio for what's covered, but scope is narrow. The 7 files test: 3 service files, 4 score/UI components. | Expand to cover `BingoTile`, `PlayerView`, `GameSocket`, and `UserContext`. |

### What IS well-tested:
- E2E suite covers 24+ scenarios including multiplayer, spectator, websocket, network recovery, and negative scenarios.
- `api.test.ts` is comprehensive at 1,305 lines.
- `PlayerStatsRadar.test.tsx` at 662 lines is thorough.
- Negative scenario tests for disconnections, host kick, and invalid votes.

### What is NOT tested at all (unit or E2E):
- `Lobby.tsx` — no unit tests for room creation/join flow
- `Room.tsx` — no unit tests for room page rendering or state
- `Producer.tsx` — no unit tests
- `DiscordCallback.tsx` — no unit tests for OAuth callback handling
- `GameContext.tsx` — no unit tests for game state management
- `ErrorBoundary.tsx` — no unit tests
- `BingoTile.tsx` — no unit tests despite being the most interactive component
- `VictoryCelebration.tsx` — no unit tests for confetti/timing logic
- `gameSocket.ts` — only 72 lines of tests for a 263-line service

---

## 11. Memory Leaks & Resource Cleanup

| # | Severity | Issue | File | Current State | Recommended Fix |
|---|----------|-------|------|---------------|-----------------|
| 11.1 | **HIGH** | Audio `ended` event listener not removed | `BingoTile.tsx:72` | `audioRef.current.addEventListener('ended', ...)` is added in a useEffect, but the cleanup function only clears a timeout — it does not remove the event listener. | Add `audioRef.current.removeEventListener('ended', handler)` in the useEffect cleanup. |
| 11.2 | MEDIUM | Nested setTimeout in VictoryCelebration not cancellable | `VictoryCelebration.tsx:29` | Inner `setTimeout` is not stored in a ref, so it cannot be cleared if the component unmounts. | Store the inner timeout ID in a ref and clear it in the cleanup function. |
| 11.3 | MEDIUM | setTimeout in Room.tsx not cleared on unmount | `Room.tsx:404` | `setTimeout(() => navigate('/'), 2000)` fires even if the component has unmounted. | Store the timeout ID and clear it in the useEffect cleanup. |
| 11.4 | LOW | `mockGameState` data in production bundle | `GameContext.tsx:4` | The mock data is imported unconditionally. While tree-shaking may eliminate it, it's not guaranteed. | Use dynamic import or move mock data to a separate file that's only imported in test/E2E mode. |

---

## 12. Security

| # | Severity | Issue | File | Current State | Recommended Fix |
|---|----------|-------|------|---------------|-----------------|
| 12.1 | MEDIUM | OAuth secrets in localStorage | `discordSession.ts:69` | `soundRoyaleDiscordOAuthPlayerSecret` stored in localStorage is accessible to any JavaScript on the page (XSS risk). | If possible, use httpOnly cookies for OAuth tokens. If not, ensure robust XSS prevention (CSP headers, input sanitization). |
| 12.2 | LOW | No CSP headers in nginx config | `nginx.conf` | No Content-Security-Policy, X-Frame-Options, or other security headers. | Add CSP headers in nginx config. At minimum: `Content-Security-Policy: default-src 'self'; connect-src 'self' ws: wss:; script-src 'self'`. |
| 12.3 | LOW | `dangerouslySetInnerHTML` in chart component | `chart.tsx:70` | Used for injecting CSS theme variables from a static object. Low risk but worth noting. | Acceptable as-is since content is from a static object, not user input. |
| 12.4 | INFO | No hardcoded API keys or secrets | All source | All sensitive values use environment variables. | Good. No action needed. |

---

## 13. Infrastructure / Deployment

| # | Severity | Issue | File | Current State | Recommended Fix |
|---|----------|-------|------|---------------|-----------------|
| 13.1 | MEDIUM | No gzip/brotli compression in nginx | `nginx.conf` | Static assets are served uncompressed. | Add `gzip on;` and `brotli on;` directives to nginx config. |
| 13.2 | MEDIUM | No cache headers for static assets | `nginx.conf` | No Cache-Control headers for JS/CSS assets. | Add cache headers: long cache for hashed assets, no-cache for `index.html`. |
| 13.3 | LOW | WebSocket proxy has no timeout | `nginx.conf:17-23` | No `proxy_read_timeout` for WebSocket connections. | Add `proxy_read_timeout 86400s;` for WebSocket location to prevent nginx from closing idle connections. |

---

## Prioritized Action Plan

### Must Fix Before Launch (HIGH severity)
1. **1.1** — Implement code splitting with `React.lazy()` for all routes
2. **2.1** — Add global `unhandledrejection` handler
3. **2.2** — Add global `window.onerror` handler
4. **11.1** — Fix audio event listener memory leak in `BingoTile.tsx`
5. **10.1** — Add unit tests for `Lobby.tsx` and `Room.tsx`
6. **10.2** — Add unit tests for `GameContext.tsx`

### Should Fix Before Launch (MEDIUM severity)
7. **1.2** — Set explicit build target in Vite config
8. **2.4** — Add external error reporting
9. **3.1** — Split GameContext to prevent unnecessary re-renders
10. **5.1-5.4** — Fix accessibility gaps (nav landmark, ARIA live regions, keyboard support)
11. **7.1** — Create `.env.example`
12. **8.1** — Add `og:image` meta tag
13. **11.2-11.3** — Fix setTimeout cleanup issues
14. **13.1-13.3** — Add compression, cache headers, and WebSocket timeout to nginx

### Nice to Fix Post-Launch (LOW severity)
15. **1.3** — Add bundle analyzer
15. **4.1-4.2** — Add more `React.memo` and `useCallback`
16. **5.5-5.7** — Add skip link, footer, and audit button labels
17. **10.4** — Decompose `helpers.ts`
18. **10.5** — Add cross-browser Playwright testing
19. **12.2** — Add CSP headers

---

## Summary Statistics

| Metric | Value |
|--------|-------|
| Total source files (non-test) | 90 |
| Total test files (unit) | 7 |
| Total test files (E2E) | 29 |
| Unit test coverage (files) | ~8% (7/90) |
| E2E test coverage (scenarios) | ~29 scenarios |
| HIGH severity issues | 6 |
| MEDIUM severity issues | 14 |
| LOW severity issues | 10 |
| Pages without any unit tests | 6/8 |
| Components using React.memo | 3/~40+ |
| Components using useCallback | 2 |
| Global error handlers | 0 |
| Code splitting routes | 0/8 |
