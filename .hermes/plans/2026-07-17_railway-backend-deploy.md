# Sound Royale NY — Railway Backend Deploy Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Deploy the Sound Royale Django backend (Django 4.2 + DRF + Channels + Redis + Postgres) to Railway so the Cloudflare Pages frontend (already scaffolded: `wrangler.toml`, `functions/api/[[path]].js`) has a live `API_ORIGIN` and `VITE_WS_URL` target.

**Architecture:** Railway hosts a long-running container running Daphne (ASGI) for HTTP + WebSocket, with one-click Postgres and Redis services attached. Django settings are already env-driven (`python-decouple`), so no application code changes are required — only a `Dockerfile`, `Procfile`/`railway.toml`, and Railway project config (services + env vars). The frontend's `/api` Function proxies to Railway; `VITE_WS_URL` points straight at Railway's WSS endpoint.

**Tech Stack:** Django 4.2.7, DRF 3.14, Channels 4.0 + channels-redis, Daphne 4.0, psycopg2-binary, whitenoise, python-decouple, Python 3.11, Railway (Postgres + Redis add-ons).

---

## Current context / assumptions

- Repo: `/Users/brandonbennett/sound-royale-ny`. Backend at `backend/`, Django project `sound_royale_api`, ASGI `application` in `backend/sound_royale_api/asgi.py`.
- Settings already read all deploy knobs from env (verified): `DATABASES` (DB_ENGINE/DB_HOST/DB_NAME/DB_USER/DB_PASSWORD/DB_PORT), `CHANNEL_LAYERS` (REDIS_URL), `ALLOWED_HOSTS`, `DEBUG`, `SECRET_KEY`, `CORS_ALLOWED_ORIGINS` (static list — see Risk #1).
- Frontend deploy files already exist (untracked): `wrangler.toml`, `functions/api/[[path]].js`, `.dev.vars`. They expect `API_ORIGIN` (Pages env) and the app reads `VITE_API_BASE_URL` (=`/api`) + `VITE_WS_URL`.
- No `Dockerfile`, `Procfile`, or `railway.toml` exist yet.
- User has a Railway account + CLI (`railway` installed) — verify in Task 1.

## Proposed approach

1. Containerize backend: `backend/Dockerfile` (Python 3.11, install `backend/requirements.txt`, collectstatic via whitenoise, run Daphne on `$PORT`).
2. Define Railway services via `railway.toml`: web service (Dockerfile) + Postgres + Redis add-ons; set start command to Daphne.
3. Provide a `.env` template for Railway env vars (mirrors `backend/.env.example` but with production values pointing at `${{RAILWAY_POSTGRES_URL}}` and `${{REDIS_URL}}` references).
4. Wire frontend: set Pages `API_ORIGIN` = Railway public URL, and `VITE_WS_URL` = `wss://<railway-host>` in `wrangler.toml` `[env.production.vars]`.
5. Verification: `railway up` (or dashboard deploy) → health check → frontend `/api` proxy returns 200 → WS connects.

## Step-by-step plan

### Task 1: Verify Railway CLI + auth (read-only)
- Run: `railway --version` and `railway whoami`.
- Expected: version prints; `whoami` shows your account (not "not logged in").
- If not authed: `railway login` (browser). If `railway` missing: `npm i -g @railway/cli`.
- No code change.

### Task 2: Create `backend/Dockerfile`
- Create: `backend/Dockerfile`
```dockerfile
FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PORT=8000

WORKDIR /app

# System deps for psycopg2-binary + pillow
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential libpq-dev gcc \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt /app/backend/requirements.txt
RUN pip install --no-cache-dir -r /app/backend/requirements.txt

COPY backend /app/backend
COPY . /app

WORKDIR /app/backend

# whitenoise serves static files; collect them at build time
RUN DJANGO_SETTINGS_MODULE=sound_royale_api.settings \
    SECRET_KEY=build-only python manage.py collectstatic --noinput || true

EXPOSE 8000

# Daphne terminates both HTTP and WS on one port
CMD ["sh", "-c", "daphne -b 0.0.0.0 -p ${PORT:-8000} sound_royale_api.asgi:application"]
```
- Rationale: Daphne serves ASGI (HTTP + WebSocket) on a single port — no separate Nginx/uvicorn needed. `PORT` is injected by Railway.

### Task 3: Create `backend/.dockerignore`
- Create: `backend/.dockerignore`
```
__pycache__/
*.pyc
.venv/
venv/
db.sqlite3
.env
.env.example
.pytest_cache/
logs/
media/
.DS_Store
```
- Prevents bloating the build context and leaking local `.env`.

### Task 4: Create `railway.toml`
- Create: `railway.toml` (repo root)
```toml
[build]
# Use the backend Dockerfile explicitly
dockerfile = "backend/Dockerfile"
# Railway auto-detects context; set root so COPY . works
# (Keep repo root as build context; Dockerfile uses backend/ paths.)

[deploy]
healthcheckPath = "/api/health/"   # add this endpoint in Task 6
healthcheckTimeout = 100
restartPolicyType = "on_failure"
restartPolicyMaxRetries = 10

[[services]]
name = "sound-royale-backend"

[[services.env]]
# Railway exposes the Postgres add-on URL here
RAILWAY_POSTGRES_URL = "${{Postgres.RAILWAY_PRIVATE_DOMAIN}}"

[environments.production]
```
- NOTE: Postgres/Redis are attached as add-ons in Task 5 (dashboard or `railway add`) — the template references their injected env vars (`${{Postgres.DATABASE_URL}}`, `${{Redis.REDIS_URL}}`). Exact reference names confirmed in Task 5.
- Do NOT hardcode secrets.

### Task 5: Attach Postgres + Redis, map env vars
- In Railway dashboard (or `railway add --service`):
  - Add **PostgreSQL** add-on → injects `${{Postgres.DATABASE_URL}}` (or `Postgres.RAILWAY_PRIVATE_DOMAIN` + credentials).
  - Add **Redis** add-on → injects `${{Redis.REDIS_URL}}`.
- Set backend env vars (Railway project → Variables):
  - `DJANGO_SETTINGS_MODULE` = `sound_royale_api.settings`
  - `DEBUG` = `False`
  - `SECRET_KEY` = generate: `python -c "import secrets;print(secrets.token_urlsafe(50))"` (paste the output)
  - `ALLOWED_HOSTS` = `<railway-generated-host>,localhost,127.0.0.1` (Railway host e.g. `sound-royale-backend.up.railway.app`)
  - `DB_ENGINE` = `django.db.backends.postgresql`
  - `DB_NAME` / `DB_USER` / `DB_PASSWORD` / `DB_HOST` / `DB_PORT` = from `${{Postgres.DATABASE_URL}}` (or set `DATABASE_URL` and parse — simplest: set the five vars from the add-on's connection string)
  - `REDIS_URL` = `${{Redis.REDIS_URL}}`
  - `CORS_ALLOWED_ORIGINS` = `https://<your-cloudflare-pages-domain>` (e.g. `https://soundroyale.pages.dev` or custom domain)
  - `SECURE_SSL_REDIRECT` = `True`, `SESSION_COOKIE_SECURE` = `True`, `CSRF_COOKIE_SECURE` = `True`
- Verify via `railway variables` (values masked).

### Task 6: Add a health-check endpoint (optional but recommended)
- The `railway.toml` healthcheck expects `/api/health/`. Check if one exists:
  - `search_files("health", path="backend/game_engine/urls.py")`
  - If absent, add a DRF view `backend/game_engine/views.py` returning `200 {"status":"ok"}` and route `path('api/health/', ...)` in `backend/game_engine/urls.py`. Keep it minimal (YAGNI).
- This is the ONLY application-code change; confirm it doesn't already exist before adding.

### Task 7: Run migrations + collectstatic on deploy
- Add a release step so DB schema is applied automatically. In `railway.toml` `[deploy]`:
```toml
[deploy]
# Railway runs this after build, before healthcheck
releaseCommand = "python manage.py migrate --noinput"
```
  - (If `railway.toml` releaseCommand isn't picked up, run `railway run python manage.py migrate` once after first deploy.)
- Confirm `collectstatic` ran in Task 2 build log.

### Task 8: Deploy
- Run: `railway up` (or link project + `railway deploy`).
- Expected: build succeeds, container starts, healthcheck passes (200 on `/api/health/`).
- Capture the public URL: `railway domain` or dashboard → Settings → Networking.
- If healthcheck fails: `railway logs` to diagnose (common: missing `SECRET_KEY`, DB env not mapped, `ALLOWED_HOSTS` missing Railway host).

### Task 9: Wire Cloudflare frontend to Railway
- Edit `wrangler.toml` `[env.production.vars]`:
  - `VITE_WS_URL` = `wss://<railway-host>` (e.g. `wss://sound-royale-backend.up.railway.app`)
  - (REST stays `/api` via the existing `functions/api/[[path]].js` proxy.)
- In Cloudflare Pages project settings → Environment variables → production:
  - `API_ORIGIN` = `https://<railway-host>` (this feeds the Function's `env.API_ORIGIN`).
- Redeploy frontend (`wrangler pages deploy dist`) — or rely on auto-deploy if wired to git.

### Task 10: End-to-end verification
- `curl https://<railway-host>/api/health/` → `200 {"status":"ok"}`
- Load Cloudflare Pages URL in browser → create/join room → confirm WS connects (no console WS errors).
- `curl https://<pages-domain>/api/health/` → proxied 200 (confirms `API_ORIGIN` wired).
- Run `npm run build` once more to confirm frontend still builds with new `VITE_WS_URL`.

## Files likely to change
- Create: `backend/Dockerfile`, `backend/.dockerignore`, `railway.toml`
- Modify: `wrangler.toml` (add `VITE_WS_URL` to `[env.production.vars]`)
- Possibly create: `backend/game_engine/views.py` (health view) + route in `backend/game_engine/urls.py` (only if missing)
- No changes to `settings.py` (already env-driven).

## Tests / validation
- `railway variables` shows all required vars (masked values present).
- `railway logs` shows Daphne booting, `migrate` applied, no traceback.
- `curl <railway-host>/api/health/` → 200.
- Frontend `/api/health/` via Pages → 200 (proxy path).
- Browser: room create/join + live WS (verify via network tab, no `ws` errors).
- `npm run lint` + `npm run build` still green after `wrangler.toml` edit.

## Risks, tradeoffs, open questions
1. **CORS is a static list** in `settings.py` (`CORS_ALLOWED_ORIGINS` via decouple). Must include the exact Cloudflare Pages domain or the browser blocks API calls. Confirm the Pages domain before Task 5.
2. **Railway env-var references** (`${{Postgres.DATABASE_URL}}` vs `${{Postgres.RAILWAY_PRIVATE_DOMAIN}}`) vary by add-on version — confirm exact names in the dashboard during Task 5; don't guess.
3. **Postgres connection string parsing**: simplest is to set the 5 `DB_*` vars from the add-on's provided connection string rather than parsing `DATABASE_URL` in settings (settings expect discrete vars).
4. **Free vs paid**: Railway free tier has usage limits; set a budget cap in dashboard to avoid surprise charges. Always-on required for live WS — ensure the service doesn't sleep (paid/hobby plan).
5. **`collectstatic` at build** needs `STATIC_ROOT` configured in `settings.py` — verify it's set (whitenoise is already a dependency, so likely configured; check `settings.py` for `STATIC_ROOT` before Task 2).
6. **Media uploads**: Sound Royale uploads beats to `backend/media/`. In a container this is ephemeral — for production durability, wire to Cloudflare R2 or Railway volume. Out of scope for first deploy; note as follow-up.

## Out of scope (next steps, not this plan)
- Custom domain for backend (Railway provides `*.up.railway.app`; custom domain optional).
- Durable media storage (R2/volume).
- CI auto-deploy wiring (`railway.toml` + GitHub trigger).
