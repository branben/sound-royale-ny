# VARIABLE LOG - Deep Reference

## 🎮 CORE STATE VARIABLES (from GameState interface)

**GameState Interface:**
- gameId: string - Unique game identifier
- status: 'lobby' | 'playing' | 'finished' - Game phase
- players: Record<string, Player> - Player lookup by ID
- currentRound: number - Current round number
- winner?: string - Winning player ID
- bingoAchievements?: BingoStatus[] - Completed bingo patterns

**BingoStatus Interface:**
- playerId: string - Player who achieved bingo
- lines: Array<{type: string, positions: number[]}> - Completed line patterns
- isDoubleBingo: boolean - Multiple lines in single round

---

## 🔐 PLAYER AUTH VARIABLES

**Frontend (TypeScript - camelCase):**
- playerSecret: string - Auth token for WebSocket reconnection
- isConnected?: boolean - Real-time connection status
- isSpectator?: boolean - Spectator vs participant flag
- joined_at?: string - When player joined room

**Backend (Django - snake_case):**
- player_secret: UUIDField - Same secret, different naming convention
- is_connected: BooleanField - Presence tracking for WebSocket
- is_spectator: BooleanField - Spectator vs participant flag
- joined_at: DateTimeField - Auto-populated join timestamp

---

## 🎨 TILE/BOARD VARIABLES

**Tile Interface:**
- id: string - Unique tile identifier
- genre: string - Music genre constraint
- status: TileStatus - 'empty' | 'pending' | 'complete'
- audioUrl?: string - URL to uploaded audio file

**TileStatus Type:**
- 'empty' - No audio submitted yet
- 'pending' - Audio uploaded, processing
- 'complete' - Audio successfully submitted

**BoardData Interface:**
- tiles: Tile[] - Array of 9 tiles (3x3 grid)

**GENRES Constant:**
- ['Phonk', 'Trap', 'Lo-Fi', 'House', 'Drill', 'R&B', 'EDM', 'Jazz', 'Ambient']
- Genre type: typeof GENRES[number]

---

## 💰 SCORE VARIABLES

**ScoreInfo Interface:**
- score: number - Total calculated score
- base_score: number - Points from completed lines (100 per line)
- bonuses: Array<{type: string, points: number}> - Bonus point breakdown
- lines: Array<{type: string, positions: number[]}> - Completed bingo patterns

**Bonus Types:**
- 'multi_line' - +50 points for 2+ lines in single round
- 'speed' - +25 points for completion within 5 tiles

**Line Types:**
- 'row' - Horizontal bingo (0-2, 3-5, 6-8)
- 'column' - Vertical bingo (0,3,6 | 1,4,7 | 2,5,8)
- 'diagonal' - Diagonal bingo (0,4,8 | 2,4,6)

---

## 🌐 API RESPONSE TYPES

**RoomResponse Interface:**
- id: string - Room UUID
- name: string - Display name
- status: 'lobby' | 'playing' | 'finished' - Game phase
- current_round: number - Current round number
- players?: Array<PlayerResponse> - Player list

**CreateRoomResponse Interface:**
- id: string - Created room UUID
- name: string - Room display name
- player_id: string - Creator's player UUID
- player_secret: string - Creator's auth token

**PlayerResponse (API format):**
- id: string - Player UUID
- name: string - Display name
- avatar?: string - Profile picture URL
- tiles?: Tile[] - Player's tile board
- player_secret?: string - Auth token (create only)
- is_connected?: boolean - WebSocket status
- is_spectator?: boolean - Participant type
- room?: string - Room UUID
- joined_at: string - Join timestamp

---

## 🏠 ROOM VARIABLES

**Room Interface (Frontend):**
- id: string - Room UUID
- name: string - Display name
- status: 'lobby' | 'playing' | 'finished' - Game phase
- currentRound: number - Current round number
- players?: Player[] - Player list

**Room Model (Backend):**
- id: UUIDField - Primary key
- code: CharField - 4-digit room code
- name: CharField - Display name
- status: TextChoices - LOBBY/PLAYING/FINISHED
- current_round: PositiveIntegerField - Round counter
- winner: ForeignKey - Reference to winning Player
- created_at: DateTimeField - Creation timestamp
- updated_at: DateTimeField - Last modification

---

## ⚠️ NAMING CONVENTIONS

**Frontend (TypeScript - camelCase):**
- gameState.players
- gameState.gameId
- currentTurnPlayerId
- tile.status
- playerSecret
- isConnected
- isSpectator
- audioUrl
- joinedAt

**Backend (Django - snake_case):**
- game.participants
- game.id
- active_player_id
- tile.status
- player_secret
- is_connected
- is_spectator
- audio_url
- joined_at

**API Transformation Layer:**
- Location: src/services/api.ts
- Function: transformPlayer() handles FE/BE field mapping
- Function: transformTile() handles tile field mapping
- All API responses automatically converted to frontend format

---

## 📊 POSITION MAPPING

**3x3 Grid Positions (0-8):**
```
0 | 1 | 2
---------
3 | 4 | 5
---------
6 | 7 | 8
```

**Row Patterns:**
- Row 0: [0, 1, 2]
- Row 1: [3, 4, 5]
- Row 2: [6, 7, 8]

**Column Patterns:**
- Col 0: [0, 3, 6]
- Col 1: [1, 4, 7]
- Col 2: [2, 5, 8]

**Diagonal Patterns:**
- Diag 1: [0, 4, 8] (top-left to bottom-right)
- Diag 2: [2, 4, 6] (top-right to bottom-left)