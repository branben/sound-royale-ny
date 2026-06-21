
# Taste Audit — Lobby & Room

Scored against your own `design-system/sound-royale/MASTER.md` and `pages/room.md`. Most findings below are **explicit forbidden patterns** already documented in your design system — the code just hasn't caught up. Where MASTER says one thing and the code does the opposite, MASTER wins.

---

## LOBBY — `src/pages/Lobby.tsx`

### Slop / Forbidden
1. **Radial gradient background wash** (`bg-[radial-gradient(...)] from-primary/8`) — line 321. MASTER.md "Anti-Patterns" forbids gradients outright. Also reads "dark tech UI," not Jackbox.
2. **`backdrop-blur-sm` on the main action card** (line 379). Forbidden: "Glassmorphism / backdrop-blur on in-flow elements." Cards must be solid `#18181b`.
3. **`shadow-2xl` on card** (line 379). MASTER caps shadows at `lg` (`0 8px 24px rgba(0,0,0,0.6)`). 2xl is glow-adjacent and not in the scale.
4. **Decorative entrance choreography** (lines 124–161): icon `back.out(1.7)` bounce, title slide-down, tagline slide-down at staggered delays, card slide-up. MASTER forbids "staggered entrance sequences" and "decorative entrance sequences." Allowed: a single 200ms fade.
5. **`elastic` / `back.out` easings** anywhere. Not in the motion vocabulary; reads as toy, not broadcast.
6. **Three competing brand lockups stacked vertically**: header logo + Gamepad2 chip + "MUSIC BINGO BATTLE" pill + giant "SOUND ROYALE" wordmark + tagline. Pick one hero. The pill ("Music Bingo Battle") is the worst offender — it's an AI-slop "eyebrow tag" with no function.
7. **`text-primary` red used as both brand color AND the wordmark color AND a translucent fill on a chip AND the radial wash.** Primary is supposed to be the ONE "go" action color. It's currently decorative everywhere, which kills its signal on the actual CTA.
8. **Uppercase `tracking-[0.2em]` micro-pill** — generic SaaS landing-page tic. Doesn't belong on a game show.

### UX
9. **Two header buttons are tertiary ghosts at `text-xs`** — "How to Play" and "Leaderboard" are functionally important; reading them requires squinting. Bump to `text-sm`, keep ghost.
10. **Onboarding auto-opens on first visit via localStorage** — fine, but there's no skip on the modal trigger path that's obvious here; verify `OnboardingModal` has a single dismissible primary action.
11. **The "Music Bingo Battle" pill repeats the tagline below it** ("Compete head-to-head..."). One of the two is redundant.

---

## ROOM — `src/pages/Room.tsx`

### Slop / Forbidden
1. **Radial gradient wash on body** (line 519) — same gradient violation as Lobby. Room spec explicitly says solid `#09090b` background, "no glassmorphism, no decorative overlays."
2. **`animate-ping` on the "waiting for opponent" red dot** (lines 569–572). MASTER: "Forbidden: infinite pulse / spin / glow animations." Also a "color urgency" pattern the room spec forbids. Use a static dot + text.
3. **`shadow-lg shadow-red-500/20` on Start Battle and Join Battle buttons** (lines 561, 603, 612). MASTER: "All shadows are pure black, no color tints, no glow." Strip the red tint.
4. **`hover:translate-y-[-1px]` on every button** (561, 603, 612, 620, 642, 656). MASTER: "Hover animations that change layout (no translateY lifts on cards)." Allowed hover is bg color change to `#27272a`.
5. **GSAP entrance choreography in the lobby state** (lines 404–431): `elastic.out(1, 0.5)` reveal on the room code, slide+fade on the join card, plus a *second* opacity fade-from on the same elements (lines 425–430 overlap 406–423 — visible double-animation bug). Replace with one 250ms scale-in on the room code; nothing else.
6. **Match-end overlay uses `bg-black/70` + `shadow-2xl`** (lines 764–765). Spec: "Winner announcement: full overlay, centered, simple scale-in animation, no confetti, no glow." Drop the `shadow-2xl`, use a solid surface, keep one 400ms scale-in.
7. **`HostMigrationIndicator`** uses `bg-yellow-500/10 border-2 border-yellow-500/50` + `animate-in slide-in-from-top duration-500`. Acceptable, but the `border-2` + translucent fill reads as a toast on top of a toast — should be a flat `#18181b` card with a yellow left-border accent and a single fade-in.
8. **Mobile leaderboard/audience accordion triggers use `hover:translate-x-0.5`** (lines 642, 656). Same layout-shift hover violation.
9. **`active:scale-[0.98]` on basically every button.** MASTER permits one tactile press scale (`0.97`); applying it to *every* button — including ghost/outline secondaries — defeats the "one primary CTA per view" hierarchy.

### UX & Hierarchy
10. **Two "Join Battle" CTAs nested inside an accordion that itself looks like a CTA.** Visitor sees one big red "Join Battle" → clicks → it expands to reveal *another* "Join as Player" red button + a "Spectate" button that's also styled red (line 620 uses `bg-red-500` styling vibe via class confusion — actually it's `border-zinc-600` but sits at the same height/weight). This is the single worst UX moment in the room. Replace with two side-by-side primary/secondary buttons, no accordion. The accordion adds a click for zero information gain.
11. **`window.prompt('Enter your name:')` for join** (line 142). Native browser prompt in a designed product — instant immersion break. Use a proper inline input or modal.
12. **"BATTLE ROOM" header in lobby state is `text-4xl md:text-5xl` Righteous** competing with the room code `text-5xl` mono right below it. Two display-scale elements stacked → no hierarchy. The room code is the hero; the title should be smaller (Heading scale `text-2xl`).
13. **"Ranked"/"Casual" pill placement** (lines 589–597) is buried under the room code with no relation to anything else. Move it next to the title as a single chip, or into the game info sidebar.
14. **Match-end overlay copy is fragmented**: "Victory!" vs "Good game!" vs "No bingo this time" vs "Good game! Resetting for next match" — four branches, inconsistent voice. Consolidate to two states: winner shown / no winner shown. Voice should pick a register (game-show MC) and stay there.
15. **Auto-reset countdown is silent** — `setResetCountdown(5)` ticks down with no UI other than tiny `text-xs text-zinc-500`. Either make it a clear timer beside Play Again, or remove the timer and require a click.
16. **Loading state spinner** uses `animate-spin` infinitely — MASTER forbids infinite spin animations. Replace with a 3-dot or text-only "Loading room…" (the spec actually says "Centered spinner" so this one is a contradiction between MASTER and pages/room.md; I'd resolve in favor of MASTER and use a static or pulsing-once indicator).
17. **`<Accordion>` used for mobile Leaderboard + Audience** is fine, but spec calls for a **fixed bottom dock with 4 tabs** (Info, Audience, Voting, Share). Current implementation has no Voting tab and no Share tab in the mobile dock.

---

## Cross-cutting

- **`primary` is overloaded.** Used for: header chip, wordmark, radial wash, eyebrow pill, dot indicator, AND the Start Battle CTA. Per MASTER, primary red is the *one* "go" action color. Strip it from every decorative use.
- **Two fonts disagreeing with the system.** CONTEXT.md and MASTER both specify Righteous (display) + Poppins (body). Lobby/Room mostly honor this, but several spots (`text-sm font-semibold` on buttons) default to inherited fonts — verify the global stack actually loads Poppins, not the AI-default Inter.
- **Every interactive element animates.** The signal-to-noise on animations is upside down: hovers translate, presses scale, entrances bounce. Pick a budget: entrance (once, fade or scale-in) OR press (tactile scale), not both on the same element. Hovers should change color only.

---

## Proposed kill list (build mode)

If you approve, I'll execute in this order — each is a small, contained diff:

### Lobby
1. Remove radial gradient background.
2. Remove `backdrop-blur-sm` and `shadow-2xl` from action card; use solid `bg-card` + `shadow-md`.
3. Delete the "MUSIC BINGO BATTLE" eyebrow pill.
4. Replace GSAP entrance choreography with a single 200ms fade-in on `<main>`. Keep `prefers-reduced-motion` guard.
5. Bump header buttons to `text-sm`.

### Room
6. Remove radial gradient background.
7. Replace `animate-ping` waiting dot with a static dot.
8. Strip colored shadows (`shadow-red-500/20`) from all buttons; use default shadow scale.
9. Remove all `hover:translate-*` from buttons and accordion triggers; rely on bg-color hover only.
10. Replace the nested "Join Battle" accordion with two adjacent buttons: primary "Join as Player" (red) + outline "Spectate".
11. Replace `window.prompt` name capture with an inline input above the join buttons (or surface the lobby's name input via session).
12. Shrink "BATTLE ROOM" title to `text-2xl`; make the room code the visual hero.
13. Move Ranked/Casual chip next to the title.
14. Simplify the GSAP lobby-state entrance to one 250ms scale-in on the room code; delete the duplicate opacity fade.
15. Drop `shadow-2xl` on match-end overlay; consolidate to two outcome copies.
16. Restyle `HostMigrationIndicator` as a flat card with yellow left-border accent + one 300ms fade-in.
17. (Optional, larger) Replace mobile Leaderboard/Audience accordion with a proper 4-tab bottom dock per `pages/room.md`. Flagged as a separate task since it touches `GameInfo`, `VotingPanel`, and `ShareInvite`.

Approve to execute steps 1–16. I'll defer 17 unless you confirm — it's a layout rewrite, not a kill.
