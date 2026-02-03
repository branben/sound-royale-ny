# GAME ENGINE - Backend Architecture

## 🏗️ SERVICE LAYER PATTERNS

**Location:** backend/game_engine/bingo_utils.py

**Pure Function Architecture:**
- `check_bingo_lines(board_tiles)` - Line pattern detection
- `calculate_bingo_score(player, completed_lines)` - Score calculation
- `check_tie_breaker(players_with_scores)` - Winner determination

**Function Signatures:**
```python
def check_bingo_lines(board_tiles) -> List[Dict[str, Any]]
def calculate_bingo_score(player, completed_lines) -> Dict[str, Any]
def check_tie_breaker(players_with_scores) -> Player
```

**Design Principles:**
- No database operations in service functions
- No side effects (pure functions)
- Input validation at caller level
- Return structured data, not model instances

---

## 📊 MODEL PATTERNS

**Location:** backend/game_engine/models.py

**Primary Key Strategy:**
- All models use UUIDField(primary_key=True, default=uuid.uuid4)
- No sequential integers for security
- Editable=False prevents manual key changes

**Enum Pattern (TextChoices):**
```python
class Status(models.TextChoices):
    LOBBY = "lobby", "Lobby"
    PLAYING = "playing", "Playing"
    FINISHED = "finished", "Finished"
```

**Relationship Patterns:**
- Foreign Keys with related_name for reverse lookups
- unique_together constraints for data integrity
- CASCADE deletion for child entities
- SET_NULL for optional relationships

**Field Naming Convention:**
- snake_case for all database fields
- Boolean fields prefixed with is_ (is_connected, is_spectator)
- Timestamp fields suffixed with _at (created_at, updated_at)

---

## 🛡️ SAFETY GUARDRAILS

**Authentication Security:**
- Never expose `player_secret` in API responses
- Validate player_secret on all WebSocket connections
- Use UUID for secrets (not sequential integers)
- Secret required for sensitive operations (kick, reset)

**Data Integrity:**
- Atomic transactions for score updates
- unique_together constraints prevent duplicates
- Proper foreign key relationships
- Validation at model and serializer level

**File Handling:**
- Never store raw audio files in database
- Use FileField for upload, URLField for access
- FileExtensionValidator for allowed formats
- Upload path organized by date (audio/%Y/%m/%d/)

**WebSocket Security:**
- Query parameter authentication (player_id, secret)
- Verify secret before setting connection state
- Track is_connected status automatically
- Broadcast state changes on connect/disconnect

---

## 🔌 WEBSOCKET ARCHITECTURE

**Location:** backend/game_engine/consumers.py

**Connection Flow:**
1. Parse query parameters: player_id, secret
2. Verify player_secret in database
3. Set player.is_connected = True
4. Join room group for broadcasts
5. Handle disconnect cleanup

**Authentication Pattern:**
```python
# URL: /ws/game/{game_id}/?player_id={player_id}&secret={player_secret}
player_id = self.scope["url_route"]["kwargs"]["player_id"]
secret = self.scope["query_string"].decode().split("secret=")[1]
```

**Broadcast Strategy:**
- Use channel_layer.group_send for room-wide updates
- Include game state in every broadcast
- Handle connect/disconnect events automatically
- Error handling for invalid authentication

---

## 💯 SCORE CALCULATION PATTERNS

**Base Scoring:**
- 100 points per completed line
- Lines: rows, columns, diagonals (8 possible)

**Bonus System:**
- Multi-line bonus: +50 points (2+ lines in single round)
- Speed bonus: +25 points (≤5 tiles for completion)

**Tie-Breaking Priority:**
1. Most completed lines wins
2. Fewest completed tiles wins (efficiency)
3. First to complete last line wins (time)
4. Random selection (final tie-breaker)

**Score Structure:**
```python
{
    "score": total_score,
    "base_score": line_points,
    "bonuses": [{"type": "multi_line", "points": 50}],
    "lines": [{"type": "row", "positions": [0, 1, 2]}]
}
```

---

## ⚠️ ANTI-PATTERNS (Backend)

**Database Operations:**
- No blocking database operations in WebSocket consumers
- No raw SQL queries (use Django ORM)
- No N+1 queries (use select_related/prefetch_related)
- No missing database transactions for multi-table updates

**Security Violations:**
- Never return player_secret in API responses
- Never hard-code authentication tokens
- Never allow file uploads without validation
- Never trust client-side data (validate server-side)

**Performance Issues:**
- No storing raw audio files in database
- No missing database indexes on foreign keys
- No inefficient queries in WebSocket handlers
- No missing pagination for large datasets

**Code Organization:**
- No business logic in views (use service layer)
- No database operations in serializers
- No missing error handling for edge cases
- No inconsistent naming conventions

---

## 🔄 STATE MANAGEMENT PATTERNS

**Game State Transitions:**
- LOBBY → PLAYING (host starts game)
- PLAYING → FINISHED (bingo achieved)
- FINISHED → LOBBY (host resets for new round)

**Player State Management:**
- is_connected toggles on WebSocket connect/disconnect
- is_spectator fixed at creation (no conversion)
- player_secret immutable after creation

**Room State Broadcasting:**
- Automatic broadcast on player connect/disconnect
- Manual broadcast on game state changes
- Include full game state in every broadcast
- Use JSON serialization for WebSocket messages

---

## 🧪 TESTING PATTERNS

**Unit Tests:**
- Test service functions with mock data
- Test model constraints and validations
- Test serializer transformations
- Test business logic edge cases

**Integration Tests:**
- Test WebSocket connection flow
- Test API endpoint authentication
- Test game state transitions
- Test file upload handling

**Test Data Strategy:**
- Use fixtures for consistent test data
- Test with valid and invalid inputs
- Test authentication failures
- Test concurrent operations