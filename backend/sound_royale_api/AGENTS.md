# Django API Knowledge Base

## OVERVIEW
Django project configuration (6 files) for API endpoints, WebSocket routing, and environment management.

## STRUCTURE
- settings.py - Django settings + environment config
- asgi.py - ASGI config + WebSocket routing
- urls.py - Main URL routing patterns
- wsgi.py - WSGI deployment config
- manage.py - Django CLI commands

## WHERE TO LOOK
| Task | Location | Notes |
|------|----------|-------|
| Django settings | settings.py | Environment variables + middleware |
| API endpoints | urls.py | URL pattern mapping |
| WebSocket config | asgi.py | Channel layers + routing |
| Development setup | manage.py | Django management commands |

## CONVENTIONS
- Environment variables via python-decouple
- CORS enabled for localhost dev
- ASGI for WebSocket support
- SQLite for local development

## ANTI-PATTERNS (API)
- Never commit SECRET_KEY to version control
- Don't run with DEBUG=True in production
- No hardcoded database URLs - use environment
- Avoid exposing admin endpoints in production