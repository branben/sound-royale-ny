# Game Engine Knowledge Base

## OVERVIEW
Django game engine with models, WebSocket consumers, and core business logic for multiplayer music bingo.

## STRUCTURE
```
game_engine/
├── models.py           # Django models (Game, Player, Board)
├── consumers.py        # WebSocket handlers for real-time updates
├── views.py           # REST API endpoints
├── serializers.py     # Django REST serializers
├── urls.py           # URL routing for game endpoints
├── routing.py        # WebSocket routing configuration
├── admin.py          # Django admin interface
├── apps.py           # Django app configuration
└── migrations/        # Database schema history (3 files)
```

## WHERE TO LOOK
| Task | Location | Notes |
|------|----------|-------|
| Data models | models.py | Game, Player, Board entities |
| WebSocket consumers | consumers.py | Real-time game updates |
| API endpoints | views.py + urls.py | REST API patterns |
| Database schema | migrations/ | Schema version history |
| Admin interface | admin.py | Django admin models |

## CODE MAP
| Symbol | Type | Location | Refs | Role |
|--------|------|----------|------|------|
| Game | Model | models.py | High | Core game entity |
| Player | Model | models.py | High | Player state management |
| Board | Model | models.py | Medium | Bingo board state |
| GameConsumer | Consumer | consumers.py | High | WebSocket game handler |

## CONVENTIONS
- Django REST Framework patterns
- UUID for primary keys
- PlayerSecret authentication
- Async WebSocket consumers
- Database-level game state validation

## ANTI-PATTERNS (GAME ENGINE)
- Never store raw audio files in database - use file storage
- Don't expose playerSecret in API responses
- No blocking database operations in WebSocket consumers
- Avoid hard-coded genre lists - use database
- Never trust client-side game state - validate server-side

## UNIQUE STYLES
- Multiplayer bingo game logic with tile completion detection
- Real-time game state synchronization via WebSockets
- PlayerSecret-based secure authentication
- Audio file management and validation