# Lobby Page — Design Spec

> **OVERRIDE RULE:** These rules supplement MASTER.md for the Lobby page. Anything not specified here falls back to MASTER.md.

---

## Page Context

The Lobby is the entry point. A single focused card in the center of a dark stage. Three modes:
- **Landing** — Quick Match / Create / Join buttons
- **Join** — 4-digit room code input
- **Create** — Room name + theme selector

---

## Layout

- Full-screen centered. Single card, max-width `28rem`.
- Background: `#09090b` — solid. No blur orbs, no ambient effects.
- Content scales with viewport. Padding: `1rem` mobile, `2rem` desktop.

---

## Components

### Logo / Title

- "Sound Royale" in Righteous, `text-3xl`
- Color: `#fafafa` (white)
- No icon, no decorative element. The typography is the logo.

### Player Name Input

- Standard input per MASTER.md
- Centered text, `text-xl`
- Placeholder: "Enter your name"
- Max 20 chars

### Action Buttons (Landing Mode)

**Quick Match (Primary CTA):**
- Solid `#EF4444` (red-500), white text
- Full width, `h-12`
- Only primary CTA on this view

**Create / Join (Secondary):**
- Outline variant (transparent bg, `#3f3f46` border, white text)
- Equal width, side by side

**Browse Rooms / How to Play / View Leaderboard:**
- Ghost variant (no border, transparent bg)
- Grouped at the bottom of the card

### Room Code Input (Join Mode)

- Monospace font, `text-4xl`
- Centered, `tracking-[0.5em]`
- Standard input styling (no glow, no neon border)
- Helper text: "Enter 4-digit room code" in `text-xs text-secondary`

### Player List (Joined State)

- Each player in a row: avatar circle → name → status indicator
- Player 1 avatar border = `#EF4444`, Player 2 = `#3B82F6`
- Host crown: yellow `#EAB308` static icon, no animation
- Ready indicator: green dot (`#22C55E`), no glow
- Empty slots: dashed border, `#52525b` text "Waiting for player..."

### Ready / Start Buttons

- Host: "Start Match" — primary CTA (`#EF4444` solid), full width
- Player: "Click When Ready" — green when ready (`#22C55E` solid)

### Room Code Display (Joined State)

- Mono font, centered
- Label: "Room Code" in caption style
- Value: large mono text

---

## Modals

- Onboarding, Room Browser, Discord Link — all use the standard Dialog component
- No decorative animations on open/close
- Simple fade + scale in (200ms)

---

## Responsive

| Breakpoint | Behavior |
|------------|----------|
| < 640px | Card fills viewport width minus `1rem` padding |
| 640px+ | Card centered, `28rem` max-width |

---

## Pre-Delivery

- [ ] No ambient blur orbs or decorative overlays
- [ ] All player cards show correct player color
- [ ] Host crown is static (no animation)
- [ ] Join/Create flow uses outline buttons, not filled
- [ ] Quick Match is the only primary CTA on landing
- [ ] Empty slots use dashed border style
- [ ] Reduced motion respected
