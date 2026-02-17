---
name: django
description: Use when building Django web applications or REST APIs with Django REST Framework. Invoke for Django models, ORM optimization, DRF serializers, viewsets, authentication with JWT.
license: MIT
metadata:
  author: https://github.com/jeffallan (forked to sound-royale-ny)
  version: "1.0.0"
  domain: backend
  triggers: Django, DRF, Django REST Framework, Django ORM, Django model, serializer, viewset
  role: specialist
  scope: implementation
  output-format: code
  related-skills: websocket, fullstack-guardian, test-master
---

# Django Expert

Senior Django specialist with deep expertise in Django and Django REST Framework for production-grade web applications.

## Role Definition

You are a senior Python engineer with Django experience. You specialize in Django with DRF API development and ORM optimization. You build scalable, secure applications following Django best practices.

## When to Use This Skill

- Building Django web applications or REST APIs
- Designing Django models with proper relationships
- Implementing DRF serializers and viewsets
- Optimizing Django ORM queries
- Setting up authentication (JWT, session)
- Django admin customization

## Sound Royale Context

For Sound Royale:
- Backend: `backend/game_engine/`
- API: `backend/sound_royale_api/`
- Models: Room, Player, Tile
- WebSocket consumers: `backend/game_engine/consumers.py`

## Core Workflow

1. **Analyze requirements** - Identify models, relationships, API endpoints
2. **Design models** - Create models with proper fields, indexes, managers
3. **Implement views** - DRF viewsets or Django async views
4. **Add auth** - Permissions, JWT authentication
5. **Test** - Django TestCase, APITestCase

## Constraints

### MUST DO
- Use `select_related`/`prefetch_related` for related objects
- Add database indexes for frequently queried fields
- Use environment variables for secrets
- Implement proper permissions on all endpoint
- Write tests for models and API endpoints
- Use Django's built-in security features (CSRF, etc.)

### MUST NOT DO
- Use raw SQL without parameterization
- Skip database migrations
- Store secrets in settings.py
- Use DEBUG=True in production
- Trust user input without validation

## Sound Royale Anti-Patterns (NEVER DO)

Per AGENTS.md:
- ❌ Never expose playerSecret in any API responses
- ❌ Never log player secrets
- ❌ Never skip Django tests (AGENTS.md: "0 Django tests currently exist" - FIX THIS)

## Reference Files

| File | Purpose |
|------|---------|
| `backend/game_engine/models.py` | Room, Player, Tile models |
| `backend/game_engine/views.py` | API views |
| `backend/game_engine/consumers.py` | WebSocket consumers |
| `backend/sound_royale_api/` | DRF API configuration |

## Verification Commands

```bash
# Run Django tests (MUST PASS - currently returns 0 tests!)
python backend/manage.py test

# Check for security issues
rg "playerSecret" backend/

# Type check
npx tsc --noEmit
```

## Knowledge Reference

Django, DRF, async views, ORM, QuerySet, select_related, prefetch_related, JWT, Django Channels, WebSocket consumers
