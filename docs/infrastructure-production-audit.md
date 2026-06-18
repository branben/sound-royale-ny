# SOU-84: Infrastructure & DevOps Production Audit

**Audited by:** CTO (e58f3805)
**Date:** 2026-06-16
**Scope:** Docker, Nginx, CI/CD, Monitoring, Backup, Scaling, SSL/TLS, DNS/CDN, Environment Parity, Disaster Recovery

---

## Executive Summary

Sound Royale's infrastructure is in **early development stage** — functional for local dev and CI, but **not production-ready**. The setup has no production deployment pipeline, no monitoring, no backup strategy, no SSL/TLS termination, no health checks, and runs everything as root in containers. The application uses SQLite (not PostgreSQL), has no horizontal scaling path, and the `.env` file with a hardcoded secret key was committed to git (though now gitignored).

**Overall readiness: ~15/100 for production.**

---

## 1. Docker

### docker-compose.yml

| # | Issue | Severity | File | Current State | Recommended Fix |
|---|-------|----------|------|---------------|-----------------|
| 1.1 | **No resource limits** — containers can consume all host memory/CPU | HIGH | `docker-compose.yml:8-31` | No `deploy.resources.limits` on any service | Add `deploy.resources.limits` (memory + cpus) to each service |
| 1.2 | **No health checks** — Docker can't detect crashed services | HIGH | `docker-compose.yml` | No `healthcheck` on any service | Add `healthcheck` blocks: `curl -f http://localhost:8000/health/` for backend, `curl -f http://localhost:80/` for frontend |
| 1.3 | **No named volumes** — SQLite DB lost on container restart | CRITICAL | `docker-compose.yml` | No volumes defined; DB stored in ephemeral container filesystem | Add named volume for `db.sqlite3` and Redis `appendonly` persistence |
| 1.4 | **No restart policy differentiation** — all `unless-stopped` | LOW | `docker-compose.yml` | All services use same restart policy | Consider `always` for production; `unless-stopped` is fine for dev |
| 1.5 | **No logging driver** — default json-file can fill disk | MEDIUM | `docker-compose.yml` | No `logging` config on any service | Add `logging: driver: json-file, options: max-size: "10m", max-file: "3"` |
| 1.6 | **No networks defined** — all on default bridge | LOW | `docker-compose.yml` | No custom networks | Define explicit `networks` for frontend/backend isolation |
| 1.7 | **No init process** — PID 1 issues with signal handling | MEDIUM | `docker-compose.yml` | No `init: true` on any service | Add `init: true` to backend and frontend services |
| 1.8 | **Exposed ports on all interfaces** — `0.0.0.0` binding | MEDIUM | `docker-compose.yml:5,13,28` | Redis exposed on `6379:6379` (all interfaces) | Bind Redis to `127.0.0.1:6379:6379` or remove port mapping entirely (inter-container comms don't need it) |

### Dockerfile.backend

| # | Issue | Severity | File | Current State | Recommended Fix |
|---|-------|----------|------|---------------|-----------------|
| 1.9 | **No multi-stage build** — build deps in final image | MEDIUM | `Dockerfile.backend:1` | Single stage, all deps in final image | Use multi-stage: build in python:3.11, copy to python:3.11-slim |
| 1.10 | **Runs as root** — no non-root user | HIGH | `Dockerfile.backend` | No `USER` directive | Add: `RUN adduser --disabled-password appuser` + `USER appuser` |
| 1.11 | **No HEALTHCHECK instruction** | HIGH | `Dockerfile.backend` | Missing | Add: `HEALTHCHECK --interval=30s --timeout=5s CMD curl -f http://localhost:8000/health/ || exit 1` |
| 1.12 | **Pinned base image to minor, not patch** | LOW | `Dockerfile.backend:1` | `python:3.11-slim` (no patch) | Pin to `python:3.11.12-slim` for reproducible builds |
| 1.13 | **No .dockerignore** — builds send full context | LOW | `Dockerfile.backend` | No `.dockerignore` file found | Create `.dockerignore` excluding `.git`, `.venv`, `node_modules`, `*.pyc` |
| 1.14 | **Daphne as single worker** — no worker concurrency | MEDIUM | `Dockerfile.backend:12` | Single daphne process | Use `daphne` with `--workers 4` or switch to uvicorn with multiple workers |

### Dockerfile.frontend

| # | Issue | Severity | File | Current State | Recommended Fix |
|---|-------|----------|------|---------------|-----------------|
| 1.15 | **Multi-stage build present** — good | OK | `Dockerfile.frontend:1-15` | Properly uses build stage + nginx stage | No change needed |
| 1.16 | **Runs as root** — nginx master process as root | MEDIUM | `Dockerfile.frontend:11` | `nginx:alpine` runs as root by default | Add `USER nginx` after COPY directives (note: port 80 needs root or `setcap`) |
| 1.17 | **No HEALTHCHECK instruction** | MEDIUM | `Dockerfile.frontend` | Missing | Add: `HEALTHCHECK --interval=30s CMD wget -q --spider http://localhost:80/ || exit 1` |
| 1.18 | **Pinned base image to minor** | LOW | `Dockerfile.frontend:1,11` | `node:20-alpine`, `nginx:alpine` | Pin to specific patch versions |

---

## 2. Nginx

### nginx.conf

| # | Issue | Severity | File | Current State | Recommended Fix |
|---|-------|----------|------|---------------|-----------------|
| 2.1 | **No HTTPS listener** — only port 80 | CRITICAL | `nginx.conf:2` | `listen 80;` only | Add `listen 443 ssl http2;` with certificate paths |
| 2.2 | **No SSL/TLS configuration** | CRITICAL | `nginx.conf` | No `ssl_certificate`, `ssl_protocols`, `ssl_ciphers` | Add full SSL config with TLS 1.2+, strong ciphers, OCSP stapling |
| 2.3 | **No security headers** | HIGH | `nginx.conf` | No `add_header` directives | Add: `X-Frame-Options DENY`, `X-Content-Type-Options nosniff`, `X-XSS-Protection "1; mode=block"`, `Referrer-Policy strict-origin-when-cross-origin`, `Content-Security-Policy`, `Strict-Transport-Security` |
| 2.4 | **No rate limiting** | HIGH | `nginx.conf` | No `limit_req_zone` or `limit_conn_zone` | Add rate limiting zones: `limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;` |
| 2.5 | **No WebSocket proxy timeout tuning** | MEDIUM | `nginx.conf:17-23` | Missing `proxy_read_timeout`, `proxy_send_timeout` | Add `proxy_read_timeout 3600s;` and `proxy_send_timeout 3600s;` for WebSocket longevity |
| 2.6 | **No WebSocket connection limiting** | LOW | `nginx.conf:17-23` | No `limit_conn` on ws/ location | Add connection limiting per IP for WebSocket endpoints |
| 2.7 | **No access logging for API** | LOW | `nginx.conf` | No `access_log` directive | Add `access_log /var/log/nginx/api_access.log;` |
| 2.8 | **No error page customization** | LOW | `nginx.conf` | Default nginx error pages | Add custom error pages or proxy to Django error views |
| 2.9 | **No gzip compression** | MEDIUM | `nginx.conf` | No `gzip` directives | Add gzip for text/html/json/js/css |
| 2.10 | **No static asset caching headers** | MEDIUM | `nginx.conf:7-9` | No `expires` or `Cache-Control` on static assets | Add `location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff2?)$` with `expires 1y;` and `Cache-Control: public, immutable;` |
| 2.11 | **No request size limit** | MEDIUM | `nginx.conf` | No `client_max_body_size` | Add `client_max_body_size 50M;` (for audio uploads) |
| 2.12 | **Missing `proxy_set_header X-Forwarded-For/Proto`** | MEDIUM | `nginx.conf:14-15` | Only `X-Real-IP` set | Add `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;` and `proxy_set_header X-Forwarded-Proto $scheme;` |

---

## 3. CI/CD

### .github/workflows/gaia-guards-ci.yml

| # | Issue | Severity | File | Current State | Recommended Fix |
|---|-------|----------|------|---------------|-----------------|
| 3.1 | **No deployment pipeline** — CI only, no CD | CRITICAL | `.github/workflows/gaia-guards-ci.yml` | Only runs tests, no deploy stage | Add deploy job: build Docker images, push to registry, deploy to target host |
| 3.2 | **No Docker build test** — CI doesn't verify Dockerfiles build | HIGH | workflow file | No `docker build` step in CI | Add a job that runs `docker compose build` to verify images build successfully |
| 3.3 | **No security scanning** — no Trivy/Snyk/Dependency-Check | HIGH | workflow file | No vulnerability scanning | Add Trivy image scan and `pip audit` / `npm audit` steps |
| 3.4 | **No linting/formatting checks** | MEDIUM | workflow file | No flake8, black, ruff, or eslint in CI | Add linting job for both Python and TypeScript |
| 3.5 | **No staging deployment** | HIGH | workflow file | No staging environment | Add staging deploy on PR merge to `main`, production deploy on tag |
| 3.6 | **No smoke tests post-deploy** | MEDIUM | workflow file | No health check after deploy | Add post-deploy smoke test: hit `/health/` endpoint |
| 3.7 | **No database migration step** | MEDIUM | workflow file | No `manage.py migrate` in deploy pipeline | Add migration step before rolling deploy |
| 3.8 | **Only one workflow file** — no separation of concerns | LOW | `.github/workflows/` | Single 354-line file | Consider splitting into `ci.yml`, `security.yml`, `deploy.yml` |

---

## 4. Monitoring

| # | Issue | Severity | File | Current State | Recommended Fix |
|---|-------|----------|------|---------------|-----------------|
| 4.1 | **No APM / error tracking** | CRITICAL | N/A | No Sentry, Datadog, New Relic, or any APM | Add Sentry SDK to Django (`sentry-sdk[django]`) and React (`@sentry/react`) |
| 4.2 | **No health check endpoint** | CRITICAL | `settings.py`, `urls.py` | No `/health/` endpoint exists | Add a simple health view that checks DB + Redis connectivity |
| 4.3 | **No metrics collection** | HIGH | N/A | No Prometheus, StatsD, or CloudWatch | Add `django-prometheus` or CloudWatch agent |
| 4.4 | **No alerting** | HIGH | N/A | No PagerDuty, OpsGenie, or any alerting | Set up Sentry alerts + CloudWatch alarms for 5xx rates, latency |
| 4.5 | **No log aggregation** | HIGH | `settings.py:200-242` | Logs go to local file only (`logs/django.log`) | Add CloudWatch Logs, Datadog agent, or ship to ELK/Loki |
| 4.6 | **No uptime monitoring** | MEDIUM | N/A | No external uptime check | Add UptimeRobot, Pingdom, or CloudWatch Synthetics |
| 4.7 | **No WebSocket connection monitoring** | MEDIUM | N/A | No tracking of active WS connections | Add metrics for WS connect/disconnect events |

---

## 5. Backup

| # | Issue | Severity | File | Current State | Recommended Fix |
|---|-------|----------|------|---------------|-----------------|
| 5.1 | **SQLite in container** — no persistence | CRITICAL | `settings.py:85-90` | `db.sqlite3` in ephemeral container filesystem | Migrate to PostgreSQL with persistent volume; add `pg_dump` cron job |
| 5.2 | **No backup strategy** | CRITICAL | N/A | No backup scripts, no S3 snapshots | Implement daily automated DB backups to S3 with 30-day retention |
| 5.3 | **No Redis persistence** | HIGH | `docker-compose.yml:2-6` | Redis has no `appendonly` or volume | Enable `appendonly yes` and mount a volume for Redis data |
| 5.4 | **No media file backup** | MEDIUM | `settings.py:131-132` | Audio uploads stored on local filesystem | Use S3-compatible storage (django-storages) for media files |

---

## 6. Scaling

| # | Issue | Severity | File | Current State | Recommended Fix |
|---|-------|----------|------|---------------|-----------------|
| 6.1 | **SQLite cannot scale horizontally** | CRITICAL | `settings.py:85-90` | SQLite doesn't support concurrent writes | Migrate to PostgreSQL (even for single-node, it's required for any scaling) |
| 6.2 | **No shared state for WebSocket scaling** | HIGH | `settings.py:185-192` | Channel layer uses `127.0.0.1:6379` (localhost) | Use Redis service hostname (`redis:6379`) for inter-container channel layer |
| 6.3 | **No sticky sessions consideration** | MEDIUM | `nginx.conf` | No `ip_hash` or cookie-based sticky sessions | If scaling to multiple backend instances, add `ip_hash` upstream or use shared Redis |
| 6.4 | **Single Redis instance** | MEDIUM | `docker-compose.yml:2-6` | One Redis, no replication | For production: Redis Sentinel or Redis Cluster |
| 6.5 | **No horizontal pod/instance scaling config** | MEDIUM | `docker-compose.yml` | No `deploy.replicas` | Add `deploy.replicas: 2` for backend (once stateless) |
| 6.6 | **No CDN for static assets** | LOW | `Dockerfile.frontend` | All assets served from nginx | Add CloudFront/Cloudflare CDN in front of nginx |

---

## 7. SSL/TLS

| # | Issue | Severity | File | Current State | Recommended Fix |
|---|-------|----------|------|---------------|-----------------|
| 7.1 | **No HTTPS anywhere** | CRITICAL | `nginx.conf` | Port 80 only, no SSL config | Add Let's Encrypt (certbot) or Cloudflare SSL termination |
| 7.2 | **No HSTS header** | HIGH | `settings.py:146` | `SECURE_HSTS_SECONDS = 0` | Set `SECURE_HSTS_SECONDS = 31536000` (1 year) in production |
| 7.3 | **No HTTPS enforcement** | HIGH | `settings.py:147` | `SECURE_SSL_REDIRECT = False` | Set `SECURE_SSL_REDIRECT = True` in production |
| 7.4 | **No secure cookie flags** | HIGH | `settings.py:148-149` | `SESSION_COOKIE_SECURE = False`, `CSRF_COOKIE_SECURE = False` | Set both to `True` in production |
| 7.5 | **No certificate management automation** | MEDIUM | N/A | No certbot, no auto-renewal | Use certbot with cron or Cloudflare's free SSL |

---

## 8. DNS/CDN

| # | Issue | Severity | File | Current State | Recommended Fix |
|---|-------|----------|------|---------------|-----------------|
| 8.1 | **No DNS configuration** | HIGH | N/A | No domain configured | Register domain, configure A/AAAA records pointing to server IP |
| 8.2 | **No CDN** | MEDIUM | N/A | No CloudFront, Cloudflare, or Fastly | Add CDN for static assets and API caching |
| 8.3 | **No DNS failover** | LOW | N/A | Single point of DNS failure | Use Route53 health checks or Cloudflare DNS |

---

## 9. Environment Parity

| # | Issue | Severity | File | Current State | Recommended Fix |
|---|-------|----------|------|---------------|-----------------|
| 9.1 | **No staging environment** | HIGH | N/A | Only local dev + CI | Create staging environment (separate docker-compose or K8s namespace) |
| 9.2 | **No production settings file** | HIGH | `settings.py` | Single settings module with `python-decouple` | Create `settings_production.py` with production-specific overrides |
| 9.3 | **.env committed to git** | CRITICAL | `backend/.env` | Hardcoded `SECRET_KEY=django-insecure-dev-key...` committed | **Rotate the secret key immediately** — it's in git history. Use `git filter-branch` or BFG to remove. |
| 9.4 | **Docker-compose has no environment-specific overrides** | MEDIUM | `docker-compose.yml` | No `docker-compose.prod.yml` | Create `docker-compose.prod.yml` with production overrides (resource limits, replicas, volumes) |
| 9.5 | **Channel layer hardcoded to localhost** | HIGH | `settings.py:189` | `"hosts": [('127.0.0.1', 6379)]` | Use `REDIS_URL` env var; docker-compose sets `REDIS_URL=redis://redis:6379/0` but settings.py ignores it |

---

## 10. Disaster Recovery

| # | Issue | Severity | File | Current State | Recommended Fix |
|---|-------|----------|------|---------------|-----------------|
| 10.1 | **No rollback procedure** | HIGH | N/A | No documented rollback process | Document: `docker compose pull <previous-image-tag> && docker compose up -d` |
| 10.2 | **No image tagging strategy** | MEDIUM | N/A | No versioned Docker images | Tag images with git SHA: `sound-royale/backend:${GITHUB_SHA}` |
| 10.3 | **No data recovery plan** | CRITICAL | N/A | No backups, no point-in-time recovery | Implement daily DB backups + Redis AOF persistence |
| 10.4 | **No runbook** | MEDIUM | N/A | No operational documentation | Create runbook: common failures, escalation paths, contact info |
| 10.5 | **No graceful shutdown handling** | LOW | `Dockerfile.backend:12` | Daphne receives SIGTERM but no `stopsignal` or `tini` | Use `tini` as init or `daphne` with proper signal handling |

---

## Priority Summary

### CRITICAL (Fix immediately before any production deployment)

| # | Issue |
|---|-------|
| 1.3 | No named volumes — SQLite DB lost on container restart |
| 3.1 | No deployment pipeline |
| 4.1 | No APM / error tracking |
| 4.2 | No health check endpoint |
| 5.1 | SQLite in container — no persistence |
| 5.2 | No backup strategy |
| 6.1 | SQLite cannot scale horizontally |
| 7.1 | No HTTPS anywhere |
| 9.3 | .env with secret key committed to git (rotate immediately) |
| 10.3 | No data recovery plan |

### HIGH (Fix before production launch)

| # | Issue |
|---|-------|
| 1.1 | No resource limits |
| 1.2 | No health checks in docker-compose |
| 1.10 | Backend runs as root |
| 2.3 | No security headers |
| 2.4 | No rate limiting |
| 3.2 | No Docker build test in CI |
| 3.3 | No security scanning |
| 3.5 | No staging deployment |
| 4.3 | No metrics collection |
| 4.4 | No alerting |
| 4.5 | No log aggregation |
| 5.3 | No Redis persistence |
| 6.2 | Channel layer hardcoded to localhost |
| 7.2-7.4 | No HSTS, no SSL redirect, no secure cookies |
| 8.1 | No DNS configuration |
| 9.1 | No staging environment |
| 9.2 | No production settings file |
| 9.5 | Channel layer ignores docker-compose REDIS_URL |
| 10.1 | No rollback procedure |

---

## Recommended Immediate Action Plan

1. **Rotate SECRET_KEY** — the current one is in git history. Generate a new one and add to `.env` (never commit).
2. **Add health check endpoint** — simple Django view at `/health/` that returns 200 with DB + Redis check.
3. **Add `docker-compose.prod.yml`** — production overrides with resource limits, health checks, named volumes, init processes.
4. **Migrate to PostgreSQL** — replace SQLite with PostgreSQL service in docker-compose.
5. **Add Sentry** — `sentry-sdk[django]` and `@sentry/react` for error tracking.
6. **Add HTTPS to nginx** — Let's Encrypt with certbot, security headers, rate limiting.
7. **Fix channel layer** — use `REDIS_URL` env var instead of hardcoded `127.0.0.1`.
8. **Add deploy stage to CI** — build images, push to registry, deploy to production.
9. **Create staging environment** — separate from production, auto-deploy on merge to main.
10. **Add backup strategy** — daily PostgreSQL dumps to S3, Redis AOF persistence.
