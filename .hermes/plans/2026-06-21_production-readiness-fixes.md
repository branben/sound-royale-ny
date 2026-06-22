# Production Readiness Fixes

> **For Hermes:** Execute task-by-task using red-green-refactor loop. Commit after each task.

**Goal:** Fix 5 critical issues preventing Sound Royale from running in production.

**Tech Stack:** Django 4.2 + channels-redis + Docker · React 18 + TS + Vite

---

## P0-1: Fix Redis Channel Layer (Docker will not work without this)

**Root cause:** `settings.py:235` hardcodes Redis to `127.0.0.1:6379`. In Docker, the Redis service is named `redis` (hostname). The `docker-compose.yml` sets `REDIS_URL=redis://redis:6379/0` but `CHANNEL_LAYERS` never reads it.

**Files:**
- Modify: `backend/sound_royale_api/settings.py:230-238`

**Step 1: Read current CHANNEL_LAYERS config**

```bash
grep -n "CHANNEL_LAYERS\|hosts\|REDIS" backend/sound_royale_api/settings.py
```

**Step 2: Replace hardcoded hosts with env-driven URL**

```python
# Channel layer settings (using Redis)
CHANNEL_LAYERS = {
    'default': {
        'BACKEND': 'channels_redis.core.RedisChannelLayer',
        'CONFIG': {
            "hosts": [config('REDIS_URL', default='redis://127.0.0.1:6379/0')],
        },
    },
}
```

**Step 3: Verify TS still compiles (no Python runtime available, but check file is valid)**

```bash
cat backend/sound_royale_api/settings.py | python3 -c "import sys; compile(sys.stdin.read(), 'settings.py', 'exec'); print('Syntax OK')"
```

Expected: `Syntax OK`

**Step 4: Commit**

```bash
git add backend/sound_royale_api/settings.py
git commit -m "fix: use REDIS_URL env var for channel layer instead of hardcoded localhost"
```

---

## P0-2: Fix Security Defaults (Breaks local dev without HTTPS)

**Root cause:** `SECURE_SSL_REDIRECT`, `SESSION_COOKIE_SECURE`, `CSRF_COOKIE_SECURE` all default to `True`. Without HTTPS (local dev), this causes infinite redirect loops and cookies rejected by browser.

**Files:**
- Modify: `backend/sound_royale_api/settings.py:173-176`

**Step 1: Change defaults to `False`**

```python
SECURE_HSTS_SECONDS = config('SECURE_HSTS_SECONDS', default=31536000, cast=int)
SECURE_SSL_REDIRECT = config('SECURE_SSL_REDIRECT', default=False, cast=bool)
SESSION_COOKIE_SECURE = config('SESSION_COOKIE_SECURE', default=False, cast=bool)
CSRF_COOKIE_SECURE = config('CSRF_COOKIE_SECURE', default=False, cast=bool)
```

**Step 2: Verify syntax**

```bash
cat backend/sound_royale_api/settings.py | python3 -c "import sys; compile(sys.stdin.read(), 'settings.py', 'exec'); print('Syntax OK')"
```

Expected: `Syntax OK`

**Step 3: Commit**

```bash
git add backend/sound_royale_api/settings.py
git commit -m "fix: security settings default to False for local dev, override via env in production"
```

---

## P0-3: Add Health Check Endpoint (Docker HEALTHCHECK fails without it)

**Root cause:** `Dockerfile.backend` line 18 has `HEALTHCHECK -- CMD curl /health/` but no `/health/` endpoint exists in Django. Container will be marked unhealthy immediately.

**Files:**
- Modify: `backend/game_engine/views.py` (add health view)
- Modify: `backend/game_engine/urls.py` (add route)

**Step 1: Add health check view at the top of `game_engine/views.py` (after imports)**

```python
from django.http import JsonResponse

def health_check(request):
    """Health check endpoint for Docker and load balancers."""
    return JsonResponse({"status": "ok"})
```

**Step 2: Add URL route in `game_engine/urls.py`**

Add at the top of the urlpatterns list:
```python
path('health/', health_check, name='health_check'),
```

And add `health_check` to the imports from `game_engine.views`.

**Step 3: Verify syntax**

```bash
python3 -c "
import ast
with open('backend/game_engine/views.py') as f: ast.parse(f.read())
with open('backend/game_engine/urls.py') as f: ast.parse(f.read())
print('Syntax OK')
"
```

Expected: `Syntax OK`

**Step 4: Commit**

```bash
git add backend/game_engine/views.py backend/game_engine/urls.py
git commit -m "feat: add /health/ endpoint for Docker HEALTHCHECK and load balancers"
```

---

## P1-1: Create .env.example (Deployment documentation)

**Problem:** No template for required env vars. New deployers can't know what to set.

**Files:**
- Create: `.env.example` (root of project, NOT inside secrets-protected `.env.production`)

**Step 1: Create .env.example with all required vars**

```bash
cat > .env.example << 'EOF'
# Sound Royale — Required Environment Variables
# Copy to .env and fill in values

# Django
SECRET_KEY=change-me-to-a-random-50-char-string
DEBUG=False
ALLOWED_HOSTS=localhost,127.0.0.1

# Database (Docker)
DB_ENGINE=django.db.backends.postgresql
DB_NAME=sound_royale
DB_USER=sound_royale
DB_PASSWORD=change-me-to-a-secure-password
DB_HOST=postgres
DB_PORT=5432

# Redis
REDIS_URL=redis://redis:6379/0

# CORS / CSRF
CORS_ALLOWED_ORIGINS=http://localhost:80,http://localhost:5173
CSRF_TRUSTED_ORIGINS=http://localhost:80,http://localhost:5173

# Security (enable in production with HTTPS)
SECURE_SSL_REDIRECT=False
SESSION_COOKIE_SECURE=False
CSRF_COOKIE_SECURE=False

# Sentry (optional)
SENTRY_DSN=
SENTRY_ENVIRONMENT=development
SENTRY_TRACES_SAMPLE_RATE=0.1

# Rate Limiting
ANON_THROTTLE_RATE=300/minute
USER_THROTTLE_RATE=300/minute
AUDIO_UPLOAD_THROTTLE_RATE=120/minute
ROOM_CREATION_THROTTLE_RATE=60/minute

# Domain (production)
DOMAIN=localhost
CERTBOT_EMAIL=admin@example.com

# Frontend
VITE_API_BASE_URL=http://localhost:8000/api
VITE_WS_URL=ws://localhost:8000/ws
VITE_SENTRY_DSN=
EOF
```

**Step 2: Commit**

```bash
git add .env.example
git commit -m "docs: add .env.example with all required environment variables"
```

---

## P1-2: Make CSRF_TRUSTED_ORIGINS Env-Driven

**Problem:** Hardcoded to localhost origins only. Production domain won't be in the list, causing CSRF failures.

**Files:**
- Modify: `backend/sound_royale_api/settings.py:186-193`

**Step 1: Replace hardcoded CSRF_TRUSTED_ORIGINS with env-driven config**

```python
# CSRF settings for frontend — env-driven for production
CSRF_TRUSTED_ORIGINS = config(
    'CSRF_TRUSTED_ORIGINS',
    default='https://localhost,https://127.0.0.1',
    cast=lambda v: [x.strip() for x in v.split(',')]
)
```

**Step 2: Verify syntax**

```bash
cat backend/sound_royale_api/settings.py | python3 -c "import sys; compile(sys.stdin.read(), 'settings.py', 'exec'); print('Syntax OK')"
```

Expected: `Syntax OK`

**Step 3: Commit**

```bash
git add backend/sound_royale_api/settings.py
git commit -m "fix: make CSRF_TRUSTED_ORIGINS env-driven instead of hardcoded"
```

---

## Verification

After all fixes:

1. **Frontend tests:** `npm run test` → 237 pass
2. **TypeScript:** `npm run verify:types` → clean
3. **Settings syntax:** `python3 -c "compile..."` → Syntax OK
4. **No new lint errors:** `npm run lint` → same 78 pre-existing errors, 0 new

## Files Changed Summary

| File | Change |
|------|--------|
| `backend/sound_royale_api/settings.py` | Redis hosts → env-driven; security defaults → False; CSRF origins → env-driven |
| `backend/game_engine/views.py` | Add `health_check` view |
| `backend/game_engine/urls.py` | Add `/health/` route |
| `.env.example` | Create deployment env template |

## Not Included (Deferred)

- Discord error handling (`discordSession.ts`) — separate PR
- Lobby GSAP removal — cosmetic, not a blocker
- Loading skeleton — UX polish, not a blocker
- CSP headers — post-MVP hardening
- Django version docstring — cosmetic (4.2.7 in requirements.txt is correct, 5.2.9 in settings.py header is just a stale comment)
