# Game Engine Knowledge Base

## OVERVIEW
Django game engine (10 files + 3 migrations) with models, WebSocket consumers, and business logic.

## STRUCTURE
- models.py - Django models (Game, Player, Board)
- consumers.py - WebSocket handlers for real-time updates
- views.py - REST API endpoints
- serializers.py - Django REST serializers
- urls.py - URL routing for game endpoints
- routing.py - WebSocket routing configuration
- admin.py - Django admin interface
- apps.py - Django app configuration
- migrations/ - Database schema history (3 files)

## WHERE TO LOOK
| Task | Location | Notes |
|------|----------|-------|
| Data models | models.py | Game, Player, Board entities |
| WebSocket consumers | consumers.py | Real-time game updates |
| API endpoints | views.py + urls.py | REST API patterns |
| Database schema | migrations/ | Schema version history |
| Admin interface | admin.py | Django admin models |

## CONVENTIONS
- Django REST Framework patterns
- UUID for primary keys
- Player secrets for authentication
- SQLite for dev, PostgreSQL for production

## ANTI-PATTERNS (Game Engine)
- Never store raw audio files in database
- Don't expose player secrets in API responses
- No blocking database operations in WebSocket consumers
- Avoid hard-coded genre lists - use database