---
title: Sound Royale Production Remediation Plan
type: fix
date: 2026-06-17
---

# Sound Royale Production Remediation Plan

## Executive Summary

This plan outlines the remediation steps required to bring the Sound Royale project to a production-ready state, addressing critical security, reliability, and quality issues identified in recent audits. The project currently scores ~25/100 for production readiness. This plan prioritizes immediate fixes for critical vulnerabilities (e.g., SQLite in production, insecure authentication, exposed secrets) and then addresses high and medium priority items. The remediation is structured into phases to allow for incremental deployment and minimal blast radius, focusing on parallelizable tracks where possible.

## Problem Frame

The Sound Royale application, while functional for development and CI, is not production-ready due to significant security vulnerabilities, architectural shortcomings, and missing operational capabilities. Key issues include:
- Use of SQLite in production with no persistence, leading to data loss.
- Absence of robust authentication for DRF and WebSockets, relying on easily exposed `player_secret`.
- Hardcoded sensitive information (Admin PIN in frontend, Django `SECRET_KEY` in git).
- Missing critical infrastructure components like rate limiting, comprehensive monitoring, and backup strategies.
- Quality issues such as disabled TypeScript strict mode and insufficient frontend testing.

## Scope Boundaries

This plan addresses all critical, high, and select medium-priority issues identified in the "Infrastructure & DevOps Production Audit" (SOU-84) and "Frontend Audit Report" (SOU-70) that prevent safe and reliable production deployment.

### In Scope

-   **Critical Issues**:
    1.  Replace SQLite with PostgreSQL and ensure data persistence.
    2.  Implement robust authentication for DRF and WebSockets.
    3.  Secure admin PIN access by moving logic to backend.
    4.  Rotate and secure the Django `SECRET_KEY`.
    5.  Disable PII sending in Sentry.
    6.  Implement comprehensive rate limiting.
-   **High Issues**:
    7.  Enable TypeScript strict mode.
    8.  Improve frontend testing (page-level components, contexts, modals, error boundaries).
    9.  Establish database migration strategy.
    10. Configure CORS allow-list securely.
    11. Secure WebSocket connections with proper authentication.
    12. Implement audio upload validation (size/type) on backend.
-   **Medium Issues**:
    13. Add Prettier configuration for consistent formatting.
    14. Integrate frontend error monitoring (Sentry).
    15. Nginx hardening (WebSocket timeouts, connection limiting, access logging, gzip, static asset caching, request size limit).
    16. Dockerfile hardening (multi-stage build for backend, non-root users, healthchecks, patched base images, `.dockerignore`, Daphne workers).
    17. CI/CD enhancements (Docker build test, security scanning, linting, staging deployment, smoke tests, database migration step, image tagging).
    18. Backend monitoring (health check endpoint, metrics collection, alerting, log aggregation, uptime monitoring, WebSocket connection monitoring).
    19. Backup strategy (Redis persistence, media file backup).
    20. Scaling considerations (channel layer configuration).
    21. Secure Django settings (HSTS, SSL redirect, secure cookies).
    22. DNS configuration.

### Out of Scope (for this plan)

-   Detailed UX/Accessibility fixes beyond critical/high security/functional issues.
-   Performance optimizations not directly related to critical/high audit findings (e.g., specific React memoization fixes not blocking core functionality).
-   Full implementation of a deployment pipeline (the plan covers adding the deploy stage to CI, but not the full infrastructure setup beyond Docker Compose).
-   Comprehensive disaster recovery planning beyond basic backups and rollback procedures.
-   Advanced scaling solutions (e.g., Redis cluster, horizontal pod autoscaling beyond initial config).
-   API versioning (Medium issue 17) will be considered for a follow-up plan, as it is less critical for initial production readiness.

---

## High-Level Technical Design

The remediation effort will focus on strengthening the core backend, securing data and access, and improving the frontend's robustness and maintainability. It will follow a phased approach:

1.  **Phase 1: Security & Data Foundation**: Address critical data persistence and authentication issues. This involves migrating to PostgreSQL, implementing core backend authentication, and securing all secrets.
2.  **Phase 2: Infrastructure Hardening**: Enhance the Docker and Nginx configurations for production, improving security, logging, and basic performance. This phase also includes CI/CD improvements to ensure builds are verified and scanned.
3.  **Phase 3: Application Quality & Frontend Integration**: Improve the frontend's code quality and error monitoring, ensuring all backend changes are reflected securely in the client-side interactions, especially for WebSockets.
4.  **Phase 4: Operational Readiness**: Implement comprehensive monitoring, backup strategies, and initial scaling considerations.

Each phase will contain implementation units designed to be independently deployable and minimize impact.

---

## Key Technical Decisions

*   **Authentication Mechanism**: JSON Web Tokens (JWT) for DRF endpoints for stateless authentication, with Django sessions for admin/browser-based flows. WebSockets will integrate with this new authentication scheme.
*   **Database Migration**: Direct switch from SQLite to PostgreSQL, requiring data migration scripting (e.g., `dumpdata` and `loaddata` for initial transfer, then standard Django migrations).
*   **Secret Management**: Environment variables for all secrets, managed through `python-decouple` in `settings.py` and Docker Compose environment configuration.
*   **Sentry**: Implement Sentry for both backend and frontend for comprehensive error monitoring, ensuring PII is excluded.
*   **Rate Limiting**: Nginx will handle basic request rate limiting at the edge; DRF throttling will be configured for API endpoints, and a custom Django Channels middleware will implement WebSocket rate limiting.
*   **Media Storage**: Transition from local filesystem storage for audio uploads to a cloud-based object storage solution (e.g., AWS S3 or compatible). This is a medium issue not explicitly called out as a CRITICAL/HIGH, but vital for persistence and scaling. It will be prioritized due to its direct impact on data integrity and horizontal scalability.

---

## Implementation Units

### Track A: Backend & Data Foundation (Critical)

#### U1. Migrate from SQLite to PostgreSQL

**Goal:** Replace SQLite with PostgreSQL for the backend database, ensuring data persistence and integrity.
**Requirements:** Critical 1 (SQLite in production), High 9 (No database migrations strategy), Critical 5.1 (SQLite in container), Critical 6.1 (SQLite cannot scale horizontally).
**Dependencies:** None (initial setup).
**Files:**
- `docker-compose.yml` (add PostgreSQL service)
- `docker-compose.prod.yml` (add PostgreSQL service, named volume for data)
- `backend/sound_royale_api/settings.py` (update `DATABASES` configuration)
- `backend/sound_royale_api/` (new migration script for data transfer)
**Approach:**
1.  Add a `db` service running PostgreSQL to `docker-compose.yml` and `docker-compose.prod.yml`.
2.  Define a named volume for the PostgreSQL data in `docker-compose.prod.yml`.
3.  Update `settings.py` to connect to PostgreSQL using environment variables (e.g., `DATABASE_URL`).
4.  Create a data migration script: `python manage.py dumpdata` from SQLite, then `loaddata` into PostgreSQL. This will be a one-time operation.
5.  Remove `db.sqlite3` from `.dockerignore` if it was there and ensure it's not committed.
**Test scenarios:**
-   Fresh install with PostgreSQL: Verify database initializes correctly and `manage.py migrate` runs successfully.
-   Data migration: Verify existing data from SQLite can be successfully migrated to PostgreSQL.
-   Application functionality: Ensure all backend operations involving the database (e.g., creating rooms, players, saving game state) work correctly with PostgreSQL.
**Verification:**
-   `docker compose up --build` brings up PostgreSQL.
-   Application functions normally, data persists across container restarts.

#### U2. Secure Django Secret Key & Sentry PII

**Goal:** Prevent exposure of Django's `SECRET_KEY` and ensure Sentry does not transmit PII by default.
**Requirements:** Critical 4 (Django secret key committed), Critical 5 (`send_default_pii=True` in Sentry config), Critical 9.3 (.env committed to git).
**Dependencies:** None.
**Files:**
- `backend/.env` (remove `SECRET_KEY`)
- `backend/sound_royale_api/settings.py` (ensure `SECRET_KEY` is loaded from environment, set `send_default_pii=False`)
- `.gitignore` (ensure `backend/.env` is listed)
**Approach:**
1.  **IMMEDIATELY**: Rotate the `SECRET_KEY`. Generate a new, strong key.
2.  Remove the `SECRET_KEY` from `backend/.env`. The key will be provided via environment variable at runtime (e.g., Docker Compose `environment` section or orchestrator).
3.  Verify `backend/sound_royale_api/settings.py` correctly loads `SECRET_KEY` from `config('SECRET_KEY')`.
4.  Set `send_default_pii=False` in `sentry_sdk.init` in `settings.py`.
5.  Run `git filter-branch` or BFG to remove the `SECRET_KEY` from git history. (This is a manual operation by an engineer, but noted in the plan).
**Test scenarios:**
-   Application starts successfully with `SECRET_KEY` provided via environment variable.
-   Sentry errors are logged, but user PII is not included in default payloads.
-   Attempting to access endpoints with an old secret key fails if applicable.
**Verification:**
-   Check Sentry payloads for PII.
-   Confirm `SECRET_KEY` is no longer in git history (manual check).

#### U3. Implement Backend User Authentication (Django DRF)

**Goal:** Replace `AllowAny` permissions with a robust, token-based authentication system for DRF endpoints.
**Requirements:** Critical 2 (No real auth).
**Dependencies:** U1 (PostgreSQL for session/token persistence), U2 (Secure Django Secret Key).
**Files:**
- `backend/sound_royale_api/settings.py` (configure `REST_FRAMEWORK` for authentication)
- `backend/sound_royale_api/urls.py` (add authentication-related URLs)
- `backend/game_engine/models.py` (potentially add `User` model, or link `Player` to Django's `User`)
- `backend/game_engine/serializers.py` (update serializers to reflect authenticated users)
- `backend/game_engine/views.py` (replace `AllowAny` with appropriate permission classes, update views to use `request.user`)
- `backend/game_engine/` (new authentication module/files, e.g., `authentication.py`)
**Approach:**
1.  Choose an authentication library (e.g., `djangorestframework-simplejwt`).
2.  Configure `REST_FRAMEWORK` in `settings.py` to use the chosen authentication class.
3.  Update `game_engine/views.py` to use appropriate permission classes (e.g., `IsAuthenticated` for most endpoints, custom permissions for `player_secret` equivalent if needed during transition).
4.  Refactor existing views that use `player_secret` for authorization to use `request.user` or other authenticated identity.
5.  Implement API endpoints for user registration, login, and token refresh.
**Test scenarios:**
-   Access to protected endpoints without a valid token is denied (401 Unauthorized).
-   Access to protected endpoints with a valid token is granted.
-   User registration and login flows work correctly.
-   `player_secret` based actions (toggle ready, start game, etc.) now require proper user authentication.
-   Admin endpoints (e.g., `set_checked_in_by_player_id`) require admin authentication.
**Verification:**
-   Manually test API endpoints with and without authentication tokens.
-   Review code for remaining `AllowAny` where not intended.

#### U4. Secure Admin PIN Access

**Goal:** Eliminate the Admin PIN from the frontend bundle and move admin authentication to the backend.
**Requirements:** Critical 3 (Admin PIN in frontend bundle).
**Dependencies:** U3 (Backend User Authentication).
**Files:**
- `frontend/src/pages/PlayerAdmin.tsx` (remove `VITE_THEME_ADMIN_PIN` usage)
- `frontend/src/pages/ThemeAdmin.tsx` (remove `VITE_THEME_ADMIN_PIN` usage)
- `backend/game_engine/views.py` (refactor `ThemeRotationViewSet.update` and `set_checked_in_by_player_id` to use Django admin/authenticated user)
- `backend/sound_royale_api/settings.py` (remove `THEME_ADMIN_SECRET`)
- `.env`, `.env.production` (remove `VITE_THEME_ADMIN_PIN`)
**Approach:**
1.  Modify backend admin endpoints (e.g., `ThemeRotationViewSet.update`, `set_checked_in_by_player_id`) to require authentication (e.g., `IsAdminUser` permission class) instead of `X-Theme-Admin-Secret` header.
2.  Update frontend admin components to use the new authentication flow and remove any client-side PIN storage or validation.
3.  Remove `VITE_THEME_ADMIN_PIN` from `.env` files.
**Test scenarios:**
-   Admin operations from frontend are only successful when authenticated as an admin user.
-   Admin operations fail without proper admin authentication.
-   Verify `VITE_THEME_ADMIN_PIN` is no longer present in the frontend JS bundle.
**Verification:**
-   Attempt admin actions with unauthenticated/non-admin users.
-   Inspect frontend bundle for `VITE_THEME_ADMIN_PIN` string.

---

### Track B: Infrastructure Hardening & Operational Readiness

#### U5. Implement Nginx Rate Limiting & Hardening

**Goal:** Protect Nginx from abuse by implementing request rate limiting and applying remaining security/performance best practices.
**Requirements:** Critical 6 (No rate limiting), High 2.4 (No rate limiting in Nginx), Medium 2.5 (No WebSocket proxy timeout tuning), Medium 2.6 (No WebSocket connection limiting), Low 2.7 (No access logging for API), Medium 2.9 (No gzip compression), Medium 2.10 (No static asset caching headers), Medium 2.11 (No request size limit).
**Dependencies:** None.
**Files:**
- `nginx.conf`
**Approach:**
1.  Add `limit_req_zone` and `limit_conn_zone` directives for API and WebSocket endpoints.
2.  Configure `proxy_read_timeout` and `proxy_send_timeout` for WebSocket locations (e.g., `3600s`).
3.  Implement `access_log` directives for API and WebSocket traffic.
4.  Enable `gzip` compression for appropriate content types.
5.  Add `expires` and `Cache-Control` headers for static assets.
6.  Set `client_max_body_size` for upload endpoints (e.g., `50M`).
**Test scenarios:**
-   API endpoints: Verify requests exceeding rate limits receive 429 Too Many Requests.
-   WebSocket connections: Verify long-lived connections are maintained and timeouts don't prematurely close them.
-   Static assets: Verify caching headers are present in responses.
-   Large file uploads: Verify large files can be uploaded up to the configured limit.
**Verification:**
-   Use `curl` or a load testing tool to test rate limits.
-   Inspect network requests in browser dev tools for caching and gzip headers.

#### U6. Dockerfile & Docker Compose Hardening

**Goal:** Improve Docker image security, reproducibility, and container health checks.
**Requirements:** High 1.1 (No resource limits), High 1.2 (No health checks in docker-compose), High 1.10 (Backend runs as root), Medium 1.9 (No multi-stage build), High 1.11 (No HEALTHCHECK instruction in Dockerfile.backend), Low 1.12 (Pinned base image to minor), Low 1.13 (No .dockerignore), Medium 1.14 (Daphne as single worker), Medium 1.16 (Frontend runs as root), Medium 1.17 (No HEALTHCHECK instruction in Dockerfile.frontend), Low 1.18 (Pinned base image to minor).
**Dependencies:** None.
**Files:**
- `docker-compose.yml`
- `docker-compose.prod.yml`
- `Dockerfile.backend`
- `Dockerfile.frontend`
- `.dockerignore` (new file)
**Approach:**
1.  **`Dockerfile.backend`**: Implement multi-stage build, add non-root user, add `HEALTHCHECK` instruction, pin base image to patch version.
2.  **`Dockerfile.frontend`**: Pin base images to patch versions, configure nginx to run as non-root, add `HEALTHCHECK` instruction.
3.  **`docker-compose.prod.yml`**: Add `healthcheck` configurations, `deploy.resources.limits`, `init: true` for backend/frontend, `logging` options, and potentially explicit `networks`. Update Daphne command to include workers.
4.  Create a `.dockerignore` file.
**Test scenarios:**
-   `docker compose build` succeeds.
-   `docker compose up` reports healthy containers after startup.
-   Backend/frontend containers run as non-root users.
-   Multi-stage builds reduce final image size for backend.
**Verification:**
-   `docker compose ps` shows `(healthy)` status.
-   `docker exec <container_id> whoami` shows non-root user.
-   Image size comparison before/after multi-stage build.

#### U7. CI/CD Enhancements

**Goal:** Improve CI pipeline to include Docker build tests, security scanning, linting, and support staging/production deployments.
**Requirements:** Critical 3.1 (No deployment pipeline), High 3.2 (No Docker build test), High 3.3 (No security scanning), Medium 3.4 (No linting/formatting checks), High 3.5 (No staging deployment), Medium 3.6 (No smoke tests post-deploy), Medium 3.7 (No database migration step), Medium 13 (No Prettier config), High 9.2 (No production settings file).
**Dependencies:** U1 (PostgreSQL), U6 (Docker hardening), Prettier config (Medium 13).
**Files:**
- `.github/workflows/gaia-guards-ci.yml`
- `pyproject.toml` (or `setup.cfg` for black/ruff)
- `package.json` (for eslint/prettier scripts)
- `backend/sound_royale_api/settings.py` (refactor into `settings_base.py`, `settings_dev.py`, `settings_prod.py`)
**Approach:**
1.  **Production Settings File**: Refactor `settings.py` into multiple files (e.g., `settings_base.py`, `settings_dev.py`, `settings_prod.py`) to manage environment-specific configurations cleanly.
2.  **Prettier**: Add `.prettierrc` configuration file and update `package.json` with a format script.
3.  **CI Workflow**:
    *   Add a job to run `docker compose build`.
    *   Integrate security scanning (e.g., Trivy for images, `pip audit`, `npm audit`).
    *   Add linting jobs (e.g., `flake8`/`black`/`ruff` for Python, `eslint`/`prettier` for TypeScript).
    *   Add staging and production deploy jobs (e.g., on PR merge to `main` for staging, on tag for production). This will initially be a placeholder for actual deployment logic.
    *   Include a post-deploy smoke test to hit the `/health/` endpoint (once implemented).
    *   Add a database migration step using `manage.py migrate` in the deploy pipeline.
    *   Implement an image tagging strategy (e.g., with git SHA).
**Test scenarios:**
-   CI pipeline runs successfully, including new build, scan, and linting steps.
-   Deployment jobs are triggered correctly for staging/production (initial jobs might just print messages).
-   `manage.py migrate` runs successfully in a CI context.
**Verification:**
-   GitHub Actions runs green.
-   Manual inspection of CI logs for linting/security scan output.

---

### Track C: Application Quality & Secure Frontend Integration

#### U8. WebSocket Authentication & Rate Limiting

**Goal:** Ensure WebSocket connections are properly authenticated before acceptance and apply rate limiting to prevent abuse.
**Requirements:** High 11 (No WebSocket auth), Critical 6 (No rate limiting on any endpoint or WebSocket).
**Dependencies:** U3 (Backend User Authentication).
**Files:**
- `backend/game_engine/consumers.py`
- `backend/sound_royale_api/settings.py` (if custom authentication backend for channels is needed)
**Approach:**
1.  Modify `GameConsumer.connect` to perform full authentication *before* `await self.accept()`. If authentication fails, `await self.close(code=4003)` (or similar error code) should be called.
2.  Integrate with the new backend authentication system (U3) to obtain user identity from the WebSocket handshake.
3.  Implement a custom Channels middleware or a throttling mechanism within `GameConsumer.receive` to rate limit messages per authenticated user or IP address.
**Test scenarios:**
-   WebSocket connection from an unauthenticated client is rejected before `accept()`.
-   WebSocket connection from an authenticated client is accepted.
-   Authenticated client sending messages exceeding rate limits is disconnected or ignored.
-   Frontend reconnects correctly after a rate-limit disconnection.
**Verification:**
-   Attempt WebSocket connection with invalid credentials and observe rejection.
-   Use a tool (e.g., `websocat`, custom script) to stress test WebSocket message rate.

#### U9. Frontend Sentry & Strict TypeScript

**Goal:** Add frontend error monitoring and enable strict TypeScript checks to improve code quality.
**Requirements:** Medium 14 (No frontend error monitoring), High 7 (TypeScript strict mode disabled).
**Dependencies:** None.
**Files:**
- `frontend/src/main.tsx` (or `App.tsx` for Sentry init)
- `frontend/tsconfig.json`
- `frontend/package.json` (add Sentry SDK)
**Approach:**
1.  Install `@sentry/react` SDK.
2.  Initialize Sentry in `frontend/src/main.tsx` or `App.tsx`, ensuring `traces_sample_rate` and `environment` are configured via environment variables.
3.  Update `frontend/tsconfig.json` to enable strict mode flags (`noImplicitAny`, `strictNullChecks`, `noUnusedLocals`, `noUnusedParameters`).
4.  Address all resulting TypeScript errors across the frontend codebase.
**Test scenarios:**
-   Frontend application builds successfully with strict TypeScript.
-   Frontend errors are reported to Sentry.
-   No new TypeScript errors are introduced by subsequent code changes.
**Verification:**
-   Manually trigger a frontend error and observe it in Sentry.
-   Run `npx tsc --noEmit` locally and ensure zero errors.

#### U10. CORS Allow-list & Media Upload Validation

**Goal:** Securely configure CORS for production and add backend validation for audio uploads.
**Requirements:** High 10 (No CORS allow-list), High 12 (Audio uploads have no size/type validation on backend).
**Dependencies:** U1 (PostgreSQL for media file storage might be relevant if directly tied to models).
**Files:**
- `backend/sound_royale_api/settings.py` (update `CORS_ALLOWED_ORIGINS`)
- `backend/sound_royale_api/urls.py` (if audio upload views exist)
- `backend/game_engine/views.py` (or other relevant view for audio uploads)
- `backend/game_engine/` (new file for audio upload logic/validation if not present)
**Approach:**
1.  Configure `CORS_ALLOWED_ORIGINS` in `settings.py` to be a strict allow-list for production, ideally dynamic via `DOMAIN` environment variable.
2.  **Audio Upload Validation**: Identify where audio uploads are handled. If no explicit view exists, create one. Implement server-side validation for file type (e.g., `.mp3`, `.wav`) and size (e.g., max 5MB).
3.  Ensure `MEDIA_ROOT` and `MEDIA_URL` are configured for static file serving, but consider offloading media files to cloud storage later (Medium 5.4).
**Test scenarios:**
-   Frontend application makes successful CORS requests to the backend API from allowed origins.
-   CORS requests from disallowed origins are rejected.
-   Uploading an unsupported file type results in a 400 Bad Request.
-   Uploading an oversized file results in a 400 Bad Request.
-   Valid audio uploads are processed successfully.
**Verification:**
-   Use `curl` to test CORS headers with different `Origin` headers.
-   Attempt to upload invalid/oversized audio files.

---

### Track D: Testing & Advanced Operational Readiness

#### U11. Frontend Component Testing

**Goal:** Increase frontend test coverage, especially for page-level components, contexts, modals, and error boundaries.
**Requirements:** High 8 (No page-level component tests), UX-A13 (No Unit Tests for Page Components), UX-T4 (No Tests for Context Providers), UX-T5 (No Tests for Modal Components), UX-T6 (No Tests for ErrorBoundary).
**Dependencies:** U9 (Strict TypeScript).
**Files:**
- `frontend/src/` (create new `.test.tsx` files for components/pages)
- `frontend/package.json` (ensure `vitest` is configured)
**Approach:**
1.  Prioritize tests for critical components: `GameContext`, `UserContext`, `ErrorBoundary`.
2.  Write tests for key pages: `Lobby`, `Room`.
3.  Cover interactive UI components like modals and complex forms.
4.  Focus on behavioral testing using `@testing-library/react`.
**Test scenarios:**
-   `GameContext` provides correct state and dispatches actions.
-   `ErrorBoundary` catches errors and displays fallback UI.
-   `Lobby` page renders correctly and allows joining/creating rooms.
-   `Room` page displays game state and allows player interactions.
**Verification:**
-   `npm run test` reports increased coverage for unit/component tests.

#### U12. Implement Comprehensive Backend Monitoring & Backup

**Goal:** Establish robust monitoring, alerting, and backup mechanisms for the backend and database.
**Requirements:** Critical 4.1 (No APM / error tracking for backend, covered by U2), Critical 4.2 (No health check endpoint), High 4.3 (No metrics collection), High 4.4 (No alerting), High 4.5 (No log aggregation), Medium 4.6 (No uptime monitoring), Medium 4.7 (No WebSocket connection monitoring), Critical 5.2 (No backup strategy), High 5.3 (No Redis persistence), Medium 5.4 (No media file backup), Critical 10.3 (No data recovery plan).
**Dependencies:** U1 (PostgreSQL), U2 (Sentry PII), U6 (Dockerfile/Compose hardening).
**Files:**
- `backend/sound_royale_api/settings.py` (update logging, add monitoring config)
- `backend/sound_royale_api/urls.py` (add health check endpoint)
- `backend/game_engine/views.py` (new health check view)
- `docker-compose.prod.yml` (add Redis volume, potentially add backup service)
- `backend/` (new files for backup scripts, monitoring setup)
**Approach:**
1.  **Health Check**: Create a simple Django view at `/health/` that checks database and Redis connectivity. Add this to `urls.py`.
2.  **Metrics**: Integrate `django-prometheus` or similar for metrics collection.
3.  **Log Aggregation**: Configure Django logging to send structured logs to a centralized system (e.g., stdout for Docker to be picked up by a log driver like CloudWatch Logs).
4.  **Sentry**: Ensure backend Sentry (configured in U2) is fully functional and set up alerts for error rates.
5.  **Redis Persistence**: Enable `appendonly yes` and mount a named volume for Redis in `docker-compose.prod.yml`.
6.  **DB Backup**: Implement automated daily `pg_dump` to an S3-compatible storage.
7.  **Media Backup**: Migrate audio uploads to S3-compatible storage using `django-storages`.
8.  **Uptime Monitoring**: Integrate with an external uptime monitoring service (e.g., UptimeRobot) targeting the `/health/` endpoint.
9.  **WebSocket Monitoring**: Add custom metrics in `consumers.py` to track active WebSocket connections.
**Test scenarios:**
-   Accessing `/health/` returns 200 OK when DB and Redis are healthy, and 500 when they are not.
-   Metrics endpoints expose data (e.g., `/metrics` for Prometheus).
-   Errors are logged and appear in Sentry.
-   Redis data persists across container restarts.
-   DB backups are created successfully.
-   Uploaded media files are stored in the configured S3-compatible storage.
**Verification:**
-   Check `/health/` endpoint.
-   Verify Sentry alerts.
-   Inspect Redis container for `appendonly.aof` file.
-   Verify S3 bucket contains backups.

#### U13. Backend Audio Upload Validation

**Goal:** Implement robust server-side validation for audio file type and size.
**Requirements:** High 12 (Audio uploads have no size/type validation on backend).
**Dependencies:** None (assumes an upload endpoint exists or will be created).
**Files:**
- `backend/game_engine/views.py` (or specific upload view)
- `backend/game_engine/serializers.py` (if using a serializer for upload)
- `backend/game_engine/models.py` (if storing file metadata)
**Approach:**
1.  Identify or create the API endpoint responsible for audio uploads.
2.  Implement validation logic to check `Content-Type` header for allowed audio formats (e.g., `audio/mpeg`, `audio/wav`).
3.  Implement validation logic to check file size against a maximum limit (e.g., 5MB).
4.  Return appropriate HTTP 400 Bad Request responses for invalid files.
**Test scenarios:**
-   Uploading a `.jpg` file results in a 400 error due to invalid type.
-   Uploading an `.mp3` file larger than 5MB results in a 400 error due to excessive size.
-   Uploading a valid `.mp3` file within size limits succeeds.
**Verification:**
-   Use `curl` or Postman to test upload endpoint with various valid/invalid files.

---

## Sequencing and Parallelization

The plan is broken into tracks to facilitate parallel work. Dependencies between units within a track are explicit.

**Track A: Backend & Data Foundation**
*   U1 (Migrate to PostgreSQL) -> U3 (Backend User Authentication) -> U4 (Secure Admin PIN Access)
*   U2 (Secure Django Secret Key & Sentry PII) can run in parallel with U1.

**Track B: Infrastructure Hardening & Operational Readiness**
*   U5 (Nginx Rate Limiting & Hardening) and U6 (Dockerfile & Docker Compose Hardening) can run in parallel with Track A.
*   U7 (CI/CD Enhancements) depends on some aspects of U1 (PostgreSQL for migrations) and U6 (Docker builds). Prettier config can run independently.

**Track C: Application Quality & Secure Frontend Integration**
*   U8 (WebSocket Authentication & Rate Limiting) depends on U3 (Backend User Authentication).
*   U9 (Frontend Sentry & Strict TypeScript) can run in parallel with Track A and B.
*   U10 (CORS Allow-list & Media Upload Validation) can largely run in parallel, though backend validation parts might depend on U3 if authentication is integrated.

**Track D: Testing & Advanced Operational Readiness**
*   U11 (Frontend Component Testing) depends on U9 (Strict TypeScript).
*   U12 (Comprehensive Backend Monitoring & Backup) depends on U1 (PostgreSQL) and U2 (Sentry PII).
*   U13 (Backend Audio Upload Validation) can run in parallel with other units.

**Overall recommended order:**
1.  **Phase 1: Foundation (CRITICAL)**: U1, U2, U3, U4.
2.  **Phase 2: Core Infra & Basic App Quality**: U5, U6, U7, U9.
3.  **Phase 3: Secure & Robust Interactions**: U8, U10, U13.
4.  **Phase 4: Deep Testing & Operational Maturity**: U11, U12.

---

## System-Wide Impact

*   **Authentication Flow**: All user-facing authentication will change, impacting both frontend and backend APIs/WebSockets.
*   **Database**: Complete migration from SQLite to PostgreSQL will affect deployment, local development, and backup procedures.
*   **Infrastructure**: Docker Compose, Dockerfiles, and Nginx configurations will be updated, requiring careful testing of the deployment process.
*   **Monitoring**: New monitoring tools (Sentry, Prometheus) will be integrated, providing better visibility but also requiring configuration and maintenance.
*   **CI/CD**: The CI pipeline will be extended to include more checks and deployment steps, potentially increasing build times initially.
*   **Frontend Development**: Enabling TypeScript strict mode will require addressing existing type errors but will improve long-term code quality.

---
