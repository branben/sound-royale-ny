# Room Page — Design Spec

> **OVERRIDE RULE:** These rules supplement MASTER.md for the Room page. Anything not specified here falls back to MASTER.md.

---

## Page Context

The Room is the live game area. Shows the bingo board(s), round stage, player info, and spectator/voting panels. This is the main event.

---

## Layout

- **Desktop:** Two-column — sidebar (`w-80`, game info + audience) + main area (boards + round stage)
- **Mobile:** Single column, bottom dock for info/audience/voting/share
- Max-width: `72rem`, centered

### Header

- "Sound Royale" in Righteous, `text-xl`
- Back to Lobby button (outline, small)
- Solid background (`#09090b`), border-bottom `#3f3f46`
- No gradient text, no glassmorphism

---

## Components

### Round Stage

- Banner across the top of the main area
- Shows: round number, current genre, timer
- Content on one line, `text-sm`
- Timer uses mono font, `text-base`
- Genre displayed in white, round number in text secondary
- No pulsing, no color urgency on timer
- Not a card — just a text row with a bottom border

### Bingo Board

Per MASTER.md specs — solid card, player color accents.

**Layout:**
- Player name in their assigned color at top-left
- Progress dots (9 dots, row at top-right)
- 3×3 grid, `gap-2` (8px)
- Tiles are square (`aspect-ratio: 1`)

### Bingo Tile States

Per MASTER.md:
- Empty: bg `#27272a`, border `#3f3f46`
- Pending: bg `#27272a`, border = player color
- Complete: bg player-color at 10%, border = player color
- No checkmark circle on complete
- Genre name centered in tile, `text-xs`, font-medium

### Player View

- If player has joined: show their board + score + connection status
- Left column (desktop): player info card (name, title, connection status, score)
- Right column: their bingo board
- Upload drawer: slides up from bottom, standard drawer component

### Spectator View

- Shows both producer boards side-by-side (desktop) or stacked (mobile)
- Leaderboard bar at top (list with progress bars)
- Voting panel below
- Spectator badge: "SPECTATOR" tag, static

### Voting Panel

- Appears when voting is open
- Two producer cards side by side, click to vote
- Each card: avatar circle + name
- Voting closed: muted panel with "Waiting..." text
- After voting: green checkmark confirmation
- No framer-motion hover effects (rotateZ, scale). Simple CSS hover.

### Game Info Sidebar (Desktop)

- Sticky sidebar, `w-80`
- Sections:
  - Producers list (with player colors)
  - Spectators list (no colors)
  - Share spectator link button
- Solid card, no glassmorphism

### Mobile Dock

- Fixed bottom bar, 4 tabs: Info, Audience, Voting, Share
- Each tab opens a drawer
- Background: `#18181b` solid, border-top `#3f3f46`

### Winner Announcement

- Full overlay, centered
- Winner name in their player color
- "BINGO!" or "WINNER!" text in display font
- No confetti, no particle effects
- Simple scale-in animation (one-shot, 400ms)

---

## Empty / Loading / Error States

- **Loading:** Centered spinner, "Loading room..." text
- **Error:** Centered card with error message + "Back to Lobby" button
- **Not joined:** "Join as Player" / "Join as Spectator" cards
- **Game finished:** Winner announcement or GameOver screen

---

## Responsive

| Breakpoint | Layout | Board Size |
|------------|--------|------------|
| < 640px | Single column, boards stack | Tiles `text-xs` |
| 640–1023px | Single column, boards stack | Tiles `text-sm` |
| 1024px+ | Sidebar + main, boards side-by-side | Tiles `text-sm` |

---

## Pre-Delivery

- [ ] No CRT scanlines or decorative overlays
- [ ] Player colors render correctly on boards, tiles, cards
- [ ] Round stage is text-only (no card bg)
- [ ] Voting panel has no framer-motion hover effects
- [ ] Winner announcement has no confetti/particles
- [ ] Mobile dock uses solid background
- [ ] Sidebar has solid card backgrounds
- [ ] All animations single-shot (not looping)
- [ ] Reduced motion respected
