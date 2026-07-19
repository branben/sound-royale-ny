# Design System — Sound Royale

> **LOGIC:** For page-specific overrides, check `design-system/pages/[page-name].md`.
> If that file exists, its rules **override** this Master file.
> If not, strictly follow the rules below.

---

**Project:** Sound Royale
**Redesign:** 2026-06-13
**Game:** Multiplayer Music Bingo (Jackbox-style)
**Aesthetic:** Polished Jackbox — premium game-show energy with intentional character. Clean, bold, flat.

---

## Design Direction

**Vibe:** You're watching a premium game-show broadcast. Dark stage, bold player colors, clean typography, zero visual noise. Every element has a reason to exist.

**What this IS:** Flat colors on near-black, per-player color identity, purposeful animations, TV broadcast framing, bold typography, generous whitespace.

**What this is NOT:** Dark tech UI, cyberpunk, synthwave, neon glow, gradients, glassmorphism, blur orbs, CRT scanlines, decorative animations, "gamer" aesthetics.

---

## Color System

### Global Palette

| Role | Hex | Usage |
|------|-----|-------|
| Background | `#09090b` | Page background |
| Surface | `#18181b` | Cards, panels |
| Surface Elevated | `#27272a` | Hover states, inputs |
| Border | `#3f3f46` | Card borders, dividers |
| Text Primary | `#fafafa` | Headlines, body |
| Text Secondary | `#a1a1aa` | Captions, metadata |
| Text Muted | `#52525b` | Placeholder, disabled |

### Player Colors (assigned on room join)

| Player | Hex | Usage |
|--------|-----|-------|
| Player 1 | `#EF4444` red-500 | Avatar border, active tiles, highlights |
| Player 2 | `#3B82F6` blue-500 | Avatar border, active tiles, highlights |
| Player 3 | `#EAB308` yellow-500 | Avatar border, active tiles, highlights |
| Player 4 | `#22C55E` green-500 | Avatar border, active tiles, highlights |

**Rules:**
- Player color infuses avatar border, tile borders, name highlights, progress indicators
- Never use player colors for background fills or large surfaces
- Player colors are for accents and highlights only
- Non-player UI elements use the global palette

### Accent (for CTAs & interactive elements)

| Role | Hex | Usage |
|------|-----|-------|
| Primary Action | `#EF4444` | Primary buttons (Start Match, Join Room — the "go" action) |
| Interactive Hover | `#27272a` | Hover state for interactive elements |

**Rules:**
- Use PRIMARY color for the ONE main action per page
- All other buttons use `outline` variant (transparent bg, border only)
- Never use accent colors for decorative elements

### Status Colors

| Role | Hex | Usage |
|------|-----|-------|
| Success | `#22C55E` | Completed tiles, ready state, wins |
| Warning | `#EAB308` | Timer low, host crown, pending state |
| Error | `#EF4444` | Errors, disconnections |

---

## Typography

| Level | Font | Size | Weight | Usage |
|-------|------|------|--------|-------|
| Display | Righteous | `text-3xl md:text-4xl` | 400 | Brand name, page titles |
| Heading | Poppins | `text-xl md:text-2xl` | 600 | Section headers |
| Body | Poppins | `text-sm md:text-base` | 400 | Default text |
| Caption | Poppins | `text-xs` | 400 | Metadata, timestamps |
| Mono | SF Mono | `text-sm` | 400 | Room codes, timer, stats |

**Rules:**
- Righteous for BRAND and TITLES only — never for body text
- Poppins for everything else
- No gradient text, no text-shadow, no letter-spacing gimmicks
- Max 2 font sizes per component for clear hierarchy
- Control hierarchy through weight and color, not size alone

---

## Spacing

| Token | Value | Usage |
|-------|-------|-------|
| xs | `4px` | Tight gaps, dot indicators |
| sm | `8px` | Icon gaps, inline spacing |
| md | `16px` | Standard padding within components |
| lg | `24px` | Between sections |
| xl | `32px` | Page-level padding |

---

## Shadows

All shadows are pure black, no color tints, no glow:

| Level | Value |
|-------|-------|
| sm | `0 1px 2px rgba(0,0,0,0.3)` |
| md | `0 4px 12px rgba(0,0,0,0.5)` |
| lg | `0 8px 24px rgba(0,0,0,0.6)` |

**Rules:** No colored shadows. No text-shadow. No box-shadow glow effects.

---

## Component Specs

### Buttons

**Primary (solid):**
- Background: `#EF4444` (red-500)
- Text: White
- Hover: `opacity-90`
- Active: `scale(0.97)` — tactile feedback
- Border-radius: `8px`

**Secondary / Outline:**
- Background: transparent
- Border: `1px solid #3f3f46` (zinc-700)
- Text: `#fafafa`
- Hover: background `#27272a`

**Rules:**
- One primary CTA per view. All other buttons are outline or ghost.
- No gradients. No glow on hover.
- Button text fits on one line (max 3 words for primary CTAs).

### Cards

```css
/* Standard Card */
.surface {
  background: #18181b;
  border: 1px solid #3f3f46;
  border-radius: 12px;
  padding: 24px;
}
```

**Rules:**
- Solid backgrounds only. No backdrop-blur on in-flow cards.
- Border is always `#3f3f46` in default state.
- Border-radius: `12px` for cards, `8px` for inputs, `6px` for small elements, `full` for avatars/badges.
- Never mix border-radius scales within the same component.

### Inputs

- Background: `#27272a`
- Border: `1px solid #3f3f46`
- Focus: `ring-2 ring-primary/30` (no glow, ring only)
- Border-radius: `8px`

---

## Player Color System

### How It Works

1. When a room loads and players are fetched, assign colors in join order:
   - First non-spectator player → Player 1 (`#EF4444`)
   - Second non-spectator player → Player 2 (`#3B82F6`)
   - Third → Player 3 (`#EAB308`)
   - Fourth → Player 4 (`#22C55E`)
2. Spectators get no player color
3. The color assignment is stable for the duration of the room session

### Where Player Color Appears

| Element | Usage |
|---------|-------|
| Avatar circle | Border color = player color |
| Player name | Colored text |
| Bingo tile (when active for this player) | Border = player color |
| Progress dots | Fill = player color |
| Score display | Accent = player color |
| Player cards in lobby/room | Left border accent = player color |

### Implementation

Player color is stored in a `playerColors` map in the game context:
```typescript
const PLAYER_COLOR_PALETTE = ['#EF4444', '#3B82F6', '#EAB308', '#22C55E'];
// Assigned in join order, skipping spectators
```

---

## Game-Specific Components

### Bingo Board

- Background: `#18181b` (solid)
- Border: `1px solid #3f3f46`
- Player name in their color at the top
- Progress: `completedCount/9` in text secondary

### Bingo Tile States

| State | Background | Border |
|-------|-----------|--------|
| Empty | `#27272a` | `#3f3f46` |
| Pending | `#27272a` | Player color (solid, no glow) |
| Complete | Player color at 10% opacity | Player color (solid, no glow) |
| Active Round | `#27272a` | Player color, `2px` |

**Tile Rules:**
- No glow/shadow on tiles. Border color only.
- No pulse animation on tiles.
- Completed state: solid border + tinted bg. No glow. No checkmark circle.

### Host Crown

- Color: `#EAB308` (yellow-500)
- Static icon. No animation. No glow.

### Round Stage / Timer

- Displayed as a banner across the top of the game area
- Shows: round number, current genre, timer countdown
- Timer uses mono font, large when < 10s
- No pulsing, no color change urgency

---

## Animation Rules

### Philosophy

Animations communicate **state changes only**, not decoration. If it doesn't help the player understand what happened, it shouldn't animate.

### Allowed

| Animation | Where | Duration |
|-----------|-------|----------|
| Fade in | Page transitions, new content appearing | 200ms |
| Scale in | Tiles appearing, modals opening | 250ms |
| Slide up | Drawers, bottom sheets | 300ms |
| Card entry | Cards appearing on initial load | 300ms |
| Timer tick | Countdown number change | 100ms |
| Timer urgency | Timer < 10s — gentle pulse + red (state-driven, not always-on) | 1s loop while urgent |
| Tile claim | Tile completes — scale pop + color settle | 400ms (one-shot) |
| Bingo celebration | When a player gets bingo | 500ms (one-shot) |
| Tile hover | Interactive empty tile lifts on hover (`scale 1.03`) | 150ms |
| Score count-up | Score number animates to new value on change | 600ms |
| "Your Turn" badge | Slides in when it becomes this player's turn | 200ms |
| Board shudder | Board shakes when 5+ tiles complete (momentum feedback) | 300ms |

**Purposeful game-feel is allowed and encouraged** — animations must communicate a
*state change* (claim, score, turn, urgency), not decorate a static screen. This is
what makes the game feel alive vs. a dashboard. The existing components
(`BingoTile`, `BingoBoard`, `ScoreDisplay`, `GameInfo`) already implement these;
keep them.

### Forbidden

- Infinite pulse / spin / glow on **non-state-driven** elements (decorative loops)
- **Always-on** urgency/pulse regardless of game state
- Staggered entrance sequences on every element, one-by-one, on every load
- Any animation that delays the user's ability to interact
- Hover animations that change layout flow (no translateY lifts that shift siblings)
- Reduced-motion override that fires automatically (must stay opt-in via `?motion=on`)

### Implementation

```typescript
// All animations gated behind prefers-reduced-motion
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

- Use `framer-motion` for JS-driven animations
- Default to `static` — no animation unless explicitly needed
- Duration range: 100ms–400ms for most animations, up to 600ms for celebrations

---

## Page Layout Principles

- Every page has a single focused task. No split attention.
- Content is centered horizontally, max-width controlled.
- Mobile-first by default. Desktop gets more space, not more content.
- Bottom sheets / drawers for mobile menus (game info, audience list).
- Desktop sidebar for persistent info (game info, leaderboard).

### Max Content Widths

| Context | Max Width |
|---------|-----------|
| Lobby card | `28rem` |
| Game area | `72rem` |
| Admin pages | `56rem` |

---

## Z-Index Scale

| Value | Usage |
|-------|-------|
| `z-10` | Sticky headers |
| `z-40` | Mobile dock |
| `z-50` | Modals, drawers, toasts |

No arbitrary z-index values.

---

## Anti-Patterns (Forbidden)

- ❌ Gradients (text, background, border)
- ❌ Glow/neon effects (box-shadow glow, drop-shadow, text-shadow)
- ❌ Glassmorphism / backdrop-blur on in-flow elements
- ❌ Decorative infinite animations
- ❌ Staggered entrance sequences
- ❌ CRT scanlines, noise overlays, decorative textures
- ❌ Opacity on card backgrounds (always solid)
- ❌ Colored shadows
- ❌ Google Fonts `<link>` tag (use `@font-face`)
- ❌ Mixed border-radius scales
- ❌ Emojis as icons (use Lucide or custom SVGs)
- ❌ Gradient text
- ❌ Neon borders on non-interactive elements

---

## Pre-Delivery Checklist

- [ ] Zero gradients in component code
- [ ] Zero glow/neon effects
- [ ] Zero backdrop-blur on non-overlay elements
- [ ] Player colors assigned dynamically from palette
- [ ] All animations gated under `prefers-reduced-motion: reduce`
- [ ] Button contrast ≥ 4.5:1 (WCAG AA)
- [ ] All cards use solid backgrounds
- [ ] All borders use `#3f3f46` unless indicating player/game state
- [ ] Player colors used for accents only, not full backgrounds
- [ ] One primary CTA per page
- [ ] Font-family matches config (Poppins for body, Righteous for display)
- [ ] Build passes (`npx tsc --noEmit`)
