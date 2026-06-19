---
title: Remaining Production Remediation Issues
type: feat
date: 2026-06-18
---

# Remaining Production Remediation Issues — Issue Plans

**Issues referenced:** #59, #60, #63, #64, #65, #66, #67, #68, #69, #70, #71
**Status of #58, #61, #62:** Closed — already implemented or superseded by live test tier.

## Scope

All open production remediation issues not yet closed. Organization follows the original remediation plan's phases with dependency ordering.

## Triage Summary

| Issue | Title | Verdict | Depends On |
|-------|-------|---------|------------|
| #59 | Migrate DB from SQLite to PostgreSQL | Valid — Critical | None |
| #60 | Rotate SECRET_KEY + disable Sentry PII + .env hygiene | Code fix done; git scrub remains | None |
| #63 | Backend audio upload validation (size + MIME) | Valid | None |
| #64 | Frontend Sentry + TypeScript strict mode | Valid | None |
| #65 | Harden Docker Compose + nginx configs | Valid | None |
| #66 | Add Prettier config + CI enforcement | Valid | None |
| #67 | Session-based player auth on DRF endpoints | Valid — Critical | #59 |
| #68 | Backend monitoring, health endpoint, backup | Valid | #59, #60 |
| #69 | Move admin PIN validation to backend | Valid — Critical | #67 |
| #70 | WebSocket authentication on connect | Valid — Critical | #67 |
| #71 | Frontend component tests | Valid | #64 |

---

### Phase 1: Foundation (Parallelizable, No Dependencies)

#### U1. Issue #59 — PostgreSQL Migration

**Goal:** Replace SQLite with PostgreSQL for production data persistence. Currently SQLite cannot handle concurrent writes from Django Channels workers and data is lost on container restart.

**Approach:**
- Add PostgreSQL service to `docker-compose.yml` and `docker-compose.prod.yml` with named volume for data
- Settings already support env-based DB config (`DB_ENGINE`, `DB_NAME`, `DB_HOST`, etc.); add `psycopg2-binary` to deps
- Create a one-time data migration script (`dumpdata` → `loaddata`) for transferring from SQLite
- Update CI to run tests against a PostgreSQL service container
- Update dev env to default to SQLite (for convenience) but allow easy switch to PG

**Files:** `docker-compose.yml`, `docker-compose.prod.yml`, `backend/requirements.txt`, `.github/workflows/gaia-guards-ci.yml`

**Test scenarios:**
- Fresh install with PostgreSQL: `manage.py migrate` runs successfully, app starts
- Data migration: existing SQLite data transfers to PostgreSQL
- App functionality: create room, join, start game works against PostgreSQL
- Data persists across `docker compose down && docker compose up`

---

#### U2. Issue #60 — Git History Cleanup

**Goal:** Scrub old SECRET_KEY from git history. Code fix already done (SECRET_KEY loads from env in settings.py, `send_default_pii=False`, `.env` is gitignored). Remaining work is operational.

**Approach:**
- Use `git filter-branch` or `git filter-repo` to remove the old SECRET_KEY from git history
- Verify no trace remains via `git grep SECRET_KEY $(git rev-list --all)`
- Force-push to remote (requires coordinating with any collaborators)

**Files:** None (git history operation)

**Test scenarios:**
- `git grep SECRET_KEY` returns zero matches across all history for the hardcoded value

---

#### U3. Issue #63 — Audio Upload Validation

**Goal:** Add server-side validation for file size (max 10MB) and MIME type (allowlist of audio formats).

**Approach:**
- Identify the upload endpoint view and add a `FileExtensionValidator` or custom validation
- Check `Content-Type` header against allowlist (audio/mpeg, audio/wav, audio/ogg, audio/flac, audio/x-flac)
- Check file size (configurable max via env)
- Return HTTP 400 with clear error messages for invalid files

**Files:** `backend/game_engine/views.py` (upload endpoint), `backend/game_engine/serializers.py` (upload serializer), `backend/sound_royale_api/settings.py` (max upload size config)

**Test scenarios:**
- Valid `.mp3`/`.wav`/`.ogg` file within size limit uploads successfully
- Uploading a non-audio file (`.jpg`, `.pdf`) returns 400 with MIME-type error
- Uploading an oversized file (>10MB) returns 400 with size error
- Missing file in request returns 400

---

#### U4. Issue #64 — Frontend Sentry + TypeScript Strict Mode

**Goal:** Enable frontend error monitoring and fix all strict TypeScript errors (~14.5k LOC frontend).

**Approach:**
- Install `@sentry/react`, initialize in `main.tsx` with env-based DSN
- Enable `strict: true` in `tsconfig.json`
- Fix all resulting type errors across the codebase (noImplicitAny, strictNullChecks, noUnusedLocals, noUnusedParameters)
- Both blocks run independently; Sentry can be done first, strict mode is larger

**Files:** `frontend/package.json`, `frontend/src/main.tsx`, `frontend/tsconfig.json`, various `.ts`/`.tsx` files

**Test scenarios:**
- `npx tsc --noEmit` passes with zero errors after strict mode
- `npm run build` succeeds
- Frontend errors appear in Sentry dashboard
- All existing tests still pass

---

#### U5. Issue #66 — Prettier Config + CI Enforcement

**Goal:** Consistent code formatting with CI enforcement.

**Approach:**
- Add `.prettierrc` with project conventions
- Ensure ESLint and Prettier do not conflict
- Run Prettier on all existing source files
- Add `prettier --check` to CI workflow

**Files:** `.prettierrc`, `.prettierignore`, `package.json`, `.github/workflows/gaia-guards-ci.yml`

**Test scenarios:**
- `npx prettier --check .` passes on the formatted codebase
- CI fails if unformatted code is pushed

---

#### U6. Issue #65 — Docker Compose + Nginx Hardening

**Goal:** Production-hardened Docker and nginx configs.

**Approach:**
- Add `deploy.resources.limits` (memory/CPU) to Docker Compose prod services
- nginx: add `limit_req_zone` for API/WS rate limiting, configure proxy timeouts for WebSocket
- nginx: enable gzip, set Cache-Control for static assets, configure `client_max_body_size`
- Add healthchecks to Docker Compose
- Backend runs as non-root user in container

**Files:** `docker-compose.prod.yml`, `nginx.conf`, `Dockerfile.backend`, `Dockerfile.frontend`, `.dockerignore`

**Test scenarios:**
- `docker compose build` succeeds
- `docker compose ps` shows `(healthy)` for all services
- Containers run as non-root user
- Static assets have cache headers in response

---

### Phase 2: Auth & Security (Depends on #59)

#### U7. Issue #67 — Player Authentication

**Goal:** Replace `AllowAny` with proper auth on DRF endpoints. Currently any client can call any endpoint.

**Approach:**
- Configure `DEFAULT_AUTHENTICATION_CLASSES` to use JWT (via `djangorestframework-simplejwt`)
- Add login/register endpoints (integrate with existing Discord OAuth or create lightweight auth)
- Replace `AllowAny` with `IsAuthenticated` on protected endpoints
- Keep public endpoints (health check, room list) unauthenticated
- Update existing API tests to authenticate before making requests

**Files:** `backend/sound_royale_api/settings.py`, `backend/sound_royale_api/urls.py`, `backend/game_engine/views.py`, `backend/game_engine/game_session_views.py`, `backend/game_engine/authentication.py` (new)

**Test scenarios:**
- Protected endpoints return 401 without valid token
- Protected endpoints succeed with valid token
- Login/register flows work
- Existing game flows (create room, join, start) work with auth
- Health endpoint remains unauthenticated

---

#### U8. Issue #69 — Admin PIN to Backend

**Goal:** Remove `VITE_THEME_ADMIN_PIN` from frontend bundle; validate admin operations server-side.

**Blocked by:** U7 (player auth)

**Approach:**
- Backend admin endpoints require `IsAdminUser` permission instead of `X-Theme-Admin-Secret` header
- Frontend admin flows call backend for authorization
- Remove `VITE_THEME_ADMIN_PIN` from `.env` files

**Files:** `frontend/src/pages/PlayerAdmin.tsx`, `frontend/src/pages/ThemeAdmin.tsx`, `backend/game_engine/views.py`, `backend/sound_royale_api/settings.py`

**Test scenarios:**
- Admin operations require authenticated admin user
- Non-admin users get 403 on admin endpoints
- `VITE_THEME_ADMIN_PIN` absent from frontend JS bundle

---

#### U9. Issue #70 — WebSocket Authentication

**Goal:** Authenticate WebSocket connections before accepting; reject unauthenticated with close code 4003.

**Blocked by:** U7 (player auth)

**Approach:**
- In `GameConsumer.connect()`, verify player identity before `self.accept()`
- Reject with close code 4003 for unauthenticated
- Add WebSocket-level message rate limiting

**Files:** `backend/game_engine/consumers.py`, `backend/sound_royale_api/settings.py`

**Test scenarios:**
- Unauthenticated WebSocket connection rejected with 4003 before accept
- Authenticated connection accepted
- Rate-limited client disconnected or throttled

---

### Phase 3: Monitoring & Quality (Depends on Phase 1)

#### U10. Issue #68 — Health Endpoint + Backup Strategy

**Goal:** `/health/` endpoint checking DB and Redis; backup documentation.

**Blocked by:** U1 (PostgreSQL) and U2 (Sentry config)

**Approach:**
- Create `/health/` Django view returning 200 (DB+Redis healthy) or 503
- Configure Redis persistence (RDB/AOF) in Docker Compose
- Document PostgreSQL backup/restore procedure
- Configure structured JSON logging

**Files:** `backend/game_engine/views.py` (health view), `backend/sound_royale_api/urls.py`, `backend/sound_royale_api/settings.py` (logging), `docker-compose.prod.yml` (Redis volume), `docs/operations/backup-restore.md` (new)

**Test scenarios:**
- `/health/` returns 200 when DB+Redis are healthy
- `/health/` returns 503 when DB or Redis is down
- Health endpoint is unauthenticated

---

#### U11. Issue #71 — Frontend Component Tests

**Goal:** Increase frontend test coverage with page-level component tests using Vitest + React Testing Library.

**Blocked by:** U4 (TypeScript strict mode)

**Approach:**
- Write tests for `GameContext` and `UserContext` providers
- Write tests for `ErrorBoundary` component
- Write tests for key page components (Lobby, Room)
- Write tests for modal components (open/close, form submission)
- Use Vitest + React Testing Library (already configured)

**Files:** `frontend/src/**/*.test.tsx` (new test files)

**Test scenarios:**
- GameContext provides correct state and dispatches actions
- ErrorBoundary catches errors and renders fallback UI
- Lobby page renders and allows room creation/joining
- Room page displays game state
- Modal components open/close correctly

---

## Sequencing Summary

```
Week 1 (Parallel):   U1(#59) | U2(#60) | U3(#63) | U4(#64) | U5(#66) | U6(#65)
Week 2 (Deps):       U7(#67) ← U1
                     U10(#68) ← U1, U2
Week 3 (Auth-Deps):  U8(#69) ← U7  |  U9(#70) ← U7
Week 4 (Quality):    U11(#71) ← U4
```

## Key Technical Decisions

- **Auth:** JWT via `djangorestframework-simplejwt` for DRF endpoints (stateless, no session table needed)
- **DB migration:** One-time `dumpdata`/`loaddata` script, not live migration — acceptable for pre-production
- **Sentry:** DSN from environment, `send_default_pii=False`, traces at 0.1 sample rate in dev
- **Rate limiting (WebSocket):** Custom middleware in consumers.py, not nginx-level (nginx can't inspect WS message content)
