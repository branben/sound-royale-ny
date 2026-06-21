---
title: "fix: GSAP animation null target crash in Room component"
type: fix
status: active
created: 2026-06-20
---

# fix: GSAP animation null target crash in Room component

## Problem

When the game transitions from `lobby` to `playing` status, the GSAP animation `useEffect` fires and crashes with:

```
TypeError: can't access property "_gsap", target is null
```

at `gsap.from(bingoBoardRefs.current, ...)` in `src/pages/Room.tsx`.

**Root cause:** The animation effect depends on `[gameState.status, gameState.players]`. When status changes to `'playing'`, the effect runs immediately — but the child components (`PlayerView`, `SpectatorView`) that populate `bingoBoardRefs` via callback refs haven't mounted yet. The ref array contains `null` entries, and GSAP crashes when it tries to access `._gsap` on `null`.

The same class of bug exists for `actionButtonRefs` in the lobby state — the buttons are conditionally rendered, but the effect fires before the DOM is updated.

## Scope

- **In scope:** Fix the null-target crash in the GSAP animation effect in `src/pages/Room.tsx`
- **Out of scope:** Other GSAP usage in `Lobby.tsx` (already properly guarded), animation redesign, adding `useLayoutEffect` everywhere

## Approach

The fix is surgical — filter null entries from ref arrays before passing them to `gsap.from()`, and guard with a length check. This is the minimal change that eliminates the race condition without restructuring the animation system.

Single refs (`roundStageRef`, `gameInfoRef`, `roomCodeRef`, `joinBattleCardRef`) are already guarded with `if (ref.current)` checks and don't need changes.

## Implementation Units

### U1. Guard `bingoBoardRefs` array in GSAP animation effect

**Goal:** Prevent GSAP crash when `bingoBoardRefs` contains null entries

**Files:** `src/pages/Room.tsx`

**Approach:**
- Before calling `gsap.from(bingoBoardRefs.current, ...)`, filter out null entries
- Only call `gsap.from()` if the filtered array has elements
- Same pattern already applied in the previous session's hotfix — verify it's still in place and correct

**Patterns to follow:** The existing null-guard pattern on single refs (e.g., `if (roundStageRef.current) { gsap.from(...) }`)

**Test scenarios:**
- Happy path: Game transitions to `playing` with 2 producers → bingo boards animate in without crash
- Edge case: Game transitions to `playing` but producers haven't mounted yet (fast state change) → no crash, animation skipped
- Edge case: Game transitions to `playing` with 0 producers (spectators only) → no crash, animation skipped

**Verification:** TypeScript compiles, no new lint errors, manual test by navigating to a room and starting a game

### U2. Guard `actionButtonRefs` array in GSAP animation effect

**Goal:** Prevent potential same-class crash for lobby action buttons

**Files:** `src/pages/Room.tsx`

**Approach:**
- Before calling `gsap.from(actionButtonRefs.current, ...)`, filter out null entries
- Only call `gsap.from()` if the filtered array has elements

**Test scenarios:**
- Happy path: Lobby loads with action buttons visible → buttons stagger in
- Edge case: Lobby state rendered before button refs are populated → no crash

**Verification:** TypeScript compiles, no new lint errors

## Verification

1. `npx tsc --noEmit` — clean
2. `npx eslint src/pages/Room.tsx` — no new errors
3. Manual: Start dev server, create room, start game → no console crash
