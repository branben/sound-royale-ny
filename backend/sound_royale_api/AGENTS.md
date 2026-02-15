# Django API Configuration Knowledge Base

## OVERVIEW
Django project configuration for API endpoints, WebSocket routing, and environment management.

## STRUCTURE
```
sound_royale_api/
├── settings.py         # Django settings + environment config
├── asgi.py            # ASGI config + WebSocket routing
├── urls.py            # Main URL routing patterns
├── wsgi.py            # WSGI deployment config
└── manage.py          # Django CLI commands
```

## WHERE TO LOOK
| Task | Location | Notes |
|------|----------|-------|
| Django settings | settings.py | Environment variables + middleware |
| API endpoints | urls.py | URL pattern mapping |
| WebSocket config | asgi.py | Channel layers + routing |
| Development setup | manage.py | Django management commands |

## CONVENTIONS
- Environment variables via python-decouple
- CORS enabled for localhost development
- ASGI for WebSocket support with Channels
- SQLite for local development
- PostgreSQL for production

## ANTI-PATTERNS (API CONFIGURATION)
- Never commit SECRET_KEY to version control
- Don't run with DEBUG=True in production
- No hardcoded database URLs - use environment variables
- Avoid exposing admin endpoints in production
- Never disable CORS validation without security review

## UNIQUE STYLES
- WebSocket routing configuration for real-time game updates
- Environment-specific database configuration
- Channel layers for multiplayer game coordination
- Security headers and CORS for game client access