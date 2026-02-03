# Room Page Design Overrides

> **OVERRIDE RULE:** These rules take precedence over MASTER.md for the Room page.

---

## Page Context

The Room page is the active gameplay area featuring:
- Bingo board with genre tiles
- Player/spectator views
- Game status and round information
- Host controls (start game)
- Join as player/spectator options

---

## Page-Specific Colors

| Element | Color | Hex | Usage |
|---------|-------|-----|-------|
| Bingo Board Grid | Primary dark | `#1A1A2E` | Board background |
| Completed Tile | Green neon | `#10B981` | Completed genre |
| Active Tile | Primary glow | `#7C3AED` | Currently playing |
| Pending Tile | Muted | `#334155` | Not yet played |
| Spectator Badge | Blue accent | `#3B82F6` | Spectator indicator |
| Game Active | Green pulse | `#10B981` | Ongoing game status |
| Game Waiting | Yellow | `#EAB308` | Waiting for players |

---

## Component Specifications

### Bingo Board Grid

```css
.bingo-board {
  /* Layout */
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.75rem;
  padding: 1rem;
  
  /* Visual */
  background: rgba(26, 26, 46, 0.8);
  border: 2px solid rgba(124, 58, 237, 0.3);
  border-radius: 16px;
  
  /* Effects */
  box-shadow: 
    0 0 40px rgba(124, 58, 237, 0.2),
    inset 0 0 60px rgba(0, 0, 0, 0.3);
}
```

### Bingo Tile (Base)

```css
.bingo-tile {
  /* Layout */
  aspect-ratio: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 0.5rem;
  
  /* Visual */
  background: rgba(51, 65, 85, 0.6);
  border: 1px solid rgba(100, 116, 139, 0.3);
  border-radius: 12px;
  
  /* Typography */
  font-family: 'Poppins', sans-serif;
  font-size: 0.875rem;
  text-align: center;
  color: #E2E8F0;
  
  /* Effects */
  transition: all 200ms ease;
  cursor: pointer;
}

.bingo-tile:hover {
  border-color: rgba(124, 58, 237, 0.5);
  box-shadow: 0 0 15px rgba(124, 58, 237, 0.2);
}
```

### Bingo Tile (Completed)

```css
.bingo-tile.completed {
  background: rgba(16, 185, 129, 0.15);
  border-color: rgba(16, 185, 129, 0.6);
  box-shadow: 
    0 0 20px rgba(16, 185, 129, 0.4),
    inset 0 0 20px rgba(16, 185, 129, 0.1);
}

.bingo-tile.completed::after {
  content: '✓';
  position: absolute;
  top: 0.25rem;
  right: 0.25rem;
  width: 1.5rem;
  height: 1.5rem;
  
  display: flex;
  align-items: center;
  justify-content: center;
  
  background: #10B981;
  border-radius: 50%;
  color: white;
  font-size: 0.75rem;
  font-weight: bold;
}
```

### Bingo Tile (Active - Currently Playing)

```css
.bingo-tile.active {
  background: rgba(124, 58, 237, 0.2);
  border-color: rgba(124, 58, 237, 0.8);
  box-shadow: 
    0 0 30px rgba(124, 58, 237, 0.5),
    inset 0 0 30px rgba(124, 58, 237, 0.15);
  
  animation: tile-pulse 2s ease-in-out infinite;
}

@keyframes tile-pulse {
  0%, 100% {
    box-shadow: 
      0 0 30px rgba(124, 58, 237, 0.5),
      inset 0 0 30px rgba(124, 58, 237, 0.15);
  }
  50% {
    box-shadow: 
      0 0 50px rgba(124, 58, 237, 0.7),
      inset 0 0 40px rgba(124, 58, 237, 0.25);
  }
}
```

### Game Status Badge

```css
.game-status-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  
  /* Visual */
  background: rgba(15, 15, 35, 0.8);
  border: 1px solid currentColor;
  border-radius: 9999px;
  
  /* Typography */
  font-family: 'Righteous', cursive;
  font-size: 0.875rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.game-status-badge.waiting {
  color: #EAB308;
  border-color: rgba(234, 179, 8, 0.5);
}

.game-status-badge.active {
  color: #10B981;
  border-color: rgba(16, 185, 129, 0.5);
  animation: status-glow 2s ease-in-out infinite;
}

@keyframes status-glow {
  0%, 100% { 
    box-shadow: 0 0 10px rgba(16, 185, 129, 0.3);
  }
  50% { 
    box-shadow: 0 0 20px rgba(16, 185, 129, 0.5);
  }
}
```

### Player Card (In-Game)

```css
.room-player-card {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem;
  
  /* Visual */
  background: rgba(15, 15, 35, 0.6);
  border: 1px solid rgba(124, 58, 237, 0.2);
  border-radius: 12px;
  
  /* Effects */
  transition: all 200ms ease;
}

.room-player-card.current-user {
  border-color: rgba(124, 58, 237, 0.6);
  box-shadow: 0 0 20px rgba(124, 58, 237, 0.3);
}

.room-player-card.spectator {
  border-color: rgba(59, 130, 246, 0.4);
  opacity: 0.8;
}
```

### Join Action Cards

```css
.join-action-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  padding: 1.5rem;
  
  /* Visual */
  background: rgba(15, 15, 35, 0.6);
  border: 2px solid rgba(124, 58, 237, 0.3);
  border-radius: 16px;
  
  /* Effects */
  transition: all 200ms ease;
  cursor: pointer;
}

.join-action-card:hover {
  border-color: rgba(124, 58, 237, 0.6);
  box-shadow: 0 8px 25px rgba(124, 58, 237, 0.3);
  transform: translateY(-4px);
}

.join-action-card.spectator {
  border-color: rgba(59, 130, 246, 0.3);
}

.join-action-card.spectator:hover {
  border-color: rgba(59, 130, 246, 0.6);
  box-shadow: 0 8px 25px rgba(59, 130, 246, 0.3);
}
```

---

## Layout Guidelines

### Room Page Container

```css
.room-container {
  min-height: 100vh;
  background: #0F0F23;
  position: relative;
}

/* CRT Scanline Effect */
.room-container::before {
  content: '';
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: repeating-linear-gradient(
    0deg,
    transparent,
    transparent 2px,
    rgba(0, 0, 0, 0.03) 2px,
    rgba(0, 0, 0, 0.03) 4px
  );
  pointer-events: none;
  z-index: 1;
}
```

### Header

```css
.room-header {
  position: sticky;
  top: 0;
  z-index: 10;
  
  /* Visual */
  background: rgba(15, 15, 35, 0.8);
  border-bottom: 1px solid rgba(124, 58, 237, 0.2);
  
  /* Effects */
  backdrop-filter: blur(12px);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
}

.room-header-title {
  font-family: 'Righteous', cursive;
  font-size: 1.5rem;
  background: linear-gradient(135deg, #7C3AED 0%, #A78BFA 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}
```

### Main Game Area (Desktop)

```css
.room-game-layout {
  display: grid;
  grid-template-columns: 20rem 1fr;
  gap: 1.5rem;
  padding: 1.5rem;
  max-width: 1200px;
  margin: 0 auto;
}

/* Mobile: Stack vertically */
@media (max-width: 1023px) {
  .room-game-layout {
    grid-template-columns: 1fr;
  }
}
```

### Side Panel (Game Info)

```css
.room-side-panel {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.room-info-card {
  background: rgba(15, 15, 35, 0.6);
  border: 1px solid rgba(124, 58, 237, 0.2);
  border-radius: 12px;
  padding: 1rem;
}
```

---

## Animations

### Tile Completion Celebration

```css
@keyframes tile-complete {
  0% {
    transform: scale(1);
    box-shadow: 0 0 20px rgba(16, 185, 129, 0.4);
  }
  25% {
    transform: scale(1.1);
    box-shadow: 0 0 40px rgba(16, 185, 129, 0.6);
  }
  50% {
    transform: scale(1.05);
    box-shadow: 0 0 60px rgba(16, 185, 129, 0.8);
  }
  100% {
    transform: scale(1);
    box-shadow: 0 0 20px rgba(16, 185, 129, 0.4);
  }
}

.bingo-tile.just-completed {
  animation: tile-complete 600ms ease-out;
}
```

### Board Entry Animation

```css
@keyframes board-enter {
  0% {
    opacity: 0;
    transform: scale(0.9) translateY(20px);
  }
  100% {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

.bingo-board {
  animation: board-enter 500ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
}
```

### Staggered Tile Reveal

```css
@keyframes tile-reveal {
  0% {
    opacity: 0;
    transform: scale(0.8) rotate(-5deg);
  }
  100% {
    opacity: 1;
    transform: scale(1) rotate(0);
  }
}

.bingo-tile {
  animation: tile-reveal 300ms ease-out forwards;
  animation-delay: calc(var(--tile-index) * 50ms);
}
```

### Win Celebration

```css
@keyframes win-celebration {
  0%, 100% {
    box-shadow: 
      0 0 60px rgba(16, 185, 129, 0.5),
      inset 0 0 40px rgba(16, 185, 129, 0.2);
  }
  50% {
    box-shadow: 
      0 0 100px rgba(16, 185, 129, 0.8),
      inset 0 0 60px rgba(16, 185, 129, 0.4);
  }
}

.bingo-board.winner {
  animation: win-celebration 1s ease-in-out infinite;
  border-color: rgba(16, 185, 129, 0.8);
}
```

---

## Responsive Breakpoints

| Breakpoint | Layout | Board Size | Typography |
|------------|--------|------------|------------|
| < 640px | Single column | 3x3 grid, smaller tiles | 0.875x scale |
| 640px - 1023px | Single column | 3x3 grid | 1x scale |
| 1024px+ | Two columns (sidebar + main) | 3x3 grid with larger tiles | 1x scale |

### Mobile Optimizations

```css
@media (max-width: 639px) {
  .bingo-board {
    gap: 0.5rem;
    padding: 0.75rem;
  }
  
  .bingo-tile {
    font-size: 0.75rem;
    padding: 0.375rem;
  }
  
  .room-game-layout {
    padding: 1rem;
  }
}
```

---

## Accessibility

### Focus States

```css
.bingo-tile:focus-visible,
.join-action-card:focus-visible {
  outline: 2px solid #A78BFA;
  outline-offset: 2px;
}
```

### Reduced Motion

```css
@media (prefers-reduced-motion: reduce) {
  .bingo-tile.active,
  .game-status-badge.active,
  .bingo-board,
  .bingo-tile,
  .bingo-tile.just-completed,
  .bingo-board.winner {
    animation: none;
  }
  
  .bingo-tile,
  .join-action-card {
    transition: none;
  }
}
```

### Screen Reader Support

```css
/* Hide visual checkmark from screen readers */
.bingo-tile.completed::after {
  aria-hidden: true;
}

/* Add aria-live region for game status updates */
.game-status-announce {
  position: absolute;
  left: -10000px;
  width: 1px;
  height: 1px;
  overflow: hidden;
}
```

### Contrast Requirements

- Tile text on pending state: 7:1 ratio ✓
- Completed tile text: 8:1 ratio ✓
- Active tile text: 7:1 ratio ✓
- Game status badges: 4.5:1+ ratio ✓

---

## Pre-Delivery Checklist

- [ ] Bingo board has neon border and inner shadow
- [ ] Tiles have hover glow effect
- [ ] Completed tiles show green neon glow + checkmark
- [ ] Active tile has pulsing purple animation
- [ ] Game status badge has appropriate color + glow
- [ ] Player cards show current user highlight
- [ ] Spectator cards visually distinct (blue tint)
- [ ] Join action cards have lift effect on hover
- [ ] CRT scanline effect applied
- [ ] All animations respect reduced motion
- [ ] Focus states visible for keyboard navigation
- [ ] No emojis used (SVG icons only)
- [ ] Responsive layout works on mobile
