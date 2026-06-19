---
title: Production Remediation Execution Plan
type: fix
date: 2026-06-19
status: active
---

# Production Remediation Execution Plan

## Executive Summary

This plan consolidates the 11 open GitHub issues (#59–#71) into an execution-ready sequence. These are the remaining items from the Sound Royale production remediation effort — the last barrier between the current pre-production state and a deployable product. Three predecessor issues (#58, #61, #62) are already closed.

The work spans four phases: **Foundation** (parallelizeable infrastructure/quality), **Authentication** (security-critical, depends on Foundation), **Security Integration** (admin + WebSocket hardening, depends on Auth), and **Monitoring & Quality** (operational readiness, depends on Foundation). Each implementation unit maps 1:1 to an issue for traceability.

---

## Problem Frame

Sound Royale is functional for development and CI but not production-ready. The 11 open issues represent the remaining gaps after initial remediation:
- **Data loss risk**: SQLite in production with no persistence across restarts
- **No authentication**: All DRF endpoints use `AllowAny`; player identity is a query-parameter `player_secret` that any observer can steal
- **Secrets exposed**: Admin PIN baked into frontend JS bundle; Django `SECRET_KEY` in git history
- **No input validation**: Audio uploads accept any file type/size
- **No frontend error monitoring**: Sentry only on backend; frontend errors invisible
- **TypeScript strict mode disabled**: ~14.5k LOC frontend has no strict null/type checks
- **No health endpoint, no backup strategy, no Redis persistence**
- **No formatting enforcement**: Prettier configured but not enforced
- **Docker/nginx not hardened**: No resource limits, rate limiting, or security headers
- **Minimal frontend tests**: ~10 unit tests for 14.5k LOC

---

## Scope Boundaries

### In Scope
- All 11 open GitHub issues (#59–#71) as defined in their issue bodies
- The updated plan at `docs/plans/2026-06-18-001-fix-remaining-production-remediation-issues-plan.md` is the source of truth for issue-level triage
- Completed items (#58, #61, #62) are not reopened

### Deferred to Follow-Up Work
- Media file migration to S3/cloud storage (called out in #68 but out of scope for MVP)
- Horizontal scaling (Redis cluster, multiple Daphne workers)
- Advanced CI/CD deployment pipeline (beyond GitHub Actions checks)
- Full disaster recovery beyond basic backup/restore documentation

---

## Dependency Map

```
                ┌─────────────────────────────────────────────┐
                │  Phase 1: Foundation (Parallel)              │
                │                                              │
                │  #59 PostgreSQL ───┐    #66 Prettier         │
                │  #60 Secrets       │    #65 Docker/Nginx     │
                │  #63 Upload Valid  │    #64 Sentry+Strict ──┐│
                └──────────────────┬─┘    └──────────────────┬─┘
                                   │                         │
                                   ▼                         ▼
                ┌──────────────────┴─────────────────────────┴──┐
                │  Phase 2: Authentication                      │
                │  #67 Player Auth ◄── #59                      │
                └──────────────────┬───────────────────────────-┘
                                   │
                                   ▼
                ┌──────────────────┴───────────────────────────-┐
                │  Phase 3: Security Integration                │
                │  #69 Admin PIN ◄── #67                        │
                │  #70 WS Auth   ◄── #67                        │
                └──────────────────┬───────────────────────────-┘
                                   │
                                   ▼
                ┌──────────────────┴───────────────────────────-┐
                │  Phase 4: Monitoring & Quality                │
                │  #68 Health/Monitoring ◄── #59, #60          │
                │  #71 Component Tests   ◄── #64               │
                └──────────────────────────────────────────────-┘
```

---

## Key Technical Decisions

| Decision | Rationale |
|----------|-----------|
| **Auth: JWT via `djangorestframework-simplejwt`** | Stateless, no session table needed, matches DRF convention. Token in Authorization header. |
| **DB migration: one-time `dumpdata`/`loaddata`** | Pre-production; acceptable for current scale. Live migration not needed until production data exists. |
| **Sentry DSN: environment variable, not hardcoded** | Different DSNs per environment (dev/staging/prod). `send_default_pii=False`. |
| **WS auth: token in query param on connect** | Django Channels can inspect query string before `accept()`. No first-message protocol needed. |
| **Rate limiting: nginx (connection) + DRF throttling (API) + Channels middleware (WS)** | Three-layer defense. Nginx at edge, DRF for REST, custom middleware for WebSocket message-level. |
| **Admin: `IsAdminUser` permission class** | Replaces `X-Theme-Admin-Secret` header. Builds on Django's built-in admin flag. |
| **Prettier + ESLint: separate concerns** | Prettier for formatting, ESLint for logic errors. No `eslint-config-prettier` conflict since both already configured. |
| **TS strict mode: enable all flags at once** | Issues are systemic — fixing incrementally would leave safety gaps. Better to fix all at once. |

---

## Implementation Units

### Phase 1: Foundation

#### U1. Issue #59 — Migrate PostgreSQL (CRITICAL)

**Goal:** Replace SQLite with PostgreSQL for production data persistence.

**Dependencies:** None

**Files:**
- `docker-compose.yml` — add PostgreSQL service for dev
- `docker-compose.prod.yml` — add PostgreSQL service with named volume for production
- `backend/sound_royale_api/settings.py` — update `DATABASES` to use env vars
- `backend/requirements.txt` — add `psycopg2-binary`
- `.github/workflows/gaia-guards-ci.yml` — add PostgreSQL service container for CI
- `docs/operations/data-migration.md` — new doc for SQLite → PostgreSQL migration steps

**Approach:**
1. Add `db` service to both compose files using `postgres:16-alpine` with named volume for production
2. `settings.py` already supports env-based config (`DB_ENGINE`, `DB_NAME`, `DB_HOST`, etc.) — verify and ensure defaults work for dev with SQLite fallback
3. Add `psycopg2-binary` to requirements
4. Update CI workflow to spin up a PostgreSQL service container for backend tests
5. Create documentation for one-time data migration (`dumpdata` → `loaddata`)
6. Remove `db.sqlite3` from anywhere it's tracked

**Test scenarios:**
- Fresh provision: `python manage.py migrate` runs successfully against PostgreSQL
- App functionality: create room, join, play tile, claim bingo all work against PostgreSQL
- Data persistence: data survives `docker compose down && docker compose up`
- CI: backend tests pass against PostgreSQL service container
- Dev convenience: local dev still works with SQLite by default

**Verification:** `docker compose up --build` brings up PostgreSQL; app functions normally; data persists across restarts.

---

#### U2. Issue #60 — Rotate SECRET_KEY + Sentry PII + .env Hygiene (CRITICAL)

**Goal:** Remove hardcoded secret from git history, disable PII in Sentry, secure .env handling.

**Dependencies:** None

**Files:**
- `backend/.env` — remove SECRET_KEY value (keep as env var ref)
- `backend/.env.example` — new file with placeholder values
- `backend/sound_royale_api/settings.py` — verify SECRET_KEY loaded from env, set `send_default_pii=False`
- `.gitignore` — ensure `backend/.env` is listed

**Approach:**
1. Generate new cryptographically secure SECRET_KEY
2. Verify settings.py loads SECRET_KEY from `config('SECRET_KEY')` (already done per previous plan)
3. Set `send_default_pii=False` in Sentry init (already done per previous plan)
4. **Git history scrub**: Use `git filter-repo` to remove the old hardcoded SECRET_KEY from all commits
5. Create `.env.example` with all required env vars and placeholder values
6. Verify no hardcoded secret remains via `git grep SECRET_KEY $(git rev-list --all)`
7. Force-push to remote (coordinate with any collaborators)

**Test scenarios:**
- App starts successfully with SECRET_KEY from environment variable
- Old secret key no longer appears anywhere in git history
- Sentry error payloads contain no PII by default
- `.env.example` accurately documents all required environment variables

**Verification:** `git grep <old-secret-value>` returns zero matches across all history.

---

#### U3. Issue #63 — Audio Upload Validation (Security)

**Goal:** Server-side validation for file size (max 10MB) and MIME type (audio allowlist).

**Dependencies:** None

**Files:**
- `backend/game_engine/views.py` — add validation to upload endpoint
- `backend/game_engine/serializers.py` — add FileExtensionValidator or custom validation
- `backend/sound_royale_api/settings.py` — add `MAX_UPLOAD_SIZE` config
- `backend/game_engine/tests/` — new test file for upload validation

**Approach:**
1. Identify the upload endpoint view and serializer
2. Add `Content-Type` header validation against allowlist: `audio/mpeg`, `audio/wav`, `audio/ogg`, `audio/flac`, `audio/x-flac`
3. Add file size check against configurable max (default 10MB)
4. Return HTTP 400 with clear error messages for invalid files
5. Add Django `FILE_UPLOAD_MAX_MEMORY_SIZE` or custom setting

**Test scenarios:**
- Valid `.mp3`/`.wav`/`.ogg` file under size limit → 200 success
- Non-audio file (`.jpg`, `.pdf`) → 400 with MIME-type error
- Oversized file (>10MB) → 400 with size error
- Missing file in request → 400
- Boundary test: file exactly at size limit → 200
- Boundary test: file 1 byte over size limit → 400

**Verification:** Backend tests pass; `curl` upload tests confirm error codes.

---

#### U4. Issue #64 — Frontend Sentry + TypeScript Strict Mode (Quality)

**Goal:** Frontend error monitoring and zero TypeScript strict errors.

**Dependencies:** None

**Files:**
- `frontend/package.json` — add `@sentry/react`
- `frontend/src/main.tsx` — initialize Sentry with env-based DSN
- `frontend/tsconfig.json` — enable `strict: true`
- Various `.ts`/`.tsx` files across `frontend/src/` — fix strict mode type errors

**Approach:**
1. Install `@sentry/react` and initialize in `main.tsx` with `dsn` from env, `traces_sample_rate: 0.1`, `send_default_pii: false`
2. Enable `strict: true` in `tsconfig.json` (equivalent to enabling all strict flags individually)
3. Fix all resulting type errors:
   - `strictNullChecks` — add null checks, optional chaining, or default values where values can be null/undefined
   - `noImplicitAny` — add explicit type annotations
   - `noUnusedLocals` / `noUnusedParameters` — remove or prefix with `_`
4. Run both blocks independently — Sentry is quick, strict mode is the bulk of effort
5. Execute note: Fix TS strict errors incrementally by running `npx tsc --noEmit` after each file change

**Test scenarios:**
- `npx tsc --noEmit` passes with zero errors
- `npm run build` succeeds
- Frontend errors appear in Sentry dashboard (manual trigger test)
- All existing frontend tests still pass

**Verification:** `npx tsc --noEmit` clean; Sentry dashboard shows test event.

---

#### U5. Issue #66 — Prettier Config + CI Enforcement (Quality)

**Goal:** Consistent code formatting with CI enforcement.

**Dependencies:** None

**Files:**
- `.prettierrc` — project formatting conventions (already exists, verify/update)
- `.prettierignore` — exclude build artifacts
- `package.json` — add `format:check` and `format:fix` scripts
- `.github/workflows/gaia-guards-ci.yml` — add prettier check step

**Approach:**
1. Verify `.prettierrc` conventions match project style (single quotes, trailing commas, 100 char width typical for this stack)
2. Ensure `.prettierignore` excludes `dist/`, `node_modules/`, `backend/`, `coverage/`
3. Run `npx prettier --write .` on all frontend source files
4. Add `format:check` script to package.json
5. Add CI step: `npx prettier --check src/`

**Test scenarios:**
- `npx prettier --check .` passes on all source files
- CI fails if unformatted code is pushed
- ESLint and Prettier do not conflict (verify with no conflicting rules)

**Verification:** CI shows green prettier check.

---

#### U6. Issue #65 — Harden Docker Compose + Nginx (Infrastructure)

**Goal:** Production-hardened Docker and nginx configurations.

**Dependencies:** None

**Files:**
- `docker-compose.prod.yml` — add resource limits, healthchecks, restart policies
- `nginx.conf` — add rate limiting, proxy timeouts, gzip, cache headers
- `Dockerfile.backend` — add non-root user, HEALTHCHECK
- `Dockerfile.frontend` — add non-root user, HEALTHCHECK
- `.dockerignore` — exclude dev artifacts

**Approach:**
1. **Docker Compose**: Add `deploy.resources.limits` (memory/CPU) to all services; `restart: unless-stopped`; healthchecks for backend and frontend
2. **nginx**: Add `limit_req_zone` for API endpoints; configure `proxy_read_timeout` 3600s for WebSocket; enable gzip; set `Cache-Control` for static assets; `client_max_body_size 50M`
3. **Dockerfiles**: Add non-root user to backend (`USER django` or similar); add `HEALTHCHECK` instruction to both Dockerfiles; create `.dockerignore`

**Test scenarios:**
- `docker compose build` succeeds
- All containers show `(healthy)` in `docker compose ps`
- Containers run as non-root (`whoami` in container returns non-root)
- Static assets have `Cache-Control` headers in response
- Rate-limited requests receive 429
- WebSocket connections maintained for extended periods

**Verification:** `docker compose ps` shows healthy; browser dev tools show cache headers; `curl` rate limit test.

---

### Phase 2: Authentication

#### U7. Issue #67 — Session-Based Player Auth (CRITICAL)

**Goal:** Replace `AllowAny` with proper JWT authentication on DRF endpoints.

**Dependencies:** U1 (PostgreSQL — for user/token persistence)

**Files:**
- `backend/sound_royale_api/settings.py` — configure `DEFAULT_AUTHENTICATION_CLASSES`, `DEFAULT_PERMISSION_CLASSES`, JWT settings
- `backend/sound_royale_api/urls.py` — add auth endpoints (obtain token, refresh token)
- `backend/game_engine/authentication.py` — new file, custom auth if needed
- `backend/game_engine/views.py` — replace `AllowAny` with `IsAuthenticated` (or `IsAuthenticatedOrReadOnly` where appropriate)
- `backend/game_engine/serializers.py` — update serializers for auth context
- `backend/game_engine/models.py` — link Player to Django User if needed
- `frontend/src/services/api.ts` — update API client to include JWT token in Authorization header
- `frontend/src/contexts/UserContext.tsx` — manage auth state (token storage, refresh)
- Backend test files — update to authenticate before making requests

**Approach:**
1. Install `djangorestframework-simplejwt`
2. Configure `REST_FRAMEWORK` with JWT authentication and `IsAuthenticated` as default permission
3. Add token obtain and refresh endpoints
4. Link existing `Player` model to Django's `User` model (ForeignKey or OneToOneField)
5. Update views: remove `AllowAny`, add `permission_classes = [IsAuthenticated]` (keep health check and room list public)
6. Update serializers to include auth context
7. Frontend: store JWT token in memory/localStorage, send as `Authorization: Bearer <token>` header
8. Frontend: handle 401 responses by redirecting to login
9. Update all backend tests to authenticate before API calls

**Test scenarios:**
- Unauthenticated request to protected endpoint → 401
- Authenticated request to protected endpoint → 200
- Token refresh works (expired token refreshed)
- Login flow creates valid JWT
- Health endpoint remains unauthenticated → 200
- Room list remains unauthenticated → 200
- All existing game flows work with auth (create room, join, start, play, vote)
- Invalid/expired token → 401

**Verification:** Backend tests pass; frontend game flow end-to-end with auth.

---

### Phase 3: Security Integration

#### U8. Issue #69 — Move Admin PIN to Backend (CRITICAL)

**Goal:** Remove admin secret from frontend bundle; validate admin operations server-side.

**Dependencies:** U7 (Player auth — admin check uses same auth system)

**Files:**
- `backend/game_engine/views.py` — add `IsAdminUser` permission to admin endpoints
- `backend/game_engine/serializers.py` — update admin serializers if needed
- `frontend/src/pages/PlayerAdmin.tsx` — remove `VITE_THEME_ADMIN_PIN`, call backend for auth
- `frontend/src/pages/ThemeAdmin.tsx` — remove `VITE_THEME_ADMIN_PIN`, call backend for auth
- `.env`, `.env.production` — remove `VITE_THEME_ADMIN_PIN`

**Approach:**
1. Backend: Apply `IsAdminUser` permission class to `ThemeRotationViewSet.update` and `set_checked_in_by_player_id`
2. Frontend: Remove client-side PIN check; admin pages check `user.is_staff` or call backend admin check endpoint
3. Verify `VITE_THEME_ADMIN_PIN` is absent from frontend JS bundle

**Test scenarios:**
- Admin operation with authenticated admin user → 200
- Admin operation with non-admin authenticated user → 403
- Admin operation without authentication → 401
- `VITE_THEME_ADMIN_PIN` string absent from built JS bundle (`grep` on dist/)
- Non-admin user cannot access admin UI flows

**Verification:** `grep VITE_THEME_ADMIN_PIN dist/assets/*.js` returns nothing; admin flows work for authorized users only.

---

#### U9. Issue #70 — WebSocket Authentication (CRITICAL)

**Goal:** Authenticate WebSocket connections before accepting; reject unauthenticated with close code 4003.

**Dependencies:** U7 (Player auth — WS auth uses same JWT)

**Files:**
- `backend/game_engine/consumers.py` — add auth check in `connect()` before `accept()`
- `backend/sound_royale_api/settings.py` — WS rate limiting config
- `frontend/src/hooks/useWebSocket.ts` — send auth token on connect
- Backend test files — test authenticated/unauthenticated WS connections

**Approach:**
1. In `GameConsumer.connect()`, extract JWT from query string parameter
2. Validate token against the JWT auth backend
3. If valid: call `self.accept()` and store `self.user`
4. If invalid: call `self.close(code=4003)` — do NOT call `accept()` first
5. Add message rate limiting: track messages per second per connection in `receive()`, disconnect if exceeded
6. Frontend: pass JWT token as `?token=<jwt>` query param when creating WebSocket connection
7. Frontend: handle 4003 close by redirecting to login

**Test scenarios:**
- Unauthenticated WS connection → rejected with close code 4003 (before accept)
- Authenticated WS connection with valid token → accepted
- Authenticated WS with expired/invalid token → rejected with 4003
- Rate-limited client → disconnected or receives throttling close code
- Existing game flow (tile claims, round progression) works with authenticated WS
- Frontend reconnects correctly with valid token after disconnect

**Verification:** WebSocket tests pass; game flow end-to-end with authenticated WS.

---

### Phase 4: Monitoring & Quality

#### U10. Issue #68 — Health Endpoint + Backup Strategy (Infrastructure)

**Goal:** Production monitoring with health checks, Redis persistence, and backup documentation.

**Dependencies:** U1 (PostgreSQL), U2 (Sentry config)

**Files:**
- `backend/game_engine/views.py` — add `/health/` endpoint
- `backend/sound_royale_api/urls.py` — register health endpoint
- `backend/sound_royale_api/settings.py` — configure structured JSON logging
- `docker-compose.prod.yml` — enable Redis AOF persistence with volume mount
- `docs/operations/backup-restore.md` — new doc for backup/restore procedures

**Approach:**
1. Create health endpoint view that checks:
   - PostgreSQL connectivity (`connection.is_usable()`)
   - Redis connectivity (`ping()`)
2. Return 200 if all healthy, 503 if any check fails
3. Keep health endpoint unauthenticated (for load balancer probes)
4. Enable Redis `appendonly yes` in Docker Compose with named volume
5. Configure Django logging for structured JSON output to stdout
6. Document PostgreSQL backup (`pg_dump` schedule) and restore procedure
7. Document Redis persistence configuration

**Test scenarios:**
- `/health/` returns 200 when DB + Redis are healthy
- `/health/` returns 503 when DB or Redis is unavailable
- Health endpoint is unauthenticated
- Redis data survives container restart (AOF file persists)
- Django logs are valid JSON

**Verification:** `curl /health/` returns correct status; Redis AOF file present on disk; logs parseable as JSON.

---

#### U11. Issue #71 — Frontend Component Tests (Quality)

**Goal:** Increase frontend test coverage with page-level component tests.

**Dependencies:** U4 (TypeScript strict mode — tests should be written against strict-typed code)

**Files:**
- `frontend/src/contexts/GameContext.test.tsx` — new
- `frontend/src/contexts/UserContext.test.tsx` — new
- `frontend/src/components/ErrorBoundary.test.tsx` — new
- `frontend/src/pages/Lobby.test.tsx` — new
- `frontend/src/pages/Room.test.tsx` — new
- `frontend/src/components/game/BingoBoard.test.tsx` — new
- Plus test files for 2+ modal components

**Approach:**
1. **Context providers**: Test `GameContext` and `UserContext` — provider wrapping, state initialization, consumer updates
2. **ErrorBoundary**: Test that it catches rendering errors and displays fallback UI
3. **Page components**: Test `Lobby` (renders room list, create/join actions) and `Room` (game state display)
4. **Modal components**: Test open/close behavior, form submission, keyboard handling (Escape to close)
5. Use Vitest + React Testing Library (already configured)
6. Mock API calls and WebSocket where needed for isolation

**Test scenarios:**
- GameContext: provides default state, dispatches actions correctly, wraps children
- UserContext: stores auth state, clears on logout
- ErrorBoundary: catches thrown error, renders fallback with error message
- Lobby: renders room list, create room button triggers API call, join room navigates
- Room: displays player list, shows game board when game started, shows join buttons when not a player
- Modal: opens on trigger, closes on Escape key, submits form on Enter
- All tests pass: `npx vitest run`

**Verification:** Test count increases from ~10 to 20+; `npx vitest run` passes; coverage meaningfully increased.

---

## Sequencing Summary

```
Week 1 (Phase 1 — Foundation):
  U1 (#59) PostgreSQL Migration
  U2 (#60) Secret Rotation
  U3 (#63) Upload Validation
  U4 (#64) Sentry + TS Strict
  U5 (#66) Prettier Config
  U6 (#65) Docker/Nginx Hardening
  └── All parallel — no dependencies

Week 2 (Phase 2 — Auth):
  U7 (#67) Player Authentication ← U1
  └── Sequential — depends on PostgreSQL

Week 3 (Phase 3 — Security Integration):
  U8 (#69) Admin PIN to Backend ← U7
  U9 (#70) WS Authentication    ← U7
  └── Can run in parallel once U7 is done

Week 4 (Phase 4 — Quality):
  U10 (#68) Health + Monitoring ← U1, U2
  U11 (#71) Component Tests     ← U4
  └── Can run in parallel once dependencies met
```

---

## System-Wide Impact

| Area | Impact |
|------|--------|
| **Authentication** | All API and WebSocket interactions require JWT. Frontend must manage token lifecycle. Existing `player_secret`-based flows must migrate. |
| **Database** | Complete switch from SQLite to PostgreSQL. Affects local dev (opt-in PG), CI (PG service container), and production (named volume, backup). |
| **Frontend** | TS strict mode will surface many type errors that need fixing. Auth state management added. Sentry dependency added. |
| **Infrastructure** | Docker, nginx, and compose files updated. Non-root users, health checks, resource limits, rate limiting. |
| **Monitoring** | Health endpoint, structured logging, Sentry for frontend, Redis persistence, backup documentation. |
| **CI/CD** | Prettier check added. PostgreSQL service for backend tests. |

---

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| TS strict mode errors are extensive | High | Medium | Fix incrementally, run `tsc --noEmit` after each file. Do not ship with `@ts-ignore`. |
| Auth breaks existing game flows | Medium | High | Write characterization tests before auth changes. Manual E2E after auth is wired. |
| Git history scrub is destructive | Medium | High | Coordinate with all collaborators before force-push. Backup repo first. |
| PostgreSQL migration loses data | Low | Critical | Test migration on staging DB first. Keep SQLite backup until verified. |
| WS auth blocks game flow | Medium | High | Implement frontend token-passing carefully. Test reconnect flows with token expiry. |

---

## Deferred to Follow-Up Work

- **Cloud media storage** (S3/django-storages for audio uploads) — called out in #68 but out of current scope
- **Horizontal scaling** — Redis cluster, multiple Daphne workers, database read replicas
- **Full deployment pipeline** — beyond GitHub Actions to automated staging/production deploy
- **API versioning** — consider after auth and monitoring are stable
- **E2E WebSocket mocking** — infrastructure work needed for reliable E2E WS tests
