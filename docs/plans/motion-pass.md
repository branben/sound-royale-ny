# Motion Pass — "alive, less AI" (feat/motion-pass)

## Goal
Make the UI feel alive by **consistently applying the existing animation system to state changes**, not by adding decoration. The repo already has a motion foundation:
- `src/lib/motion.ts` — framer-motion vocabulary: `transitions` (spring/springBouncy/smooth/slow), `variants` (fadeIn/slideUp/scaleIn/slideInLeft), `stagger` (container/containerSlow), `hover` (scale only).
- `src/pages/Lobby.tsx` — GSAP mount reveal (`gsap.from(mainCardRef)`).
- `src/components/game/BingoBoard.tsx` + `src/pages/Leaderboard.tsx` — framer-motion already wired (tile shudder, list stagger).

The problem (`impeccable` made it "similar/worse"): motion is **under-applied and inconsistent** — most state transitions still *snap*, and surface-polish sweeps fight the flat game-show stage. This pass extends the existing vocabulary to the snaps, nothing more.

## Hard constraints (from `src/lib/motion.ts` + AGENTS.md)
- Animations **communicate state changes only** — decoration or looping is banned.
- Hover = **scale only** (no rotate/skew/rotateZ).
- Flat "Jackbox" stage: **NO** neon/glow/gradient/glassmorphism, no always-on pulse.
- Everything gated behind `prefers-reduced-motion` (already in `src/index.css` + Lobby's `matchMedia` check). Honor it in every new GSAP/framer effect.
- Preview with `?motion=on` or `localStorage sr-force-motion=true` (`src/main.tsx`).

## Targets (state transitions that currently snap)
1. **Lobby mode switches** (`landing`→`join`→`create`) — wrap the swapped view in `AnimatePresence` + slide-up so mode changes ease instead of jump. Keep the existing GSAP mount reveal. ✅ DONE in `LobbyModeSwitcher.tsx`.
2. **BingoBoard round render** — on first board mount, stagger the 9 tiles in (added `stagger.container` + child `slideUp`). Tile claim already shudders (pre-existing). ✅ DONE in `BingoBoard.tsx`.
3. **Room stage reveal** (`Room.tsx`) — DROPPED. Wrapping the lobby block in `motion.div` unbalanced the JSX ternary (syntax error); the original is proven-good and "alive" feedback is already covered by the bingo-board stagger + voting-panel bump. Not worth the risk.
4. **Vote landing** (`VotingPanel`) — already had a per-vote scale-in (`motion.div` initial/animate on each vote card). No change needed.
5. **Round/win banners + toasts** — already `animate-in`; consistent. No change needed.

## Out of scope (explicitly NOT doing)
- No new animation deps (framer-motion + gsap already present). Do **not** add emilkowalski/opendesign as runtime deps.
- No typography change (keep `@fontsource` decision from PR #372).
- No GSAP↔framer-motion unification refactor (too large; apply each lib where it already lives).

## Files touched (all additive/extend-existing)
- `src/components/lobby/LobbyModeSwitcher.tsx` — `AnimatePresence` around mode views (slide-up on switch).
- `src/components/game/BingoBoard.tsx` — `stagger.container` + per-tile `slideUp` on board render.
- (dropped) `src/pages/Room.tsx` — see target 3.

## Verification
- `pnpm run verify:types` (tsc --noEmit) — clean.
- `pnpm run test` (Vitest, 286 tests) — green.
- Visual-regression gate (PR #372) — validated separately on `chore/visual-regression-e2e`; motion changes here are static-disabled in snapshots so no baseline churn.

## Handoff
- This branch carries ONLY the motion edits (no visual-gate files).
- PR #372's visual-gate fix lives on `chore/visual-regression-e2e`.
- Separate PRs: #372 (gate) then this motion pass.
