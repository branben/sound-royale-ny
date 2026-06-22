# Plan: Room Page "Template Feel" Fix + Accordion Refactor

**Created:** 2026-06-20
**Type:** Churn-reducing UX improvement — visual identity + layout
**Scope:** `src/pages/Room.tsx`, `src/components/game/PlayerView.tsx`, `src/components/game/SpectatorView.tsx`, `src/components/game/GameInfo.tsx`, `src/components/game/RoundStage.tsx`, new `src/components/ui/accordion.tsx`

---

## Design Audit: Harsk Critique via Taste-Skill Framework

### Typography Violations

| Current | Taste-Skill Rule | Problem |
|---|---|---|
| Room code `text-2xl md:text-3xl` | "Headlines lack presence. Increase size for display text, tighten letter-spacing." | Room code IS the hero element but treated like a caption |
| Section headers all-caps: "SPECTATOR", "GAME OVER", "Scoreboard", "Active Genre", "Time", "Vote Status" | "All-caps subheaders everywhere. Try lowercase italics, sentence case, or small-caps instead." | Sounds like a dashboard, not a game-show |
| `text-[10px]` labels everywhere (match type, spectator count, progress) | "Missing letter-spacing adjustments. Use positive tracking for small caps." | Illegible on mobile, feels like fine print |
| No display font usage in body content | "Introduce Medium (500) and SemiBold (600) for more subtle hierarchy." | Everything is either `font-bold` or `font-medium` — no nuance |
| GameInfo timer `text-base font-mono font-bold` | "Numbers in proportional font. Use monospace or tabular figures for data." | Timer uses proportional mono — numbers jump around as they change |

### Color & Surface Violations

| Current | Taste-Skill Rule | Problem |
|---|---|---|
| Every card: `border-zinc-700 bg-zinc-900 rounded-xl` | "Generic card look (border + shadow + white background). Remove the border, or use only background color, or use only spacing." | Every component looks identical — same border, same bg, same radius |
| Flat `bg-background` (#09090b) | "Pure #000000 background. Replace with off-black, dark charcoal, or tinted dark." | #09090b is essentially pure black — no warmth, no character |
| `shadow-lg` on lobby card | "Tint shadows to match the background hue." | Generic black shadow on dark bg — invisible |
| No texture or grain | "Flat design with zero texture. Add subtle noise, grain, or micro-patterns." | Surfaces feel sterile, digital-flat |
| Match type badge `bg-yellow-500/15 text-yellow-400` | "Max 1 accent color. Saturation < 80%." | Yellow + red + green + blue + purple(destructive) = 5 accent colors in one view |

### Layout Violations

| Current | Taste-Skill Rule | Problem |
|---|---|---|
| Lobby: centered card. Room: centered card. | "Section-Layout-Repetition Ban. Once you use a layout family, it can appear at most ONCE on the page." | Two pages, same layout — feels templated |
| PlayerView: `lg:grid-cols-[10rem_1fr]` sidebar | "Dashboard always has a left sidebar. Try top navigation, a floating command menu, or a collapsible panel." | It's a game, not a dashboard. Sidebar wastes space |
| SpectatorView: 2-column grid with pill selector | "Three equal card columns as feature row. This is the most generic AI layout." | Two equal boards side-by-side = template default |
| Everything `p-2` / `gap-1.5` / `mb-1` | "Missing whitespace. Double the spacing. Let the design breathe." | Cramped, dense, feels unfinished |
| No overlap or depth | "No overlap or depth. Elements sit flat next to each other. Use negative margins to create layering." | Everything is a flat rectangle |
| Cards same height forced by grid | "Cards of equal height forced by flexbox. Allow variable heights." | Player info card same height as board — wastes space |
| RoundStage is a card with icon + text | "Not a card — just a text row with a bottom border." (design spec) | Too many cards. Round stage should be a text row |

### Interactivity Violations

| Current | Taste-Skill Rule | Problem |
|---|---|---|
| Buttons: `hover:bg-zinc-800` or `hover:opacity-90` | "No hover states on buttons. Add background shift, slight scale, or translate." | Barely perceptible hover — feels dead |
| No `active:scale` on most buttons | "No active/pressed feedback. Add scale(0.98) or translateY(1px)." | Only Start Battle has `active:scale-[0.97]` — others feel broken |
| Accordion (new) will use default shadcn styling | "Uniform border-radius on everything. Vary the radius." | Must override to match design system |
| `animate-ping` on waiting dot | "Perpetual Micro-Interactions... Not every card needs an infinite loop." | Acceptable ONLY for live status — not decoration |

### Content Violations

| Current | Taste-Skill Rule | Problem |
|---|---|---|
| "No spectators yet." | "No empty states. An empty dashboard showing nothing is a missed opportunity." | Lifeless, gives up on engagement |
| "Waiting for contestants" | "AI copywriting cliches. Write plain, specific language." | Vague, doesn't tell player what to do |
| "Match Over" | "Passive voice. Use active voice." | "The match has ended" or "Good game!" is better |
| "Play Again" | "NO DUPLICATE CTA INTENT. Two CTAs with the same intent on one page." | Room.tsx has "Play Again" in overlay AND GameInfo sidebar |

### Strategic Omissions

| Missing | Taste-Skill Rule | Impact |
|---|---|---|
| No loading skeleton | "No loading states. Replace generic circular spinners with skeleton loaders." | Jarring flash from loading → content |
| No hover on player names in GameInfo | "Dead links. Buttons that link to #." | Player names are clickable but no hover = feels broken |
| No focus ring styles | "Missing focus ring. Ensure visible focus indicators for keyboard navigation." | Accessibility fail |
| No `scroll-behavior: smooth` | "Scroll jumping. Anchor clicks jump instantly." | Jump-to-board in spectator view is jarring |

---

## Solution: Three-Part Fix

### Part A: Anti-Template — Break the "Dashboard" Pattern

The room page commits the cardinal sin of AI design: **everything looks the same**. Same card style, same spacing, same layout family. The fix is to introduce **visual variety** and **intentional composition**.

### Part B: Accordion Layout — Progressive Disclosure

Replace flat grids with focused, expandable sections. One thing at a time.

### Part C: Game-Show Language — Copy & Tone

Replace dashboard-speak with game-show energy.

---

## Part A: Anti-Template Visual Identity

### A1. Break the Card Monopoly

**Problem:** Every element is a card with `border-zinc-700 bg-zinc-900 rounded-xl`. They all look the same.

**Solution:** Vary the surface treatment. Not everything needs a border.

```tsx
// BEFORE: Everything is a card
<div className="border border-zinc-700 bg-zinc-900 rounded-xl p-4">...</div>

// AFTER: Use different surfaces for different hierarchy levels

// Level 1: Hero elements (room code, title) — NO card, just typography
<p className="font-mono text-4xl md:text-5xl font-bold tracking-[0.3em] text-zinc-100">
  {room.code}
</p>

// Level 2: Primary surfaces (main card) — subtle background, no border
<div className="bg-zinc-900 rounded-xl p-6">
  ...
</div>

// Level 3: Secondary surfaces (sidebar sections, accordion items) — tinted bg
<div className="bg-zinc-800/50 rounded-lg px-4 py-3">
  ...
</div>

// Level 4: Inline elements (badges, dots) — no container at all
<span className="inline-flex items-center gap-1 rounded-full bg-yellow-500/15 px-2 py-0.5 text-xs font-medium text-yellow-400">
  Ranked
</span>
```

### A2. Background — Break the Flat Black

**Problem:** `bg-background` (#09090b) is pure flat black. No atmosphere.

**Solution:** Layer subtle depth.

```tsx
<div className="h-dvh flex flex-col bg-background relative">
  {/* Ambient gradient — very subtle */}
  <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/[0.03] via-transparent to-transparent pointer-events-none" />
  
  {/* Grain texture — breaks digital flatness */}
  <div className="absolute inset-0 opacity-[0.015] pointer-events-none bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzMDAiIGhlaWdodD0iMzAwIj48ZmlsdGVyIGlkPSJhIiB4PSIwIiB5PSIwIj48ZmVUdXJidWxlbmNlIGJhc2VGcmVxdWVuY3k9Ii43NSIgc3RpdGNoVGlsZXM9InN0aXRjaCIgdHlwZT0iZnJhY3RhbE5vaXNlIi8+PGZpbHRlci8+PHJlY3Qgd2lkdGg9IjMwMCUiIGhlaWdodD0iMzAwIiBmaWxsPSIjZmZmIiBmaWxsLW9wYWNpdHk9IjAuMDMiLz48L3N2Zz4=')]" />
  
  {/* Content */}
</div>
```

**Design rationale:** The lobby uses `from-primary/8` gradient. The room uses `from-primary/[0.03]` — 2.5× more subtle because the room has more content. The grain texture at 1.5% opacity breaks the "digital flat" feel without being visible — it adds warmth.

### A3. Typography — Introduce Display Hierarchy

**Problem:** Everything is body font. No display moments.

**Solution:** Room code becomes a display element. Section headers drop ALL-CAPS.

```tsx
// Room code — display element, not a caption
<p className="font-mono text-4xl md:text-5xl font-bold tracking-[0.3em] text-zinc-100">
  {room.code}
</p>
<p className="text-xs text-zinc-500 mt-1">Send this to invite players</p>

// Section headers — sentence case, not ALL-CAPS
// BEFORE: "SPECTATOR", "GAME OVER", "Scoreboard"
// AFTER:
<h2 className="text-lg font-semibold text-zinc-100">Spectator view</h2>
<h2 className="text-lg font-semibold text-zinc-100">Match ended</h2>
<h3 className="text-sm font-medium text-zinc-100">Scoreboard</h3>

// Timer — tabular numbers so digits don't jump
<div className="font-mono text-xl tabular-nums text-zinc-100">
  {formattedTime ?? '--:--'}
</div>

// Data — use medium/semibold instead of bold for everything
<p className="text-sm font-medium text-zinc-400">Active genre</p>
<p className="text-lg font-semibold text-zinc-100">{displayGenre}</p>
```

### A4. Whitespace — Double It

**Problem:** `p-2`, `gap-1.5`, `mb-1` everywhere. Feels cramped.

**Solution:** Match lobby's generous spacing.

```tsx
// BEFORE
<div className="p-4 space-y-2">
  <div className="flex items-center gap-1.5 mb-1">

// AFTER
<div className="p-6 space-y-4">
  <div className="flex items-center gap-2 mb-2">
```

**Specific spacing changes:**
- Lobby card padding: `p-4` → `p-6`
- Lobby internal spacing: `space-y-2` → `space-y-4`
- Element gaps: `gap-1.5` → `gap-2`
- Margins between sections: `mb-2` → `mb-3`
- Button padding: `h-11` → `h-12` (matches lobby's "Start Match")

### A5. Hover & Active States — Make It Feel Alive

**Problem:** `hover:bg-zinc-800` is barely perceptible on `bg-zinc-900`.

**Solution:** Visible hover + tactile press.

```tsx
// Secondary button — visible hover
<Button className="... hover:bg-zinc-700 hover:translate-y-[-1px] active:translate-y-0 active:scale-[0.98] transition-all duration-150">

// Accordion trigger — clear hover state
<AccordionTrigger className="... hover:bg-zinc-700 hover:translate-x-1 active:translate-x-0 transition-all duration-150">

// Player name (clickable) — subtle hover
<button className="... hover:text-player-1 hover:underline underline-offset-2 transition-colors">
```

### A6. Accent Color Lock — One Accent, One Page

**Problem:** Red (CTA), yellow (ranked), green (connected/success), blue (player 2), purple (destructive) — 5 accents competing.

**Solution:** Lock to red as THE accent. Others are semantic only.

```tsx
// Primary accent (THE accent): red-500 — CTAs, active states, player 1
// Semantic colors (NOT accents, just status):
// - green: success/complete/connected (not a design accent, a status indicator)
// - yellow: warning/pending/ranked (not a design accent, a status indicator)
// - blue: player 2 color (player identity, not page accent)
// - destructive: errors (semantic, not decorative)

// Rule: Only red-500 gets "accent" treatment (shadows, glow, hover effects)
// Green/yellow/blue are flat — they communicate state, not brand
```

---

## Part B: Accordion Layout

### B1. Install shadcn Accordion

```bash
npx shadcn@latest add accordion
```

### B2. SpectatorView — Board Accordion (Replaces 2-Col Grid)

**Current:** Two boards side-by-side in a grid. Pill selector above.
**New:** One board at a time. Accordion with player summary in the trigger.

```tsx
<div className="flex flex-col h-full">
  {/* Status bar — minimal, no card */}
  <div className="flex items-center justify-between mb-3">
    <span className="text-sm font-medium text-zinc-100">Spectator view</span>
    {gameState.roundState?.votingOpen && (
      <span className="inline-flex items-center gap-1 rounded-full bg-green-500/15 px-2.5 py-0.5 text-xs font-medium text-green-400">
        Vote open
      </span>
    )}
  </div>

  {/* Player boards — accordion */}
  <Accordion type="single" collapsible defaultValue={producers[0]?.id} className="flex flex-col gap-2">
    {producers.map((player) => {
      const colorIndex = playerColors.get(player.id) ?? 0;
      const progress = leaderboard.find(e => e.player.id === player.id);
      return (
        <AccordionItem key={player.id} value={player.id} className="border-none">
          <AccordionTrigger className="rounded-lg bg-zinc-800 px-4 py-3 hover:bg-zinc-700 hover:translate-x-1 data-[state=open]:bg-zinc-700 data-[state=open]:rounded-b-none transition-all duration-150">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className={`flex h-9 w-9 items-center justify-center rounded-full bg-player-${colorIndex + 1}/20 border border-player-${colorIndex + 1}/40`}>
                <span className={`text-sm font-bold text-player-${colorIndex + 1}`}>
                  {player.name.charAt(0)}
                </span>
              </div>
              <div className="min-w-0 flex-1 text-left">
                <p className="text-sm font-semibold text-zinc-100 truncate">{player.name}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <div className="flex-1 h-1 rounded-full bg-zinc-700 overflow-hidden max-w-[5rem]">
                    <div
                      className={`h-full rounded-full bg-player-${colorIndex + 1} transition-all duration-300`}
                      style={{ width: `${progress?.progress ?? 0}%` }}
                    />
                  </div>
                  <span className="text-xs text-zinc-500 tabular-nums">{progress?.completeTiles ?? 0}/9</span>
                </div>
              </div>
            </div>
          </AccordionTrigger>
          <AccordionContent className="rounded-b-lg bg-zinc-900 px-2 pb-3 pt-1">
            <BingoBoard
              playerId={player.id}
              playerName={player.name}
              boardData={player.board}
              isInteractive={false}
              playerColorIndex={colorIndex}
            />
          </AccordionContent>
        </AccordionItem>
      );
    })}
  </Accordion>

  {/* Voting — below boards, not buried in a drawer */}
  {isCurrentUserSpectator && votingOpen && (
    <div className="mt-3">
      <VotingPanel ... />
    </div>
  )}
</div>
```

### B3. GameInfo — Accordion on Mobile, Sectioned on Desktop

**Mobile:** Accordion below round stage replaces the bottom dock.
**Desktop:** Sticky sidebar with accordion sections (not a flat list).

```tsx
// Mobile (in Room.tsx playing state)
<Accordion type="single" collapsible className="lg:hidden">
  <AccordionItem value="leaderboard" className="border-none">
    <AccordionTrigger className="rounded-lg bg-zinc-800 px-4 py-3 text-sm font-medium text-zinc-100 hover:bg-zinc-700 hover:translate-x-1 transition-all">
      <div className="flex items-center gap-2">
        <Trophy className="h-4 w-4 text-yellow-500" />
        Leaderboard
      </div>
    </AccordionTrigger>
    <AccordionContent className="rounded-b-lg bg-zinc-900 px-4 py-3">
      <LeaderboardCompact players={activePlayers} />
    </AccordionContent>
  </AccordionItem>

  <AccordionItem value="audience" className="border-none">
    <AccordionTrigger className="rounded-lg bg-zinc-800 px-4 py-3 text-sm font-medium text-zinc-100 hover:bg-zinc-700 hover:translate-x-1 transition-all">
      <div className="flex items-center gap-2">
        <Users className="h-4 w-4 text-zinc-400" />
        Audience
        <span className="text-xs text-zinc-500">({spectators.length})</span>
      </div>
    </AccordionTrigger>
    <AccordionContent className="rounded-b-lg bg-zinc-900 px-4 py-3">
      {spectators.length === 0 ? (
        <div className="flex flex-col items-center py-3 text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-dashed border-zinc-600 mb-2">
            <Users className="h-5 w-5 text-zinc-600" />
          </div>
          <p className="text-sm text-zinc-400">No audience yet</p>
          <p className="text-xs text-zinc-500">Share the link to invite spectators</p>
        </div>
      ) : (
        <SpectatorList spectators={spectators} />
      )}
    </AccordionContent>
  </AccordionItem>
</Accordion>

// Desktop GameInfo — accordion sections, not flat card
<Card className="bg-zinc-900 sticky top-4">
  <CardContent className="p-4">
    <Accordion type="multiple" defaultValue={['scoreboard', 'status']} className="flex flex-col gap-1">
      <AccordionItem value="scoreboard" className="border-none">
        <AccordionTrigger className="text-sm font-medium text-zinc-100 py-2 hover:no-underline hover:translate-x-1 transition-all">
          Scoreboard
        </AccordionTrigger>
        <AccordionContent>
          <PlayerList activePlayers={activePlayers} />
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="spectators" className="border-none">
        <AccordionTrigger className="text-sm font-medium text-zinc-100 py-2 hover:no-underline hover:translate-x-1 transition-all">
          Spectators ({spectators.length})
        </AccordionTrigger>
        <AccordionContent>
          <SpectatorList spectators={spectators} />
          <ShareButton />
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="status" className="border-none">
        <AccordionTrigger className="text-sm font-medium text-zinc-100 py-2 hover:no-underline hover:translate-x-1 transition-all">
          Game status
        </AccordionTrigger>
        <AccordionContent>
          <GameStatus />
          <Timer />
          {isHost && <NextRoundButton />}
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  </CardContent>
</Card>
```

### B4. PlayerView — No Sidebar, Top Bar Instead

**Current:** `lg:grid-cols-[10rem_1fr]` — sidebar wastes space, forces equal height.
**New:** Player info as a horizontal bar on desktop (not a sidebar), accordion on mobile.

```tsx
// PlayerView.tsx — new structure
<div className="flex flex-col gap-3">
  {/* Desktop: horizontal player bar (NOT a sidebar) */}
  <div className="hidden lg:flex items-center gap-3 rounded-lg bg-zinc-900 px-4 py-3">
    <div className={`flex h-9 w-9 items-center justify-center rounded-full ${playerAccentClasses}`}>
      <Music className="h-4 w-4" />
    </div>
    <div className="min-w-0 flex-1">
      <p className="text-sm font-semibold text-zinc-100 truncate">{playerData.name}</p>
      <div className="flex items-center gap-2">
        <TitleBadge title={playerData.currentTitle} compact />
        <ConnectionStatus />
      </div>
    </div>
    <ScoreDisplay compact scoreInfo={playerData.scoreInfo} />
    {gameState.roundState?.currentTileGenre && (
      <p className="text-xs text-zinc-400">
        Upload for <span className={`font-semibold ${playerTextAccent}`}>{gameState.roundState.currentTileGenre}</span>
      </p>
    )}
  </div>

  {/* Mobile: accordion */}
  <div className="lg:hidden">
    <Accordion type="single" collapsible>
      <AccordionItem value="info" className="border-none">
        <AccordionTrigger className="rounded-lg bg-zinc-800 px-4 py-3 hover:bg-zinc-700 hover:translate-x-1 transition-all">
          <div className="flex items-center gap-3">
            <div className={`flex h-8 w-8 items-center justify-center rounded-full ${playerAccentClasses}`}>
              <Music className="h-4 w-4" />
            </div>
            <span className="text-sm font-semibold text-zinc-100">{playerData.name}</span>
            <span className="ml-auto text-xs text-zinc-400 tabular-nums">
              {playerData.scoreInfo?.score ?? 0} pts
            </span>
          </div>
        </AccordionTrigger>
        <AccordionContent className="rounded-b-lg bg-zinc-900 px-4 py-3">
          <PlayerStats player={playerData} />
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  </div>

  {/* Board — full width */}
  <BingoBoard ... />
</div>
```

### B5. Lobby State — Accordion Join Flow

```tsx
// Room.tsx — lobby state
<div className="flex flex-col items-center px-4 py-8">
  {/* Title zone — display font, not header bar */}
  <h1 className="text-4xl md:text-5xl font-['Righteous'] tracking-tight text-zinc-100 mb-1">
    BATTLE ROOM
  </h1>
  <p className="text-sm text-zinc-500 mb-8">
    {hasCurrentPlayer ? 'You are in the arena' : 'Choose your role'}
  </p>

  {/* Main card — wider, more breathing room */}
  <div className="w-full max-w-[32rem] rounded-xl bg-zinc-900 p-6">
    {hasCurrentPlayer ? (
      <PlayerInRoomState />
    ) : (
      <div className="space-y-5">
        {/* Room code — display element */}
        <div className="text-center">
          <p className="font-mono text-4xl md:text-5xl font-bold tracking-[0.3em] text-zinc-100">
            {room.code}
          </p>
          <p className="text-xs text-zinc-500 mt-2">Send this to invite players</p>
          <div className="mt-2">
            <MatchTypeBadge />
          </div>
        </div>

        {/* Join accordion — CTA is the trigger */}
        <Accordion type="single" collapsible>
          <AccordionItem value="join" className="border-none">
            <AccordionTrigger className="h-12 rounded-lg bg-red-500 hover:bg-red-600 hover:translate-y-[-1px] text-white text-base font-['Righteous'] tracking-wider uppercase justify-center data-[state=open]:rounded-b-none active:translate-y-0 active:scale-[0.98] transition-all duration-150 shadow-lg shadow-red-500/20">
              <Play className="mr-2 h-5 w-5" />
              Join Battle
            </AccordionTrigger>
            <AccordionContent className="rounded-b-lg bg-zinc-800 px-4 py-4">
              <div className="grid grid-cols-1 gap-2">
                <Button onClick={handleJoinAsPlayer} className="h-12 bg-red-500 hover:bg-red-600 hover:translate-y-[-1px] active:translate-y-0 active:scale-[0.98] text-white text-sm font-semibold transition-all duration-150">
                  <Users className="mr-2 h-4 w-4" />
                  Join as Player
                </Button>
                <Button onClick={handleJoinAsSpectator} className="h-12 border-zinc-600 text-zinc-100 hover:bg-zinc-700 hover:translate-y-[-1px] active:translate-y-0 active:scale-[0.98] text-sm font-semibold transition-all duration-150">
                  <Settings className="mr-2 h-4 w-4" />
                  Spectate
                </Button>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
    )}
  </div>
</div>
```

### B6. Round Stage — Text Row, Not Card

Per design spec: "Not a card — just a text row with a bottom border."

```tsx
// RoundStage.tsx — simplified
<section className="border-b border-zinc-700/50 pb-3 mb-3">
  <div className="flex items-center justify-between">
    <div className="flex items-center gap-3">
      <span className="text-xs text-zinc-500 uppercase tracking-wider">Round {roundNumber}</span>
      <span className="text-lg font-semibold text-zinc-100">{displayGenre}</span>
    </div>
    <div className="flex items-center gap-3">
      <span className="font-mono text-lg tabular-nums text-zinc-100">{formattedTime ?? '--:--'}</span>
      {votingOpen && (
        <span className="inline-flex items-center gap-1 rounded-full bg-green-500/15 px-2 py-0.5 text-xs font-medium text-green-400">
          Vote open
        </span>
      )}
    </div>
  </div>
</section>
```

---

## Part C: Game-Show Language

| Before (Dashboard) | After (Game-Show) | Where |
|---|---|---|
| "No spectators yet." | "No audience yet — share the link to invite" | SpectatorView empty state |
| "Waiting for contestants" | "Waiting for opponent..." | Room.tsx lobby |
| "Match Over" | "Good game!" | Match-end overlay |
| "Play Again" (×2 on page) | "Play Again" (overlay only), "Next Match" (GameInfo) | Remove duplicate CTA |
| "Scoreboard" | "Leaderboard" | GameInfo section header |
| "Active Genre" | "This round: {genre}" | RoundStage |
| "Vote Status" | "Voting" | RoundStage |
| "Round Mode" | "Casual mode" / "Ranked voting" | RoundStage |
| "You're in battle!" | "You're in the arena" | Room.tsx lobby |
| "Join Battle" (small button) | "Join Battle" (full-width, Righteous, shadow) | Room.tsx lobby CTA |
| "SPECTATOR" (all-caps badge) | "Spectator view" (sentence case) | SpectatorView header |
| "GAME OVER" (all-caps) | "Match ended" (sentence case) | GameOverScreen |
| "WINNER!" (all-caps) | "{name} wins!" (sentence case) | WinnerAnnouncement |

---

## Accordion Component Styling

After `npx shadcn@latest add accordion`, override to match design system:

```tsx
// src/components/ui/accordion.tsx — key overrides

// AccordionItem — no default border
className="border-none"

// AccordionTrigger — zinc palette, no underline, visible hover
className={cn(
  "flex flex-1 items-center justify-between py-4 text-sm font-medium transition-all hover:no-underline",
  "rounded-lg bg-zinc-800 px-4 py-3 text-zinc-100",
  "hover:bg-zinc-700 hover:translate-x-1",
  "data-[state=open]:rounded-b-none data-[state=open]:bg-zinc-700",
  "active:translate-x-0",
)}

// AccordionContent — solid bg, border continuation
className={cn(
  "overflow-hidden text-sm",
  "rounded-b-lg bg-zinc-900 px-4 py-3",
  "data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down",
)}

// Chevron — zinc-400, subtle
className="h-4 w-4 shrink-0 text-zinc-400 transition-transform duration-200"
```

---

## Cleanup: Remove Deprecated Patterns

| Pattern | Location | Action |
|---|---|---|
| `animate-ping` on waiting dot | Room.tsx:738 | Keep — communicates "live waiting" (state, not decoration) |
| GSAP `stagger` on lobby buttons | Room.tsx:567-575 | Remove — single 200ms fade-in |
| GSAP `stagger` on bingo boards | Room.tsx:591-597 | Remove — boards appear simultaneously |
| `animate-glow` on victory banner | GameInfo.tsx:475 | Remove — replace with solid border |
| `animate-pulse` on timer | GameInfo.tsx:274 | Remove — color change only |
| `animate-pulse` on lobby status dot | GameInfo.tsx:255 | Remove — static dot |
| `shadow-lg` on lobby card | Room.tsx:712 | Remove — no shadow needed (no card border) |
| MobileGameDock | Room.tsx:143-167 | Remove for playing state (replaced by accordions) |
| `overflow-hidden` on root | Room.tsx:689 | Remove — was for GSAP, no longer needed |
| PlayerView sidebar | PlayerView.tsx:165 | Replace with horizontal bar |
| Duplicate "Play Again" | Room.tsx + GameInfo.tsx | Keep overlay version, rename GameInfo to "Next Match" |
| ALL-CAPS section headers | Multiple files | Convert to sentence case |

---

## Files Changed

| File | Change |
|------|--------|
| `src/components/ui/accordion.tsx` | New — shadcn accordion with design system overrides |
| `src/pages/Room.tsx` | Major refactor — show header, accordion join, accordion mobile info, remove GSAP stagger, new copy |
| `src/components/game/SpectatorView.tsx` | Refactor — board accordion instead of 2-col grid, empty state |
| `src/components/game/PlayerView.tsx` | Refactor — horizontal bar on desktop, accordion on mobile (no sidebar) |
| `src/components/game/GameInfo.tsx` | Refactor — accordion sections, remove glow/pulse, sentence-case headers |
| `src/components/game/RoundStage.tsx` | Simplify — text row instead of card, tabular-nums timer |
| `src/components/game/MobileGameDock.tsx` | Simplify — lobby only |
| `src/components/game/__tests__/*.test.tsx` | Update snapshots |

---

## Churn Reduction Rationale

| Issue | Churn Cause | Fix |
|---|---|---|
| Room looks like a template | Players don't feel the "show" energy | Display title, gradient bg, varied surfaces, whitespace |
| Every element looks the same | Card fatigue — everything is `border-zinc-700 bg-zinc-900` | Vary surfaces: no border on hero, tinted bg on secondary |
| ALL-CAPS headers everywhere | Feels like a dashboard, not a game | Sentence case with personality |
| Cramped spacing | Feels cheap, unfinished | Double spacing to match lobby |
| No hover feedback | Interface feels dead | Visible hover + tactile press states |
| Spectator boards too small | Can't read tiles on mobile | One board at a time = full width |
| No mobile leaderboard | Players feel disconnected | Accordion section always accessible |
| Flat empty states | Feels unfinished/broken | Dashed borders, two-line messaging, icons |
| Sidebar wastes space | Feels like a productivity app | Horizontal bar on desktop, accordion on mobile |
| Duplicate CTAs | Confusing — which one to click? | One CTA per intent |
| Round stage is another card | Too many cards | Text row with border-bottom |

---

## Validation Gates

- [ ] `npm run verify:types` — clean
- [ ] `npm run lint` — no new errors (pre-existing 77 unchanged)
- [ ] `npm run test` — 224+ passing, no new failures
- [ ] `npm run format:write` — clean
- [ ] Visual QA: mobile (375px) — accordion expands/collapses, title visible, CTA prominent
- [ ] Visual QA: desktop (1024px) — sidebar replaced with horizontal bar, round stage is text-only
- [ ] Design system: no new glow/blur/stagger/infinite-animation (except animate-ping for waiting state)
- [ ] Accessibility: accordion triggers are keyboard-navigable (shadcn/Radix default)
- [ ] Lobby still looks the same (no regressions from shared components)
- [ ] Taste-Skill pre-flight: no ALL-CAPS headers, no duplicate CTAs, no generic card look, whitespace doubled
