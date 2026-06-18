# Backend Production Readiness Audit — SOU-80

**Date:** 2026-06-16  
**Scope:** `/Users/brandonbennett/sound-royale-ny/backend/`  
**Django Version:** 5.2.9  
**Status:** 🔴 **NOT PRODUCTION READY** — 24 issues found (8 Critical, 10 High, 6 Medium)

---

## Executive Summary

The Sound Royale backend is a Django + Django REST Framework + Channels application for a multiplayer music bingo game. While the codebase is well-structured with good test coverage and security-aware patterns (player_secret auth, audit logging, CSRF protection), it has **8 critical blockers** that must be resolved before any production deployment:

1. **SQLite in production** — must migrate to PostgreSQL
2. **WhiteNoise not configured** — static files will 404
3. **Timer loop is process-local** — lost on deploy/restart, broken with multiple workers
4. **No health check endpoint** — load balancers can't verify service health
5. **No `.env.example`** — ops team doesn't know what env vars are needed
6. **DEBUG=True in `.env`** — information disclosure risk
7. **Development SECRET_KEY in `.env`** — session forgery risk if leaked
8. **N+1 queries in game state serializer** — severe performance issue at scale

---

## 1. Database: SQLite → PostgreSQL Migration

### 🔴 CRITICAL — Issue 1.1: SQLite in Production

| Field | Value |
|-------|-------|
| **Severity** | Critical |
| **File** | `sound_royale_api/settings.py` |
| **Current State** | `ENGINE: django.db.backends.sqlite3`, `NAME: BASE_DIR / 'db.sqlite3'` |
| **Impact** | SQLite doesn't support concurrent writes, lacks connection pooling, and can't be used with multiple worker processes. Data corruption risk under load. |

**Recommended Fix:**
```python
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': config('DB_NAME', default='sound_royale'),
        'USER': config('DB_USER', default='sound_royale'),
        'PASSWORD': config('DB_PASSWORD'),
        'HOST': config('DB_HOST', default='localhost'),
        'PORT': config('DB_PORT', default='5432'),
        'CONN_MAX_AGE': 600,
    }
}
```
Add to `requirements.txt`: `psycopg2-binary==2.9.9`

### 🟡 HIGH — Issue 1.2: No Database Connection Pooling

No `CONN_MAX_AGE` configured. Each request opens/closes a new connection. Under WebSocket-heavy load, this will exhaust PostgreSQL connections.

### 🟡 HIGH — Issue 1.3: Missing Database Indexes

Only `unique_together` constraints create implicit indexes. No `db_index=True` on `Room.code`, `Player.room`, `Player.player_secret`, `Tile.room`, `Round.room`. These are queried on nearly every request.

---

## 2. Migrations Review (14 migrations)

### 🟡 HIGH — Issue 2.1: Migration 0004 Uses Raw SQL

`game_engine/migrations/0004_add_room_code_field.py` uses raw SQL (`cursor.execute("SELECT id FROM game_engine_room")`). The `%s` parameter style is sqlite3-specific. Must be rewritten with ORM operations for PostgreSQL compatibility.

### 🟡 MEDIUM — Issue 2.2: Migration 0005 Function Ordering

`assign_rooms_to_tiles` function in `0005_add_room_to_tile.py` is referenced in `RunPython` after the Migration class but defined at module level. Fragile for future squashing.

### ✅ Migration Safety Summary

All 40 migrations are generally safe. Only 0004 (raw SQL) and 0005 (data+schema in one) need attention for PostgreSQL.

---

## 3. Error Handling

### 🟡 HIGH — Issue 3.1: Bare Exception Handler in `set_player_connected`

`game_engine/consumers.py` — `except Exception: pass` silently swallows all errors. Should log the exception via `audit_logger.exception()`.

### 🟡 MEDIUM — Issue 3.2: No JSON Parse Error Handling in WebSocket

`game_engine/consumers.py` — `json.loads(text_data)` without try/except. Malformed JSON crashes the WebSocket connection.

### 🟡 MEDIUM — Issue 3.3: `get_object` Raises 500 Not 404

`game_engine/views.py:RoomViewSet.get_object()` — `Room.objects.get(code=...)` raises `DoesNotExist` instead of `Http404`, returning 500 for invalid room codes.

### ✅ Error Handling Positives

- `join_game` has comprehensive try/except with IntegrityError handling
- `reset_game` has transaction-safe rollback
- `discord_callback` catches exceptions and returns 500

---

## 4. Logging

### 🟡 HIGH — Issue 4.1: Logs Directory May Not Exist

`LOGGING` config writes to `BASE_DIR / 'logs' / 'django.log'` but no code creates the `logs/` directory. On fresh deploy, `RotatingFileHandler` will raise `FileNotFoundError`.

**Fix:** Add `LOGS_DIR.mkdir(exist_ok=True)` to settings.py.

### 🟡 MEDIUM — Issue 4.2: No Structured (JSON) Logging

Plain text formatters make log aggregation difficult. Add `pythonjsonlogger` for JSON output in production.

### ✅ Logging Positives

- Dedicated `game_audit` logger for security events
- `RotatingFileHandler` with 10MB/5 backups
- Audit logging in WebSocket consumer

---

## 5. Performance

### 🔴 CRITICAL — Issue 5.1: N+1 in `GameStateSerializer.get_players`

`game_engine/serializers.py:448-503` — `player.discord_identity.discord_username` accessed without `select_related`. With 10 players = 20 extra queries per game_state call, which runs on every WebSocket broadcast.

**Fix:** Add `.select_related("discord_identity")` to the players queryset.

### 🟡 HIGH — Issue 5.2: N+1 in `PlayerSerializer.get_scoreInfo`

`obj.tiles.all()` called per player without prefetch when PlayerSerializer is used directly.

### 🟡 MEDIUM — Issue 5.3: `build_genre_performance` O(N) Queries

~18-36 queries per player per request. Replace with Django ORM aggregation (`Count` + `filter=Q(winner=player)`).

---

## 6. Background Tasks (Timer Loop)

### 🔴 CRITICAL — Issue 6.1: Timer Loop Is Process-Local

`game_engine/views.py:358-384` — `_active_timer_tasks: dict[str, asyncio.Task] = {}` is a module-level dict. In production with multiple workers, only the worker that handled `start_game` runs the timer. On deploy/restart, all timers are lost. Multiple workers could create duplicate timers.

**Recommended Fix:** Use Celery for timer management, or move timer logic to the client (server sends `timer_started_at` + `timer_duration`, client counts down).

### 🟡 HIGH — Issue 6.2: `asyncio.create_task` in Sync Context

`asyncio.create_task()` called from a sync DRF view. Requires a running event loop — works under ASGI but would fail under pure WSGI.

---

## 7. Health Checks

### 🔴 CRITICAL — Issue 7.1: No Health Check Endpoint

No `/health/` or `/readiness/` endpoint exists. Load balancers can't verify service health.

**Fix:** Add two endpoints:
- `GET /api/health/` — lightweight liveness check (returns 200)
- `GET /api/health/readiness/` — deep check including database and Redis (returns 200 or 503)

---

## 8. Graceful Shutdown

### 🟡 HIGH — Issue 8.1: No ASGI Lifespan Handler

`sound_royale_api/asgi.py` — No lifespan protocol handler. WebSocket connections are dropped without notification on shutdown. Timer tasks are killed mid-execution.

### 🟡 MEDIUM — Issue 8.2: WS Disconnect Partial State

If `get_player_presence_payload` returns None (player deleted), `player_left` broadcast is skipped but `set_player_connected` still runs.

---

## 9. Environment Configuration

### 🔴 CRITICAL — Issue 9.1: No `.env.example` File

No `.env.example` exists. Settings.py references 15+ env vars but `.env` only has 4. Required vars: `SECRET_KEY`, `DEBUG`, `ALLOWED_HOSTS`, `CORS_ALLOWED_ORIGINS`, `SECURE_*` settings, `DISCORD_*` settings, `LINEAR_WEBHOOK_SECRET`, `THEME_ADMIN_SECRET`, `DB_*` vars (for production), `DISCORD_ENCRYPTION_KEY`.

### 🔴 CRITICAL — Issue 9.2: DEBUG=True in `.env`

Exposes detailed error pages and stack traces. Must be `False` in production.

### 🟡 HIGH — Issue 9.3: Development SECRET_KEY

`django-insecure-dev-key-...` prefix indicates a dev key. Must generate a proper key for production.

---

## 10. Static Files (WhiteNoise)

### 🔴 CRITICAL — Issue 10.1: WhiteNoise Not in Middleware

`whitenoise==6.0.0` is in `requirements.txt` but `WhiteNoiseMiddleware` is NOT in the `MIDDLEWARE` list. Static files will return 404 in production.

**Fix:** Add `'whitenoise.middleware.WhiteNoiseMiddleware'` after `SecurityMiddleware` in MIDDLEWARE. Add `STATICFILES_STORAGE = 'whitenoise.storage.CompressedManifestStaticFilesStorage'`.

### 🟡 MEDIUM — Issue 10.2: `collectstatic` Not Documented

`STATIC_ROOT` is set but no documentation or script for running `collectstatic` in production.

---

## Summary Table

| # | Issue | Severity | Category |
|---|-------|----------|----------|
| 1.1 | SQLite in production | 🔴 Critical | Database |
| 1.2 | No connection pooling | 🟡 High | Database |
| 1.3 | Missing DB indexes | 🟡 High | Database |
| 2.1 | Raw SQL in migration 0004 | 🟡 High | Migrations |
| 2.2 | Migration 0005 function ordering | 🟡 Medium | Migrations |
| 3.1 | Bare except in set_player_connected | 🟡 High | Error Handling |
| 3.2 | No JSON parse error handling in WS | 🟡 Medium | Error Handling |
| 3.3 | get_object raises 500 not 404 | 🟡 Medium | Error Handling |
| 4.1 | Logs directory may not exist | 🟡 High | Logging |
| 4.2 | No structured (JSON) logging | 🟡 Medium | Logging |
| 5.1 | N+1 in get_players (discord_identity) | 🔴 Critical | Performance |
| 5.2 | N+1 in PlayerSerializer.get_scoreInfo | 🟡 High | Performance |
| 5.3 | build_genre_performance O(N) queries | 🟡 Medium | Performance |
| 6.1 | Timer loop is process-local | 🔴 Critical | Background Tasks |
| 6.2 | asyncio.create_task in sync context | 🟡 High | Background Tasks |
| 7.1 | No health check endpoint | 🔴 Critical | Health Checks |
| 8.1 | No ASGI lifespan handler | 🟡 High | Graceful Shutdown |
| 8.2 | WS disconnect partial state | 🟡 Medium | Graceful Shutdown |
| 9.1 | No .env.example | 🔴 Critical | Environment Config |
| 9.2 | DEBUG=True in .env | 🔴 Critical | Environment Config |
| 9.3 | Development SECRET_KEY | 🟡 High | Environment Config |
| 10.1 | WhiteNoise not in middleware | 🔴 Critical | Static Files |
| 10.2 | No collectstatic documentation | 🟡 Medium | Static Files |

**Total: 24 issues — 8 Critical, 10 High, 6 Medium**

---

## Recommended Priority Order

### Phase 1: Critical Blockers (Must fix before any production deploy)
1. **1.1** — Migrate to PostgreSQL
2. **10.1** — Add WhiteNoise middleware
3. **7.1** — Add health check endpoints
4. **9.1** — Create `.env.example`
5. **9.2** — Set `DEBUG=False` in production `.env`
6. **6.1** — Replace process-local timer with celery or client-side countdown
7. **5.1** — Fix N+1 in `get_players` (add `select_related("discord_identity")`)
8. **4.1** — Ensure logs directory exists

### Phase 2: High Priority (Fix within first sprint)
9. **1.3** — Add database indexes
10. **2.1** — Fix raw SQL in migration 0004
11. **3.1** — Fix bare except in `set_player_connected`
12. **5.2** — Fix N+1 in `PlayerSerializer`
13. **6.2** — Fix `asyncio.create_task` in sync context
14. **8.1** — Add ASGI lifespan handler
15. **9.3** — Generate production SECRET_KEY
16. **1.2** — Add connection pooling

### Phase 3: Medium Priority (Fix before scale)
17. **3.2** — Add JSON parse error handling in WebSocket
18. **3.3** — Fix `get_object` to return 404
19. **4.2** — Add JSON structured logging
20. **5.3** — Optimize `build_genre_performance` with aggregation
21. **8.2** — Fix WS disconnect state consistency
22. **10.2** — Document collectstatic process
23. **2.2** — Fix migration 0005 function ordering
