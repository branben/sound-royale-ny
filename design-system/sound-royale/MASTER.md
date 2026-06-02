# Design System Master File — Sound Royale

> **LOGIC:** When building a specific page, first check `design-system/pages/[page-name].md`.
> If that file exists, its rules **override** this Master file.
> If not, strictly follow the rules below.

---

**Project:** Sound Royale
**Redesign:** 2026-05-29
**Category:** Multiplayer Music Bingo Game
**Aesthetic:** Dark tech — competitive, social, energizing

---

## Design Direction

**Vibe:** Jackbox Party Pack meets fighting game UI. Premium, competitive, social. Dark surfaces, sharp accents, zero decorative effects.

**What this is NOT:** No retro-futurism, no synthwave, no neon glow, no CRT scanlines, no cyberpunk, no gradients, no glassmorphism, no blur orbs.

---

## Global Rules

### Color Palette

| Role | Hex | Usage |
|------|-----|-------|
| Background | `#09090b` | Page background (zinc-950) |
| Surface | `#18181b` | Cards, panels (zinc-900) |
| Surface Elevated | `#27272a` | Hover states, nested surfaces (zinc-800) |
| Border | `#3f3f46` | Card borders, dividers (zinc-700) |
| Text Primary | `#fafafa` | Headlines, body (zinc-50) |
| Text Secondary | `#a1a1aa` | Captions, metadata (zinc-400) |
| Accent | `#22D3EE` | Primary CTAs, active states only (cyan-400) |
| Success | `#22c55e` | Completed tiles, wins (green-500) |
| Warning | `#eab308` | Timer low, host crown (yellow-500) |

**Color Rules:**
- Accent (`#22D3EE`) is for PRIMARY CTAs only. Not for decorative borders, backgrounds, or text highlights.
- NEVER use gradients. Every color is solid.
- NEVER use glow effects (box-shadow glows, text-shadow glows, drop-shadows).
- Surface colors are always solid — no opacity, no backdrop-blur on in-flow cards.

### Typography

- **Heading Font:** Righteous — used for brand name, page titles, player initials only
- **Body Font:** Poppins — used for everything else
- **Mood:** Competitive, clean, confident, modern
- **Loading:** Self-hosted with `font-display: swap`. No Google Fonts `<link>` in production.

### Type Scale

| Level | Size | Weight | Usage |
|-------|------|--------|-------|
| Display | `text-3xl md:text-4xl` | 700 | Page titles, brand |
| Heading | `text-xl md:text-2xl` | 600 | Section headers |
| Body | `text-sm md:text-base` | 400 | Default text |
| Caption | `text-xs` | 400 | Metadata, timestamps |
| Mono | `text-sm font-mono` | 400 | Room codes, timer, stats |

**Typography Rules:**
- Control hierarchy through weight + color, NEVER through glow effects.
- No gradient text. No text-shadow. Ever.
- Maximum 2 font sizes per component for clear hierarchy.

### Spacing Scale

| Token | Value | Usage |
|-------|-------|-------|
| xs | `4px` | Tight gaps, dot indicators |
| sm | `8px` | Icon gaps, inline spacing |
| md | `16px` | Standard padding within components |
| lg | `24px` | Between sections |
| xl | `32px` | Page-level padding |

### Shadow System

All shadows are pure black, no color tints:

| Level | Value | Usage |
|-------|-------|-------|
| sm | `0 1px 2px rgba(0,0,0,0.3)` | Subtle card lift |
| md | `0 4px 12px rgba(0,0,0,0.5)` | Cards, dropdowns |
| lg | `0 8px 24px rgba(0,0,0,0.6)` | Modals |

**Shadow Rules:**
- NEVER use colored shadows (no purple glow, no rose glow).
- NEVER use box-shadow as a border replacement.
- NEVER use text-shadow.

---

## Component Specs

### Buttons

**Primary (solid accent):**
- Background: `#F43F5E`
- Text: White
- Hover: `opacity: 0.9` + `translateY(-1px)`
- Active: `scale(0.98)` — tactile feedback
- Border-radius: `8px`

**Secondary (outline):**
- Background: transparent
- Border: `1px solid #3f3f46`
- Text: `#fafafa`
- Hover: background `#27272a`

**Rules:**
- NEVER use gradient backgrounds on buttons.
- NEVER use glow shadows on hover.
- Button text must fit on one line at desktop — max 3 words for primary CTAs.
- One label per CTA intent across the entire app.

### Cards

```css
/* Standard Card */
.surface {
  background: #18181b;      /* solid zinc-900 */
  border: 1px solid #3f3f46; /* zinc-700 border */
  border-radius: 12px;
  padding: 24px;
}
```

**Card Rules:**
- NEVER use `backdrop-blur` on cards in the document flow. Only on true overlays (modals, drawers, tooltips).
- NEVER use opacity on card backgrounds. Always solid.
- NEVER use colored borders for default state. Use `--border` (`#3f3f46`).
- Border-radius: `12px` for all cards. `8px` for inputs. `6px` for small elements. `full` for avatars, badges. Pick one scale and stick to it.

### Inputs

- Background: `#27272a` (surface elevated)
- Border: `1px solid #3f3f46`
- Focus: `border-color: #F43F5E` + `ring: 2px solid #F43F5E at 20% opacity`
- NEVER use glow shadows on focus. Ring only.
- Border-radius: `8px`

---

## Game-Specific Components

### Bingo Tile States

| State | Background | Border |
|-------|-----------|--------|
| Empty | `#27272a` | `#3f3f46` |
| Pending | `#27272a` | `#F43F5E` (solid, no glow) |
| Complete | `#22c55e at 15%` | `#22c55e` (solid, no glow) |
| Active Round | `#27272a` | `#F43F5E` at 60%, `2px` |

**Tile Rules:**
- NEVER use glow/shadow on tiles. Border color only.
- Pending state: border highlight only, no pulse animation.
- Completed state: solid green border + tinted background, no glow.

### Host Crown

- Color: `#eab308` (yellow-500)
- NO animation. NO glow. Static icon.

---

## Animation Rules

- Default: STATIC. No animation unless it communicates game state.
- Allowed animations: card entry (fade in once), tile state changes (border color transition), timer countdown.
- NEVER use infinite pulse, glow, or spin animations for decoration.
- ALL animations MUST be gated under `@media (prefers-reduced-motion: reduce)`.
- Animation duration: 200-300ms max. Use `ease-out`.

---

## Z-Index Scale

| Value | Usage |
|-------|-------|
| `z-10` | Sticky navigation headers |
| `z-40` | Mobile dock, fixed bottom bars |
| `z-50` | Modals, drawers, toasts, overlays |

NEVER use arbitrary z-index values.

---

## Anti-Patterns (Forbidden)

- ❌ Gradients of any kind (text, background, border)
- ❌ Neon glow, box-shadow glow, text-shadow, drop-shadow
- ❌ CRT scanlines or any decorative overlay
- ❌ Ambient blur orbs / mesh gradients
- ❌ Glassmorphism (backdrop-blur on non-overlay surfaces)
- ❌ Colored shadows
- ❌ Infinite pulse/spin animations
- ❌ Opacity on card backgrounds (solid only)
- ❌ Google Fonts `<link>` tag (use @font-face)
- ❌ Mixed border-radius scales
- ❌ Emojis as icons

---

## Pre-Delivery Checklist

- [ ] Zero gradients in component code
- [ ] Zero glow/neon effects
- [ ] Zero backdrop-blur on non-overlay elements
- [ ] All animations gated under `prefers-reduced-motion: reduce`
- [ ] Button contrast ≥ 4.5:1 (WCAG AA)
- [ ] All cards use solid backgrounds
- [ ] All borders use `#3f3f46` (neutral) unless indicating game state
- [ ] Accent color used for CTAs and interactive states only
- [ ] Font-family matches config (Poppins for body, Righteous for display)
- [ ] Build passes (`npx tsc --noEmit`)
