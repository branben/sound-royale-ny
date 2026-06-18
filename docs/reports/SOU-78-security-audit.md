# Security Audit Report — Sound Royale

**Issue:** SOU-78
**Date:** 2026-06-16
**Auditor:** CTO (Agent fd9c66b9)
**Severity Scale:** Critical / High / Medium / Low / Informational

---

## Executive Summary

The Sound Royale codebase is a Django 4.2.7 + Channels + React application with a real-time WebSocket game layer. The audit reviewed authentication, authorization, secret management, input validation, CORS/headers, Discord OAuth, WebSocket security, dependencies, and Docker configuration.

**Key findings:** The most significant issue is that development secrets exist in a committed `.env` file (now in `.gitignore`, but the `.env` was initially committed and needed manual removal). The application has good security patterns in some areas (WebSocket message type filtering, player_secret auth, Discord token encryption, linear webhook signature verification) but has critical gaps around authentication defaults, CORS production readiness, and missing security headers.

---

## Findings

### 🔴 CRITICAL

---

#### C1. Development SECRET_KEY in .env (Hardcoded Insecure Key)

- **Severity:** Critical
- **File:** `backend/.env`
- **Line:** 1
- **Description:** The `.env` file contains `SECRET_KEY=django-insecure-dev-key-sound-royale-2024-!k3y-ch4ng3-m3-1n-pr0duct10n` which is a hardcoded development key. The `.env` was committed to git at least once (required manual removal from git history). If this key was ever used in production, all sessions, CSRF tokens, and encrypted data are compromised. Even as a dev key, its presence in version history is a risk.
- **Recommended Fix:**
  1. Verify `backend/.env` is in `.gitignore` (confirmed ✓)
  2. Purge the key from git history using `git filter-branch` or `git filter-repo`
  3. For production, generate a new key: `python -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())"`
  4. Document the key rotation procedure

---

#### C2. Hardcoded Debug=True in Development .env

- **Severity:** Critical (if deployed)
- **File:** `backend/.env`
- **Line:** 2
- **Description:** `DEBUG=True` is set in the `.env` file. If this `.env` file (or a copy) is deployed to production, Django's debug mode will expose stack traces, settings, and SQL queries to end users. The settings file defaults DEBUG to False via `config()`, but the .env overrides it.
- **Recommended Fix:** Ensure production deployment uses a separate `.env` or environment variables with `DEBUG=False`. Add a deployment checklist that verifies DEBUG is off. Consider removing the `.env` default entirely and making production explicitly set it to a secure value.

---

### 🔴 HIGH

---

#### H1. All DRF Endpoints Use `AllowAny` (No Authentication Required)

- **Severity:** High
- **File:** `backend/sound_royale_api/settings.py`
- **Line:** 164-166
- **Description:** `REST_FRAMEWORK['DEFAULT_PERMISSION_CLASSES']` is set to `AllowAny`. Every API endpoint (Room, Player, Tile viewsets) publicly exposes full CRUD operations. While some endpoints use `player_secret` for action-level authorization (good), many endpoints like listing rooms, players, tiles, and theme rotations require no authentication at all. An attacker can enumerate all game rooms, player data, and tiles.
- **Recommended Fix:**
  1. Change default to `IsAuthenticated` or create a custom permission class
  2. Use token-based auth (DRF TokenAuth or JWT) for API access
  3. At minimum, protect list/detail endpoints and only allow creation without auth for the specific join flow
  4. Implement room-level authorization so players can only access their own room's data

---

#### H2. PlayerViewSet Lookup by player_secret Exposes Player Data

- **Severity:** High
- **File:** `backend/game_engine/views.py`
- **Lines:** 1446-1460
- **Description:** `PlayerViewSet` uses `lookup_field = "player_secret"`, meaning the player_secret is used as the URL identifier. Since player_secrets are UUIDs, this is reasonably unguessable, but it means any player's data is accessible if their secret is known. Additionally, the `PlayerCreateSerializer` returns `player_secret` in the response, which could be intercepted. The `perform_create` method also has a fallback path that can create players with arbitrary IDs (line 1769-1779 in `discord_link_account`) which could enable IDOR.
- **Recommended Fix:**
  1. Add rate limiting to Player endpoints
  2. Never expose player_secret in GET responses (only in POST create/join responses)
  3. Add room-level scoping to player lookups
  4. Remove the `player_id` override path in `discord_link_account` or add strict validation

---

#### H3. WebSocket Authentication via Query Parameters (Secrets in URLs)

- **Severity:** High
- **File:** `backend/game_engine/consumers.py`
- **Lines:** 43-44
- **Description:** WebSocket authentication passes `player_id` and `secret` as query parameters (`?player_id=...&secret=...`). Query parameters are logged in server access logs, browser history, proxy logs, and CDN logs. This exposes the player_secret (which is the primary auth credential) in plaintext across infrastructure. If the WebSocket connection fails or is logged, the secret is compromised.
- **Recommended Fix:**
  1. Use a short-lived WebSocket token (JWT or signed token) instead of the persistent player_secret
  2. Pass the token in the first WebSocket message after connection
  3. Or use HTTP-only cookies for WebSocket auth (with SameSite and Secure flags)
  4. Implement token rotation so compromised tokens have limited lifespan

---

#### H4. sqlite3 Database in Production Docker Configuration

- **Severity:** High (for production)
- **File:** `backend/sound_royale_api/settings.py`
- **Lines:** 86-89
- **Description:** The application uses SQLite (`django.db.backends.sqlite3`) as its database backend. SQLite does not support concurrent writes under load, has no user/access control, and the data file is stored on the local filesystem of the Docker container. If the container is compromised, the entire database (including player data, secrets, Discord tokens) is a single file to exfiltrate.
- **Recommended Fix:**
  1. Switch to PostgreSQL for production (`django.db.backends.postgresql`)
  2. Use environment variables for DB connection settings
  3. Enable database-level encryption at rest
  4. Set up regular backups with encryption

---

#### H5. No Redirect URI Validation in Discord OAuth Flow

- **Severity:** High
- **File:** `backend/game_engine/discord_service.py`
- **Lines:** 23, 66
- **Description:** The `DISCORD_REDIRECT_URI` is hardcoded to `http://localhost:8000/api/auth/discord/callback`. The `exchange_code_for_token` function sends this redirect_uri to Discord, but there is no server-side validation that the callback matches the expected URI. An attacker could potentially exploit an open redirect if the redirect_uri is dynamically influenced by user input in the future. Additionally, using `http://` (not `https://`) in production would expose the authorization code.
- **Recommended Fix:**
  1. Validate redirect_uri against a whitelist server-side
  2. Use `https://` in production
  3. Make the redirect_uri configurable per environment
  4. Validate the `request_uri` matches what was used in the authorization step

---

#### H6. No Content Security Policy (CSP) Headers

- **Severity:** High
- **File:** N/A (missing entirely)
- **Description:** No Content-Security-Policy headers are configured anywhere — not in Django settings, middleware, or nginx.conf. This means the frontend is vulnerable to XSS attacks that could load external scripts, styles, or frames. The React app may handle some of this client-side, but without CSP, a successful XSS injection has no browser-level mitigation.
- **Recommended Fix:**
  1. Add `django-csp` middleware
  2. Configure restrictive CSP in nginx: `add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' ws://localhost:8000;";`
  3. Add `add_header X-Content-Type-Options "nosniff";` (partially in Django, but should also be in nginx)
  4. Add `add_header Referrer-Policy "strict-origin-when-cross-origin";`

---

### 🟡 MEDIUM

---

#### M1. CORS Configuration Too Permissive for Production

- **Severity:** Medium
- **File:** `backend/sound_royale_api/settings.py`
- **Lines:** 140-144
- **Description:** `CORS_ALLOWED_ORIGINS` defaults to `http://localhost:5173,http://localhost:8080` and `CORS_ALLOW_CREDENTIALS = True`. The `docker-compose.yml` sets `CORS_ALLOWED_ORIGINS=http://localhost:80`. If the CORS environment variable is not properly set in production, the default allows any app running on localhost origins to make credentialed cross-origin requests. There's also no `CORS_ALLOW_METHODS` restriction beyond defaults.
- **Recommended Fix:**
  1. Set `CORS_ALLOWED_ORIGINS` explicitly from environment in production with no default
  2. Remove `CORS_ALLOW_CREDENTIALS = True` or scope it to specific endpoints
  3. Add explicit `CORS_ALLOW_METHODS` and `CORS_ALLOW_HEADERS` restrictions

---

#### M2. SECURE_HSTS_SECONDS Defaults to 0 (Disabled)

- **Severity:** Medium
- **File:** `backend/sound_royale_api/settings.py`
- **Line:** 146
- **Description:** `SECURE_HSTS_SECONDS = config('SECURE_HSTS_SECONDS', default=0, cast=int)` — HSTS is disabled by default. If SSL is deployed without setting this env var, browsers won't enforce HTTPS, leaving users vulnerable to SSL-stripping attacks.
- **Recommended Fix:** Set `SECURE_HSTS_SECONDS=31536000` (1 year) when SSL is enabled. Add `SECURE_HSTS_INCLUDE_SUBDOMAINS = True` and `SECURE_HSTS_PRELOAD = True`.

---

#### M3. SECURE_SSL_REDIRECT Defaults to False

- **Severity:** Medium
- **File:** `backend/sound_royale_api/settings.py`
- **Line:** 147
- **Description:** `SECURE_SSL_REDIRECT = False` by default. Without this, Django won't redirect HTTP to HTTPS, meaning credentials and session cookies can be transmitted over unencrypted connections.
- **Recommended Fix:** Set `SECURE_SSL_REDIRECT=True` in production. Combine with HSTS and secure cookie settings.

---

#### M4. SESSION_COOKIE_SECURE and CSRF_COOKIE_SECURE Default to False

- **Severity:** Medium
- **File:** `backend/sound_royale_api/settings.py`
- **Lines:** 148-149
- **Description:** `SESSION_COOKIE_SECURE` and `CSRF_COOKIE_SECURE` default to False, meaning session and CSRF cookies will be sent over HTTP. An attacker on the same network could intercept these.
- **Recommended Fix:** Both should default to `True` in production. Use environment-based conditional settings.

---

#### M5. No WebSocket Rate Limiting or Connection Throttling

- **Severity:** Medium
- **File:** `backend/game_engine/consumers.py`
- **Description:** The WebSocket consumer has no rate limiting on connections, message frequency, or connection count per IP/player. An attacker could flood the WebSocket endpoint with connections (DoS) or spam messages to disrupt games. While `ALLOWED_CLIENT_TYPES` restricts message types, it doesn't limit volume.
- **Recommended Fix:**
  1. Implement per-IP connection rate limiting in nginx: `limit_conn_zone` and `limit_req_zone` for `/ws/` paths
  2. Add per-player message rate limiting in the consumer (token bucket)
  3. Set maximum concurrent connections per room
  4. Add connection timeout for idle WebSocket connections

---

#### M6. No Input Length Validation on Player Name

- **Severity:** Medium
- **File:** `backend/game_engine/models.py`
- **Line:** 123
- **Description:** Player name is `CharField(max_length=50)` but there's no minimum length, profanity filter, or character restriction beyond what the database enforces. A player could join with a name like `" "` (whitespace) or a 50-character string of special characters, potentially causing display issues or XSS in the frontend.
- **Recommended Fix:**
  1. Add a validator in the serializer: `min_length=1`, regex validator for printable characters
  2. Strip whitespace and reject empty/whitespace-only names
  3. Add backend sanitization even if frontend also validates

---

#### M7. Discord OAuth State Validation in Callback (State from Cache Only)

- **Severity:** Medium
- **File:** `backend/game_engine/views.py`
- **Lines:** 1696-1714
- **Description:** The `discord_callback` endpoint validates the `state` parameter against a Django cache entry with a 10-minute timeout. However, there's no validation that the same state parameter can't be reused within that window (replay attack). After validation, the state is deleted from cache, which is good, but there's no binding between the state and the user's session.
- **Recommended Fix:**
  1. Bind the state to the user's session ID
  2. Add nonce/state rotation after use
  3. Reduce state timeout to 2-5 minutes

---

#### M8. Nginx Proxy Missing Security Headers

- **Severity:** Medium
- **File:** `nginx.conf`
- **Lines:** 1-24
- **Description:** The nginx configuration lacks any security headers. No `X-Frame-Options`, `X-Content-Type-Options`, `Content-Security-Policy`, `Referrer-Policy`, or `Strict-Transport-Security` headers are set at the nginx level. While some are configured in Django settings (`X_FRAME_OPTIONS = 'DENY'`), the nginx layer should also enforce these.
- **Recommended Fix:**
  ```nginx
  add_header X-Frame-Options "DENY" always;
  add_header X-Content-Type-Options "nosniff" always;
  add_header Referrer-Policy "strict-origin-when-cross-origin" always;
  add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' ws:;" always;
  add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
  ```

---

#### M9. Linear Webhook Secret Defaults to Empty String

- **Severity:** Medium
- **File:** `backend/sound_royale_api/settings.py`
- **Line:** 195
- **Description:** `LINEAR_WEBHOOK_SECRET = config('LINEAR_WEBHOOK_SECRET', default='')` — When the secret is empty, the `verify_linear_signature` function logs a warning and **accepts all webhooks without verification** (line 117-118 of webhooks.py). This means anyone can send forged Linear webhooks that get processed as real tasks.
- **Recommended Fix:** Reject webhooks when secret is not configured (return 401 instead of accepting). Make the secret required in production.

---

#### M10. THEME_ADMIN_SECRET Defaults to Empty String

- **Severity:** Medium
- **File:** `backend/sound_royale_api/settings.py`
- **Line:** 198
- **Description:** `THEME_ADMIN_SECRET` defaults to an empty string. The `ThemeRotationViewSet.update()` and `set_checked_in_by_player_id` check `if not configured_secret or provided_secret != configured_secret`, which means if the admin secret is not configured (empty string), an attacker could potentially provide an empty/wildcard secret or bypass the check depending on the comparison.
- **Recommended Fix:** When `configured_secret` is empty, reject all admin operations with a 501 "Not Configured" response instead of relying on client-provided comparison.

---

### 🟢 LOW

---

#### L1. Dependency Versions with Known CVEs

- **Severity:** Low (current versions are reasonably recent)
- **Files:** `backend/requirements.txt`, `package.json`
- **Description:**
  - **Django 4.2.7** — Not the latest patch (4.2.x latest). Django 4.2 is in LTS support but recent patches fix security issues. Lastest known CVEs in Django 4.2.7 include fixes up to that point.
  - **requests 2.31.0** — Known CVE-2023-32681 (credential leak via proxy redirect). Fixed in 2.32.0+.
  - **djangorestframework 3.14.0** — Current for DRF, no critical known issues
  - **channels 4.0.0** / **channels-redis 4.0.0** — Current, no critical known issues
  - **React 18.3.1** — Current minor, no critical known issues
  - **cryptography 48.0.0** — Very recent, good
- **Recommended Fix:**
  1. Upgrade `requests` to `>=2.32.0`
  2. Upgrade `Django` to latest 4.2.x patch
  3. Set up `pip audit` and `npm audit` in CI pipeline
  4. Use Dependabot or Renovate for automated dependency updates

---

#### L2. Docker Backend Runs as Root

- **Severity:** Low
- **File:** `Dockerfile.backend`
- **Description:** The Dockerfile uses `python:3.11-slim` without specifying a non-root user. The container runs Daphne as root, meaning if the application is compromised, the attacker has root access to the container filesystem.
- **Recommended Fix:**
  ```dockerfile
  RUN adduser --disabled-password --gecos '' appuser
  USER appuser
  ```

---

#### L3. Docker Redis Exposes Port 6379 Externally

- **Severity:** Low
- **File:** `docker-compose.yml`
- **Line:** 5
- **Description:** Redis port 6379 is mapped to the host (`"6379:6379"`), making it accessible from outside the Docker network. If the host is exposed, anyone can connect to Redis and read/write channel layer data, game state, or session data.
- **Recommended Fix:** Remove the port mapping or bind to localhost only: `"127.0.0.1:6379:6379"`. In production, Redis should not be exposed externally at all.

---

#### L4. No File Upload Size Limit

- **Severity:** Low
- **File:** `backend/game_engine/models.py`
- **Lines:** 197-203
- **Description:** The `audio_file` field has a `FileExtensionValidator` for mp3/wav/ogg/m4a but no file size limit. An attacker could upload very large files, filling disk space and causing DoS. Django's default `FILE_UPLOAD_MAX_MEMORY_SIZE` is 2.6MB and `DATA_UPLOAD_MAX_MEMORY_SIZE` is 2.6MB, but these are global settings.
- **Recommended Fix:**
  1. Add `MaxSizeValidator` to the audio_file field
  2. Configure nginx `client_max_body_size 10M;` in the `/api/` location
  3. Set Django `FILE_UPLOAD_MAX_MEMORY_SIZE` and `DATA_UPLOAD_MAX_MEMORY_SIZE` explicitly

---

#### L5. Error Log File Path World-Writable

- **Severity:** Low
- **File:** `backend/game_engine/views.py`
- **Lines:** 1924-1947
- **Description:** The `log_client_error` endpoint writes to `error_log.jsonl` in the backend directory. This file is not in `.gitignore` (only `backend/error_log.jsonl` is not explicitly listed). If this file grows unbounded, it could fill disk. Also, client-submitted data is written directly to disk without sanitization.
- **Recommended Fix:**
  1. Add `error_log.jsonl` to `.gitignore`
  2. Implement log rotation or size limits
  3. Sanitize client-submitted data before writing to disk

---

#### L6. No HTTPS in Docker Compose Environment

- **Severity:** Low (development)
- **File:** `docker-compose.yml`
- **Description:** The Docker Compose setup uses HTTP everywhere. The `CORS_ALLOWED_ORIGINS` is set to `http://localhost:80`. This is expected for development but should be documented that production must use HTTPS.
- **Recommended Fix:** Document production deployment requirements including HTTPS, and provide a production docker-compose override with TLS termination.

---

### ℹ️ INFORMATIONAL

---

#### I1. Positive Security Patterns Observed

The codebase has several good security practices worth noting:

1. **WebSocket message type filtering** (`consumers.py:16-26`): The `ALLOWED_CLIENT_TYPES` and `FORBIDDEN_CLIENT_TYPES` sets prevent clients from spoofing server-initiated messages. This is a strong defense against game state manipulation.

2. **Player secret authentication** (`consumers.py:58-70`, `views.py:627-631`): The `player_secret` UUID is used for action-level authorization on sensitive operations (toggle_ready, start_game, vote, kick_player, reset_game). This is a reasonable approach for a game where full user accounts aren't required.

3. **Discord token encryption** (`discord_service.py:93-99`): Access and refresh tokens are encrypted using Fernet (symmetric encryption from the `cryptography` library) before storage. This is a best practice for OAuth token storage.

4. **Linear webhook signature verification** (`webhooks.py:114-128`): HMAC-SHA256 signature verification is implemented correctly using `hmac.compare_digest` (timing-safe comparison).

5. **CSRF protection on webhooks** (`webhooks.py:131`): The `csrf_exempt` decorator is correctly applied only to the webhook endpoint (which needs to accept external POSTs), while the rest of the app maintains CSRF protection.

6. **State parameter in Discord OAuth** (`views.py:1675-1679`): CSRF protection via state parameter with cache-based validation and 10-minute expiry.

7. **Audit logging**: Comprehensive audit logging for security-relevant events (votes, ELO changes, voting opened, WebSocket connections).

---

#### I2. Recommendations for Future Hardening

1. **Implement proper user authentication**: Consider Django's built-in auth or JWT for persistent user accounts instead of relying solely on player_secret
2. **Add security.txt**: Publish a security.txt file for responsible disclosure
3. **Implement CORS preflight caching**: Add `CORS_PREFLIGHT_MAX_AGE` to reduce OPTIONS requests
4. **Add security monitoring**: Set up alerts for unusual patterns (mass room creation, rapid voting, etc.)
5. **Implement API versioning**: Plan for API versioning to allow security fixes without breaking changes
6. **Add security tests**: Write tests for auth bypass attempts, injection, and authorization checks

---

## Summary Table

| ID | Severity | Finding | File |
|----|----------|---------|------|
| C1 | 🔴 Critical | Development SECRET_KEY in committed .env | `backend/.env:1` |
| C2 | 🔴 Critical | Hardcoded DEBUG=True in .env | `backend/.env:2` |
| H1 | 🔴 High | All DRF endpoints use AllowAny | `settings.py:164-166` |
| H2 | 🔴 High | PlayerViewSet lookup by player_secret | `views.py:1446-1460` |
| H3 | 🔴 High | WebSocket auth via query parameters (secrets in URLs) | `consumers.py:43-44` |
| H4 | 🔴 High | SQLite in production Docker config | `settings.py:86-89` |
| H5 | 🔴 High | No redirect URI validation in Discord OAuth | `discord_service.py:23,66` |
| H6 | 🔴 High | No Content Security Policy headers | N/A (missing) |
| M1 | 🟡 Medium | CORS too permissive for production | `settings.py:140-144` |
| M2 | 🟡 Medium | SECURE_HSTS_SECONDS defaults to 0 | `settings.py:146` |
| M3 | 🟡 Medium | SECURE_SSL_REDIRECT defaults to False | `settings.py:147` |
| M4 | 🟡 Medium | Session/CSRF cookies not secure by default | `settings.py:148-149` |
| M5 | 🟡 Medium | No WebSocket rate limiting | `consumers.py` |
| M6 | 🟡 Medium | No input validation on player name | `models.py:123` |
| M7 | 🟡 Medium | Discord OAuth state not bound to session | `views.py:1696-1714` |
| M8 | 🟡 Medium | Nginx missing security headers | `nginx.conf` |
| M9 | 🟡 Medium | Linear webhook accepts all when secret empty | `settings.py:195`, `webhooks.py:117-118` |
| M10 | 🟡 Medium | THEME_ADMIN_SECRET defaults to empty | `settings.py:198` |
| L1 | 🟢 Low | Dependency versions with known CVEs | `requirements.txt`, `package.json` |
| L2 | 🟢 Low | Docker runs as root | `Dockerfile.backend` |
| L3 | 🟢 Low | Redis port exposed externally | `docker-compose.yml:5` |
| L4 | 🟢 Low | No file upload size limit | `models.py:197-203` |
| L5 | 🟢 Low | Client error log not in .gitignore | `views.py:1924-1947` |
| L6 | 🟢 Low | No HTTPS in Docker Compose | `docker-compose.yml` |

**Total: 2 Critical, 6 High, 10 Medium, 6 Low**
