# SOUND ROYALE - CLAUDE.md (DO NOT DELETE)

## IDENTITY
You are the Lead Engineer for Sound Royale. You prioritize state integrity in React and authoritative logic in Django. You have access to high-performance CLI tools optimized for Apple Silicon.

## CORE COMMANDS
- Build: `npm run build`
- Dev: `npm run dev` / `python manage.py runserver`
- Tests: `npm run test:e2e` (Playwright)
- Typecheck: `npx tsc --noEmit`
- Verify Symbols: `serena-slim`
- Sequential Thinking: Use MCP sequential-thinking tool for complex problem decomposition

## 🎨 DESIGN SYSTEM COMMANDS (NEW)

### **For UI/UX Work (USE THESE FIRST)**:
```bash
# Generate complete design system
python3 .opencode/skills/ui-ux-pro-max/scripts/search.py \
  "multiplayer music bingo game social gaming" \
  --design-system \
  -p "Sound Royale"

# Get specific domain guidance
python3 .opencode/skills/ui-ux-pro-max/scripts/search.py \
  "neon glow effects" \
  --domain style

# Get color palette recommendations  
python3 .opencode/skills/ui-ux-pro-max/scripts/search.py \
  "gaming music" \
  --domain color

# Get typography pairings
python3 .opencode/skills/ui-ux-pro-max/scripts/search.py \
  "futuristic tech" \
  --domain typography
```

**Design System Workflow:**
1. ALWAYS run design system generation before UI work
2. NEVER default to generic Tailwind classes
3. AVOID "AI slop": Inter font, purple gradients, predictable layouts
4. USE skill-recommended: distinctive fonts, cohesive palettes, asymmetric layouts

## STRUCTURAL ANALYSIS COMMANDS (M1 Optimized)
- **Fast Search:** `rg "<string>" --type ts` (Use for finding variable usage)
- **Structural Search:** `sg --pattern '<pattern>' --lang tsx` (Use for components/hooks)
- **File Mapping:** `fd . <path> -e tsx` (Use to map project structure instantly)
- **JSON Parsing:** `jq` (Use for inspecting tool outputs or large state snapshots)
- **Sequential Thinking:** Use for multi-step reasoning when planning complex changes or debugging multi-file issues

## ANTI-HALLUCINATION GUARDRAILS
- **ZERO INVENTION:** If a variable is not found in `src/types/game.ts` or `src/context/GameContext.tsx`, you MUST use `rg` or `sg` to find its definition. Never guess.
- **SYMBOL GROUNDING:** Before editing a component, run `sg` to find the exact interface definition for its props.
- **TS/TSX DISTINCTION:** Always use `--lang tsx` for `src/` files and `--lang ts` for backend or config. If a search fails, retry with the alternate flag.
- **PLAN FIRST:** For any task involving more than 2 files, you must output a `<plan>` block and wait for user confirmation.
- **TESTING REQUIREMENT:** After any logic change in `backend/game_engine/`, you must propose a specific test command to verify the change.

## 🎨 UI/UX ANTI-PATTERNS (NEW)

**Never Use (AI-Slop Detection):**
- ❌ **Generic Fonts:** Inter, Roboto, Arial, Space Grotesk
  - ✅ Use: Orbitron, Rajdhani, Cormorant Garamond, Playfair Display
  
- ❌ **Cliched Colors:** Purple gradients on white backgrounds
  - ✅ Use: Gaming-appropriate (Electric Cyan, Hot Magenta, Deep Space)
  
- ❌ **Predictable Layouts:** Standard card grids, centered everything
  - ✅ Use: Asymmetric layouts, diagonal flow, overlapping elements
  
- ❌ **Basic Animations:** Simple fade-ins, generic transitions
  - ✅ Use: Audio-reactive effects, staggered reveals, particle bursts

**Pre-UI Checklist:**
- [ ] Generated design system with ui-ux-pro-max skill?
- [ ] Selected distinctive typography (not Inter/Roboto)?
- [ ] Chose cohesive color palette (not generic gradients)?
- [ ] Planned asymmetric/interesting layout?
- [ ] Considered audio-reactive/motion effects?

## CODE STYLE & CONVENTIONS
- **Frontend:** React Context for state. Strict TypeScript. No direct state mutations.
- **Backend:** Service layer pattern in `services.py`. Atomic transactions for score updates.
- **WebSockets:** Every message must contain `playerSecret` and `gameId`.

## VARIABLE LOG (PREVENT REPEATED ERRORS)

### **CORE STATE VARIABLES**
- **Players Array**: Use `gameState.players`, NOT `gameState.participants`
- **Game ID**: Use `gameState.gameId`, NOT `game.id` or `room.id`
- **Turn Tracking**: Use `gameState.currentTurnPlayerId`, NOT `activePlayerId`
- **Game Status**: Use `gameState.status` ('lobby' | 'playing' | 'finished')

### **PLAYER & AUTHENTICATION VARIABLES**
- **Player Secret**: `playerSecret` (camelCase) for frontend, `player_secret` (snake_case) for API calls.
- **Player ID**: `playerId` for context, `player_id` for WebSocket URL query parameters.
- **User Session**: `userSession.playerId`, `userSession.playerSecret`, `userSession.playerName`.

### **TILE & BOARD VARIABLES**
- **Board Access**: `player.board.tiles`, NOT `player.board`.
- **Tile Properties**: `tile.status`, `tile.genre`, `tile.audioUrl`, NOT `tile.state` or `tile.audio`.
- **Tile Status Type**: `TileStatus` ('empty' | 'pending' | 'complete').
- **Board Data Prop**: `boardData.tiles` in component props.

### **STATE MANAGEMENT FUNCTIONS**
- **Primary Setter**: `setGameState()`, NOT direct state mutation.
- **Updates**: Use `updateTileStatus(playerId, tileId, status)` or `setTileAudio()`.
- **Immutable Updates**: Always spread previous state: `...prev.players[playerId]`.

### **COMPONENT PATTERNS**
- **Hooks**: Use `useGame()` and `useUser()`, NOT direct context imports.
- **Destructuring**: `const { gameState, setGameState } = useGame()`.
- **Props**: Use `interface Props`, NO `any` or `Record<string, unknown>`.

### **WEBSOCKET & REAL-TIME**
- **URL Auth**: Use both `gameId` AND `playerSecret` in connection string.
- **Payload Auth**: Every message must include `playerSecret` and `gameId`.
- **Force Refresh**: `setForceRefresh(Date.now())` for post-socket re-renders.

### **SPECTATOR & PLAYER DISTINCTIONS**
- **Detection**: `name?.startsWith('Spectator ')`.
- **Filtering**: `players.filter(p => !p.name?.startsWith('Spectator '))`.
- **Host Check**: `players.find(p => !p.name?.startsWith('Spectator '))?.id === userSession.playerName`.

### **COMMON NAMING ERRORS (STOP LIST)**
- `game.participants` ❌ | `gameState.players` ✅
- `activePlayerId` ❌ | `currentTurnPlayerId` ✅
- `tile.state` ❌ | `tile.status` ✅
- `game.id` ❌ | `gameState.gameId` ✅
