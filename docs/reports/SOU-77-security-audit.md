# SOU-77: Security Audit Report — Sound Royale

**Date:** 2026-06-16
**Scope:** Full codebase security audit
**Severity scale:** Critical | High | Medium | Low | Informational

---

## Executive Summary

The Sound Royale codebase has a solid security-aware foundation (CSRF protection, token encryption, state-parameter OAuth, audit logging, input validation, rate-limiting infrastructure, XSS/HSTS/DENY config hooks). However, several issues — most critically the dev `.env` being tracked in git and `DEBUG=True` in the committed config — need immediate remediation before any production deployment. This report covers 21 findings across 8 audit domains.

---

## 1. Authentication & Authorization

### [HIGH] AUTH-001: All DRF endpoints use `AllowAny` permission classes
- **File:** `backend/sound_royale_api/settings.py:164-165`
- **Description:** `REST_FRAMEWORK['DEFAULT_PERMISSION_CLASSES']` is set to `AllowAny` globally. While individual actions use `player_secret` for sensitive operations (toggle_ready, start_game, vote, kick, etc.), the following endpoints have no auth at all:
  - `RoomViewSet.list()` — lists ALL rooms with full player data (including names, elo, tiles, board state)
  - `RoomViewSet.retrieve()` — gets full game state for any room code
  - `RoomViewSet.game_state()` — gets full round state + votes for any room
  - `ThemeRotationViewSet` (GET) — publicly readable (acceptable)
  - `PlayerViewSet.list()` — lists ALL players across ALL rooms
  - `TileViewSet` (all actions) — CRUD on any tile by UUID
  - `PlayerViewSet.genre_performance` — any player's stats by UUID
  - `log_client_error` — open endpoint (acceptable for frontend error reporting)
  - `LinearWebhookView` — open POST (protected by HMAC signature instead, which is correct)
- **Impact:** Any unauthenticated actor can enumerate rooms, players, game boards, tiles, and scores. They can also modify/delete any room, player, or tile via the REST API (PUT/PATCH/DELETE on ViewSets), though ModelViewSet update/destroy don't check `player_secret`.
- **Fix:**
  1. Change `DEFAULT_PERMISSION_CLASSES` to `IsAuthenticated` or a custom permission.
  2. For game-critical endpoints, verify `player_secret` on write operations or switch to session/token auth.
  3. For read-only public endpoints (`game_state`, `list`, `retrieve`), consider a custom `IsAuthenticatedOrReadOnly` with room-code-based access.
  4. Add `player_secret` verification to `TileViewSet`, `PlayerViewSet.update/destroy`, and `RoomViewSet.update/destroy` (currently missing).
  5. Add `http_method_names` restrictions to ViewSets that shouldn't allow all methods (e.g., `ThemeRotationViewSet` already does this with `['get', 'put', 'head', 'options']` — good).

### [HIGH] AUTH-002: Missing auth on ViewSet update/destroy/partial_update
- **File:** `backend/game_engine/views.py` (all ViewSets)
- **Description:** `ThemeRotationViewSet.update()` checks `THEME_ADMIN_SECRET`, but `RoomViewSet`, `PlayerViewSet`, and `TileViewSet` do NOT verify `player_secret` on their inherited `update()`, `partial_update()`, or `destroy()` methods. Any client can push arbitrary data to any resource by UUID.
- **Impact:** Full read/write access to all game resources without any authorization.
- **Fix:** Override `update()`, `partial_update()`, `destroy()` on each ViewSet to require `player_secret`, or deny these methods entirely via `http_method_names`.

### [MEDIUM] AUTH-003: player_secret transmitted in URL query params (WebSocket)
- **File:** `backend/game_engine/consumers.py:41-44`
- **Description:** `player_id` and `secret` are passed as WebSocket query parameters. These are visible in:
  - Server access logs (nginx, daphne)
  - Browser history / devtools
  - Any intermediate proxies or load balancers
- **Impact:** Persistent session token exposed in URLs. An attacker with log access can hijack sessions.
- **Fix:** Move auth to a custom WebSocket subprotocol header, or use a short-lived JWT token passed in a Sec-WebSocket-Protocol header, or authenticate via HTTP-only cookie before connecting.

### [LOW] AUTH-004: Admin endpoints use shared-secret header for auth
- **File:** `backend/game_engine/views.py:151-157`, `backend/game_engine/views.py:398-404`
- **Description:** `set_checked_in_by_player_id` and `ThemeRotationViewSet.update()` use a shared `X-Theme-Admin-Secret` header for authorization. This is a static bearer token — same for all admin clients, no rotation, no per-user identity.
- **Impact:** Compromise of the secret grants full admin control over theme rotations and player check-in status.
- **Fix:** Integrate Django's built-in auth or a proper admin role system. At minimum, ensure `THEME_ADMIN_SECRET` is a strong random value and rotated regularly.

---

## 2. Secret Management

### [CRITICAL] SECRET-001: Dev SECRET_KEY and DEBUG=True in committed `.env` file
- **File:** `backend/.env` (lines 1-2)
- **Description:** The `.env` file contains `SECRET_KEY=django-insecure-dev-key-sound-royale-2024-!k3y-ch4ng3-m3-1n-pr0duct10n` and `DEBUG=True`. While `.gitignore` currently excludes it (good), the `.env` file with these committed values exists in the working tree and must never be pushed.
- **Impact:**
  - If `.env` is pushed to any remote, the Django secret key is compromised — attackers can forge sessions, CSRF tokens, and signed data.
  - `DEBUG=True` in production exposes stack traces, settings, SQL queries, and enables detailed error pages.
- **Fix:**
  1. Confirm `.gitignore` already covers this (it does — `backend/.env` is listed).
  2. Generate a proper random secret: `python -c "import secrets; print(secrets.token_urlsafe(50))"`
  3. Create a `.env.example` template with placeholder values for onboarding.
  4. Set `DEBUG=False` and use environment-specific `.env` files or a secrets manager (e.g., Docker secrets, AWS SSM) in production.
  5. Add a CI check to fail if `.env` is committed.

### [HIGH] SECRET-002: Empty `LINEAR_WEBHOOK_SECRET` and `THEME_ADMIN_SECRET` in production
- **File:** `backend/sound_royale_api/settings.py:195-198`
- **Description:** Both secrets default to empty string if not set. For webhooks, this means signature verification is silently skipped (`verify_linear_signature` returns `True` when secret is empty). For `THEME_ADMIN_SECRET`, if not configured, the comparison `provided_secret != configured_secret` evaluates `"" != ""` → `False`, so any request WITHOUT the header can update theme rotations.
- **Impact:**
  - Linear webhooks accept unverified payloads — attacker can inject arbitrary tasks into the GAIA queue.
  - Theme rotations can be modified without any secret if `THEME_ADMIN_SECRET` is not set.
- **Fix:** Add production assertions that raise `ImproperlyConfigured` when these secrets are empty (similar to how `DISCORD_ENCRYPTION_KEY` already does for production).

### [MEDIUM] SECRET-003: Discord OAuth client secret loaded from env but no validation
- **File:** `backend/game_engine/discord.py:22`
- **Description:** `DISCORD_CLIENT_SECRET` defaults to empty string. If misconfigured, OAuth token exchange will fail with a confusing error rather than a clear startup failure.
- **Impact:** Silent misconfiguration in production.
- **Fix:** Add startup validation that required OAuth env vars are set when `DEBUG=False`.

---

## 3. Input Validation

### [MEDIUM] INPUT-001: Unrestricted file uploads on Tile
- **File:** `backend/game_engine/models.py:197-204`, `backend/game_engine/views.py:1652`
- **Description:** `Tile.audio_file` uses `FileExtensionValidator` for mp3/wav/ogg/m4a, and the view (`play_tile`, line 1650-1652) accepts `request.FILES.get("audio_file")` and saves it directly. However:
  - No file size limit is enforced.
  - No content-type validation (extension-only can be spoofed).
  - Upload path `audio/%Y/%m/%d/` could allow path traversal in filenames.
- **Impact:** Large file DoS, potential storage exhaustion, possible malicious file upload.
- **Fix:**
  1. Add `FILE_UPLOAD_MAX_MEMORY_SIZE` and `DATA_UPLOAD_MAX_MEMORY_SIZE` in settings.
  2. Validate content type (magic bytes) on upload.
  3. Sanitize filenames before saving.
  4. Consider a dedicated media storage service (S3) with size/IAM constraints.

### [MEDIUM] INPUT-002: `log_client_error` accepts arbitrary JSON without sanitization
- **File:** `backend/game_engine/views.py:1927-1947`
- **Description:** The endpoint accepts arbitrary `path`, `method`, `status`, `message`, `stack`, and `component_stack` fields and writes them to a JSONL file. No length limits or content filtering.
- **Impact:** Log injection / log flooding — an attacker can write massive amounts of data or inject fake log entries. The `ERROR_LOG_PATH` is inside the backend directory and could potentially be served if media/static config is wrong.
- **Fix:** Add field length limits, use Django's logging framework instead of raw file writes, and ensure the log directory is not served.

### [LOW] INPUT-003: No validation on player_name length or content in create room
- **File:** `backend/game_engine/views.py:464-465`
- **Description:** `player_name` from `serializer.validated_data` is used directly to create a Player. The model allows 50 chars, but the view doesn't add extra validation (no rate limiting on room creation, no profanity/XSS filtering for names displayed in frontend).
- **Impact:** XSS via player name if frontend doesn't escape. Stored XSS is likely since names are rendered in the game UI.
- **Fix:** Ensure the frontend escapes all user-generated content (React does this by default — confirm no `dangerouslySetInnerHTML` on player names). Add a name validation regex on the backend.

---

## 4. CORS & Security Headers

### [HIGH] CORS-001: CORS_ALLOW_CREDENTIALS=True without explicit origin regex
- **File:** `backend/sound_royale_api/settings.py:140-144`
- **Description:** `CORS_ALLOW_CREDENTIALS = True` is set globally while `CORS_ALLOWED_ORIGINS` comes from env var. If the env var is misconfigured to include unauthenticated origins, cookies/credentials will be sent cross-origin.
- **Impact:** If an attacker-controlled origin is accidentally added to `CORS_ALLOWED_ORIGINS`, they can make credentialed cross-origin requests to the API.
- **Fix:** Document that `CORS_ALLOWED_ORIGINS` must never include untrusted origins. Consider using `CORS_ALLOWED_ORIGIN_REGEXES` with a strict pattern. In production, validate the list at startup.

### [MEDIUM] CORS-002: Security headers default to non-enforcing in development
- **File:** `backend/sound_royale_api/settings.py:146-152`
- **Description:** `SECURE_SSL_REDIRECT`, `SESSION_COOKIE_SECURE`, and `CSRF_COOKIE_SECURE` all default to `False`. `SECURE_HSTS_SECONDS` defaults to `0` (disabled). `X_FRAME_OPTIONS` is set to `DENY` (good). `SECURE_CONTENT_TYPE_NOSNIFF` and `SECURE_BROWSER_XSS_FILTER` are `True` (good).
- **Impact:** In production, if these env vars aren't explicitly configured, the site will work over HTTP without HSTS, and cookies will be sent unencrypted.
- **Fix:** Set `SECURE_SSL_REDIRECT=True`, `SESSION_COOKIE_SECURE=True`, `CSRF_COOKIE_SECURE=True`, `SECURE_HSTS_SECONDS=31536000` (1 year) in production. Use a production-specific settings file or env file.

### [MEDIUM] CORS-003: No Content Security Policy (CSP) header
- **File:** (not present anywhere)
- **Description:** No CSP header is configured — neither in Django settings nor in nginx.conf. This means inline scripts, external scripts, and eval() are unrestricted.
- **Impact:** If an XSS vulnerability is found (e.g., in a player name), CSP would be a critical defense-in-depth layer to limit its impact.
- **Fix:** Add `django-csp` package and configure `CSP_DEFAULT_SRC`, `CSP_SCRIPT_SRC`, `CSP_STYLE_SRC`, `CSP_IMG_SRC` headers in Django or nginx.

### [LOW] CORS-004: Missing Referrer-Policy and Permissions-Policy headers
- **File:** (not present)
- **Description:** No `Referrer-Policy` or `Permissions-Policy` headers are set in nginx or Django.
- **Impact:** Leaks full Referer headers to third parties; browser features (camera, microphone, geolocation) are unrestricted.
- **Fix:** Add `Referrer-Policy: strict-origin-when-cross-origin` and `Permissions-Policy: camera=(), microphone=(), geolocation=()` in nginx config or via Django middleware.

---

## 5. Discord OAuth Security

### [MEDIUM] OAUTH-001: No redirect URI validation in OAuth flow
- **File:** `backend/game_engine/discord_service.py:23`, `backend/game_engine/views.py:1691-1742`
- **Description:** The `redirect_uri` is constructed at module load time and used in both `get_authorization_url()` and `exchange_code_for_token()`. Discord validates the redirect_uri matches the app registration, but the code doesn't validate the `state` parameter cryptographically — it only checks if it exists in cache (prevents CSRF but doesn't bind the state to a specific user session).
- **Impact:** An attacker could potentially use their own state parameter if they can trigger the callback with a code they obtained (discouraged by Discord's code binding, but defense-in-depth matters).
- **Fix:** Include a nonce or user identifier in the state parameter and validate it on callback. Ensure the `redirect_uri` in token exchange exactly matches the registered URI (already relies on this, but add explicit assertion).

### [LOW] OAUTH-002: Discord access_token returned in full to client
- **File:** `backend/game_engine/views.py:1725-1734`
- **Description:** The callback endpoint returns `access_token`, `refresh_token`, and `expires_in` in the JSON response to the client. These tokens should ideally stay server-side.
- **Impact:** If the client stores these tokens insecurely (e.g., localStorage), they could be exfiltrated via XSS.
- **Fix:** Store tokens server-side in the session or `DiscordAccount` model and only return non-sensitive user info (username, avatar) to the client.

---

## 6. WebSocket Security

### [HIGH] WS-001: No connection-level rate limiting
- **File:** `backend/game_engine/consumers.py:28-94`, `backend/game_engine/routing.py:1-6`
- **Description:** The WebSocket `connect()` handler accepts connections without any rate limiting. An attacker can open unlimited WebSocket connections to exhaust server resources (Daphne workers, Redis memory for channel layer).
- **Impact:** Denial of service via connection flooding.
- **Fix:** Implement connection rate limiting using Django Channels middleware or nginx `limit_conn` directive per IP. Consider channels-limiter or a custom `ThrottleMiddleware`.

### [MEDIUM] WS-002: No message rate limiting or size limits
- **File:** `backend/game_engine/consumers.py:121-171`
- **Description:** The `receive()` handler processes messages without any per-connection rate limit or message size limit. While only `vote_submitted` and `bingo_achievement` types are allowed, a malicious client could send thousands of these per second.
- **Impact:** Resource exhaustion, potential for spam broadcasts to all connected clients in a room.
- **Fix:** Add per-connection rate limiting (e.g., max 10 msg/sec). Add a max message size check (reject messages > 10KB).

### [LOW] WS-003: Unauthenticated players can observe game state
- **File:** `backend/game_engine/consumers.py:40-44`, `58-61`
- **Description:** WebSocket connections without `player_id`/`secret` are still accepted and added to the room group. They receive all game state broadcasts including board tiles, player names, and votes.
- **Impact:** Snooping on any game without joining. Acceptable for a spectator-style game model but worth noting.
- **Fix:** This may be intentional for the game design. If not, reject connections without valid credentials (close with code 4401).

---

## 7. Dependency Vulnerabilities

### [HIGH] DEPS-001: 10 high-severity npm vulnerabilities
- **File:** `package.json`
- **`axios` (<1.15.1)** — HIGH — NO_PROXY normalization bypass leading to SSRF, Auth bypass via prototype pollution. `fixAvailable: v1.15.1`
- **`esbuild` (0.25.12)** — HIGH — Dev server accepts arbitrary requests from any origin. `fixAvailable: v0.28.1`
- **`rollup` (4.x)** — HIGH — Arbitrary file write via path traversal. `fixAvailable: next major`
- **`vite` (5.4.19)** — HIGH — Path traversal in optimized deps source maps. `fixAvailable: v8.0.16` (major upgrade)
- **`picomatch`** — HIGH — Method injection in POSIX character classes.
- **`minimatch`** — HIGH — ReDoS via repeated wildcards.
- **`lodash`** — HIGH — Code injection via `_.template`.
- **`form-data`** — HIGH — CRLF injection in multipart fields.
- **`flatted`** — HIGH — Unbounded recursion DoS.
- **`lovable-tagger`** — HIGH — (Update to 1.0.20)
- **Fix:** Run `npm audit fix` for auto-fixable items. For `vite`, `rollup`, and `esbuild`, these are devDependencies — the production build is already compiled, so the risk is limited to the development environment. Still, update to patched versions.

### [MEDIUM] DEPS-002: 6 moderate-severity npm vulnerabilities
- **`ajv`** — ReDoS via `$data` option
- **`brace-expansion`** — Zero-step sequence causes hang
- **`follow-redirects`** — Leaks auth headers on cross-domain redirect
- **`js-yaml`** — Quadratic DoS in merge key handling
- **`react-router` / `react-router-dom`** — Open redirect via protocol-relative URL
- **Fix:** `npm audit fix` should resolve these.

### [LOW] DEPS-003: Python dependencies — no known CVEs in direct dependencies
- **File:** `backend/requirements.txt`
- **Description:** pip-audit found no vulnerabilities in the 11 direct dependencies. However, `Django==4.2.7` is an older patch release (current 4.2.x is 4.2.20+). While no CVEs were flagged for this specific version, staying current is best practice.
- **Fix:** Update to latest Django 4.2.x LTS patch: `Django>=4.2.20,<5.0`.

---

## 8. Docker & Infrastructure Security

### [HIGH] DOCKER-001: Redis has no password and exposes port 6379
- **File:** `docker-compose.yml:2-6`
- **Description:** Redis runs with no authentication (`requirepass` not set) and port 6379 is published to the host. Any process on the host (or container network) can connect to Redis and:
  - Read/modify channel layer messages
  - Inject arbitrary WebSocket messages
  - Read cached OAuth state tokens
- **Impact:** Full compromise of WebSocket communication and session state.
- **Fix:**
  1. Set a Redis password: `redis:7-alpine` with `command: redis-server --requirepass ${REDIS_PASSWORD}`.
  2. Remove `ports: - "6379:6379"` — other containers can reach it via the internal network at `redis:6379`.
  3. Update `REDIS_URL` in docker-compose to include the password.

### [MEDIUM] DOCKER-002: Backend runs Daphne as root in container
- **File:** `Dockerfile.backend`
- **Description:** The Dockerfile doesn't create a non-root user. Daphne runs as root by default. If the process is compromised, the attacker has root in the container.
- **Impact:** Container escape is easier with root privileges.
- **Fix:** Add a non-root user in the Dockerfile:
  ```dockerfile
  RUN adduser --disabled-password --no-create-home daphne
  USER daphne
  ```

### [MEDIUM] DOCKER-003: No health checks in docker-compose
- **File:** `docker-compose.yml`
- **Description:** No `healthcheck` directives are defined for any service. Docker cannot detect if the backend is healthy or restart it automatically.
- **Impact:** Unhealthy containers may continue serving traffic.
- **Fix:** Add health checks:
  ```yaml
  healthcheck:
    test: ["CMD", "curl", "-f", "http://localhost:8000/api/webhooks/linear/"]
    interval: 30s
    timeout: 10s
    retries: 3
  ```

### [LOW] DOCKER-004: nginx serves without HTTPS or security headers
- **File:** `nginx.conf`
- **Description:** The nginx config listens on port 80 only (no SSL/TLS). No security headers are configured (no CSP, HSTS, X-Frame-Options, Referrer-Policy). The `X-Real-IP` header is set but `X-Forwarded-For` and `X-Forwarded-Proto` are not.
- **Impact:** All traffic is unencrypted. No defense-in-depth headers at the proxy layer.
- **Fix:**
  1. Add SSL/TLS termination (Let's Encrypt or self-signed for dev).
  2. Add security headers in nginx config.
  3. Set `X-Forwarded-For` and `X-Forwarded-Proto` headers.
  4. Add `proxy_hide_header X-Powered-By` to avoid leaking server info.

### [LOW] DOCKER-005: Docker images use mutable tags
- **File:** `Dockerfile.backend:1`, `Dockerfile.frontend:1`
- **Description:** `python:3.11-slim` and `node:20-alpine` are mutable tags. A future pull could get a different base image.
- **Impact:** Non-reproducible builds, potential for supply chain attacks.
- **Fix:** Pin to digest: `python:3.11-slim@sha256:...` and `node:20-alpine@sha256:...`.

---

## Summary Table

| ID | Severity | Category | Title |
|----|----------|----------|-------|
| SECRET-001 | **CRITICAL** | Secrets | Dev SECRET_KEY + DEBUG=True in committed .env |
| AUTH-001 | HIGH | Auth | All DRF endpoints use AllowAny |
| AUTH-002 | HIGH | Auth | No auth on ViewSet update/destroy |
| CORS-001 | HIGH | CORS | CORS_ALLOW_CREDENTIALS without strict origin validation |
| WS-001 | HIGH | WebSocket | No connection rate limiting |
| SECRET-002 | HIGH | Secrets | Empty webhook/theme secrets bypass verification |
| DEPS-001 | HIGH | Dependencies | 10 high-severity npm vulnerabilities |
| DOCKER-001 | HIGH | Docker | Redis unauthenticated + port exposed |
| AUTH-003 | MEDIUM | Auth | player_secret in WebSocket query params |
| AUTH-004 | MEDIUM | Auth | Shared-secret admin auth (no rotation) |
| INPUT-001 | MEDIUM | Input | Unrestricted file uploads |
| INPUT-002 | MEDIUM | Input | Unsanitized client error logging |
| CORS-002 | MEDIUM | Headers | Security headers default to non-enforcing |
| CORS-003 | MEDIUM | Headers | No Content Security Policy |
| OAUTH-001 | MEDIUM | OAuth | No redirect URI validation / state binding |
| WS-002 | MEDIUM | WebSocket | No message rate limiting or size limits |
| DOCKER-002 | MEDIUM | Docker | Containers run as root |
| DOCKER-003 | MEDIUM | Docker | No health checks |
| INPUT-003 | LOW | Input | No player name content validation |
| CORS-004 | LOW | Headers | Missing Referrer-Policy / Permissions-Policy |
| OAUTH-002 | LOW | OAuth | Discord tokens returned to client |
| WS-003 | LOW | WebSocket | Unauthenticated players can observe games |
| DOCKER-004 | LOW | Docker | No HTTPS or security headers in nginx |
| DOCKER-005 | LOW | Docker | Mutable Docker image tags |
| DEPS-003 | LOW | Dependencies | Django patch version outdated |

---

## Positive Security Observations

1. **CSRF protection** is enabled globally via middleware and exempted only where necessary (webhooks).
2. **Discord token encryption** using Fernet (cryptography library) — tokens are encrypted at rest.
3. **OAuth state parameter** with cache-based validation prevents CSRF on the Discord OAuth flow.
4. **Audit logging** via `game_audit` logger for security-relevant events (votes, ELO changes, voting opened).
5. **WebSocket message type filtering** — server-only message types are rejected from clients.
6. **Rate limiting infrastructure** is configured (DRF throttling at 100/hr anon, 1000/hr user).
7. **X_FRAME_OPTIONS = DENY** prevents clickjacking.
8. **SECURE_CONTENT_TYPE_NOSNIFF** and **SECURE_BROWSER_XSS_FILTER** are enabled.
9. **File extension validation** on audio uploads.
10. **HSTS/SSL redirect config hooks** are present (just need to be enabled in production).
11. **.gitignore** properly excludes `.env`, secrets, keys, and credentials.
12. **Linear webhook HMAC-SHA256 signature verification** is implemented correctly.
