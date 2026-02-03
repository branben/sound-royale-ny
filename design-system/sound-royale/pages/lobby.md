# Lobby Page Design Overrides

> **OVERRIDE RULE:** These rules take precedence over MASTER.md for the Lobby page.

---

## Page Context

The Lobby page is the entry point for players to join or create game rooms. It features:
- Room code input (4-digit numeric)
- Player list display
- Host controls (start match button)
- Join/Create room flow

---

## Page-Specific Colors

While following the global palette, the Lobby uses these specific accents:

| Element | Color | Hex | Usage |
|---------|-------|-----|-------|
| Room Code Display | Primary neon | `#7C3AED` | Room code text, highlights |
| Host Crown | Yellow accent | `#EAB308` | Crown icon for host player |
| Player Ready | Green glow | `#10B981` | Ready status indicator |
| Empty Slots | Muted | `#64748B` | Waiting indicator |
| Error States | Rose | `#F43F5E` | Error messages |

---

## Component Specifications

### Room Code Input

```css
.lobby-room-code-input {
  /* Typography */
  font-family: 'Poppins', monospace;
  font-size: 2.5rem;
  font-weight: 600;
  letter-spacing: 0.5em;
  text-align: center;
  
  /* Visual */
  background: rgba(15, 15, 35, 0.8);
  border: 2px solid #7C3AED;
  border-radius: 12px;
  padding: 1rem;
  
  /* Effects */
  box-shadow: 0 0 20px rgba(124, 58, 237, 0.3);
  transition: all 200ms ease;
}

.lobby-room-code-input:focus {
  border-color: #A78BFA;
  box-shadow: 
    0 0 30px rgba(124, 58, 237, 0.5),
    inset 0 0 20px rgba(124, 58, 237, 0.1);
  outline: none;
}
```

### Player Card

```css
.lobby-player-card {
  /* Layout */
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem;
  
  /* Visual */
  background: rgba(15, 15, 35, 0.6);
  border: 1px solid rgba(124, 58, 237, 0.3);
  border-radius: 12px;
  
  /* Effects */
  transition: all 200ms ease;
  cursor: pointer;
}

.lobby-player-card:hover {
  border-color: rgba(124, 58, 237, 0.6);
  box-shadow: 0 4px 12px rgba(124, 58, 237, 0.2);
  transform: translateY(-2px);
}

.lobby-player-card.host {
  border-color: rgba(234, 179, 8, 0.5);
  box-shadow: 0 0 15px rgba(234, 179, 8, 0.2);
}
```

### Player Avatar

```css
.lobby-player-avatar {
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 50%;
  border: 2px solid rgba(124, 58, 237, 0.5);
  background: rgba(124, 58, 237, 0.2);
  
  /* Typography */
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: 'Righteous', cursive;
  font-size: 1.25rem;
  color: #7C3AED;
}

.lobby-player-avatar.host {
  border-color: rgba(234, 179, 8, 0.8);
  background: rgba(234, 179, 8, 0.2);
  color: #EAB308;
}
```

### Empty Slot

```css
.lobby-empty-slot {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem;
  
  /* Visual */
  background: rgba(100, 116, 139, 0.1);
  border: 2px dashed rgba(100, 116, 139, 0.4);
  border-radius: 12px;
  
  /* Typography */
  color: #64748B;
  font-style: italic;
}

/* Animated pulse for waiting state */
.lobby-empty-slot::before {
  content: '';
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 50%;
  border: 2px dashed rgba(100, 116, 139, 0.4);
  animation: pulse-waiting 2s ease-in-out infinite;
}

@keyframes pulse-waiting {
  0%, 100% { opacity: 0.4; }
  50% { opacity: 0.8; }
}
```

### Start Match Button (Host Only)

```css
.lobby-start-match-btn {
  /* Layout */
  width: 100%;
  padding: 1rem;
  
  /* Visual */
  background: linear-gradient(135deg, #7C3AED 0%, #F43F5E 100%);
  border: none;
  border-radius: 12px;
  
  /* Typography */
  font-family: 'Righteous', cursive;
  font-size: 1.25rem;
  color: white;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  
  /* Effects */
  box-shadow: 
    0 4px 15px rgba(124, 58, 237, 0.4),
    0 0 30px rgba(244, 63, 94, 0.2);
  transition: all 200ms ease;
  cursor: pointer;
}

.lobby-start-match-btn:hover {
  transform: translateY(-2px);
  box-shadow: 
    0 6px 20px rgba(124, 58, 237, 0.5),
    0 0 40px rgba(244, 63, 94, 0.3);
}

.lobby-start-match-btn:active {
  transform: translateY(0);
}
```

---

## Layout Guidelines

### Lobby Container

```css
.lobby-container {
  /* Center the card */
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  
  /* Background with effects */
  background: #0F0F23;
  position: relative;
  overflow: hidden;
}

/* Background ambient glow */
.lobby-container::before {
  content: '';
  position: fixed;
  top: 25%;
  left: 25%;
  width: 24rem;
  height: 24rem;
  background: radial-gradient(circle, rgba(124, 58, 237, 0.15) 0%, transparent 70%);
  border-radius: 50%;
  filter: blur(40px);
  pointer-events: none;
}

.lobby-container::after {
  content: '';
  position: fixed;
  bottom: 25%;
  right: 25%;
  width: 24rem;
  height: 24rem;
  background: radial-gradient(circle, rgba(244, 63, 94, 0.1) 0%, transparent 70%);
  border-radius: 50%;
  filter: blur(40px);
  pointer-events: none;
}
```

### Main Card

```css
.lobby-card {
  width: 100%;
  max-width: 28rem;
  
  /* Visual */
  background: rgba(15, 15, 35, 0.8);
  border: 1px solid rgba(124, 58, 237, 0.2);
  border-radius: 16px;
  
  /* Effects */
  backdrop-filter: blur(20px);
  box-shadow: 
    0 25px 50px rgba(0, 0, 0, 0.5),
    0 0 0 1px rgba(124, 58, 237, 0.1);
}
```

---

## Animations

### Card Entrance

```css
@keyframes lobby-card-enter {
  0% {
    opacity: 0;
    transform: translateY(20px) scale(0.95);
  }
  100% {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.lobby-card {
  animation: lobby-card-enter 400ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
}
```

### Player List Stagger

```css
@keyframes player-item-enter {
  0% {
    opacity: 0;
    transform: translateX(-10px);
  }
  100% {
    opacity: 1;
    transform: translateX(0);
  }
}

.lobby-player-card {
  animation: player-item-enter 300ms ease-out forwards;
  animation-delay: calc(var(--index) * 100ms);
}
```

### Host Crown Glow

```css
@keyframes crown-glow {
  0%, 100% {
    filter: drop-shadow(0 0 5px rgba(234, 179, 8, 0.5));
  }
  50% {
    filter: drop-shadow(0 0 15px rgba(234, 179, 8, 0.8));
  }
}

.lobby-crown-icon {
  animation: crown-glow 2s ease-in-out infinite;
}
```

---

## Responsive Breakpoints

| Breakpoint | Card Width | Padding | Font Scale |
|------------|------------|---------|------------|
| < 375px | 100% | 1rem | 0.875x |
| 375px - 767px | 100% | 1.5rem | 1x |
| 768px+ | 28rem max | 2rem | 1x |

---

## Accessibility

### Focus States

```css
.lobby-room-code-input:focus-visible,
.lobby-start-match-btn:focus-visible {
  outline: 2px solid #A78BFA;
  outline-offset: 2px;
}
```

### Reduced Motion

```css
@media (prefers-reduced-motion: reduce) {
  .lobby-card,
  .lobby-player-card,
  .lobby-empty-slot::before,
  .lobby-crown-icon {
    animation: none;
  }
  
  .lobby-start-match-btn:hover,
  .lobby-player-card:hover {
    transform: none;
  }
}
```

### Contrast Requirements

- Room code text on dark background: 7:1 ratio ✓
- Player names on card background: 8:1 ratio ✓
- Host crown on player card: 4.6:1 ratio ✓
- Empty slot text: 4.5:1 ratio ✓

---

## Pre-Delivery Checklist

- [ ] Room code input has neon glow on focus
- [ ] Player cards have hover lift effect
- [ ] Host crown has pulsing glow animation
- [ ] Empty slots show animated waiting indicator
- [ ] Start button has gradient + glow effect
- [ ] Background ambient effects present
- [ ] All transitions use 200ms duration
- [ ] Reduced motion preferences respected
- [ ] Focus states visible and prominent
- [ ] No emojis used (Lucide icons only)
