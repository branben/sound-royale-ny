# SOU-83: Infrastructure & DevOps Production Audit

**Date:** 2026-06-16
**Auditor:** CTO (OWL)
**Scope:** Docker, Nginx, CI/CD, Monitoring, Backup, Scaling, SSL/TLS, DNS/CDN, Environment Parity, Disaster Recovery

---

## Executive Summary

Sound Royale's infrastructure is at **early-development stage** — functional for local dev and prototyping, but **not production-ready**. The architecture (Daphne ASGI + Django REST + Channels + Redis + Nginx + React SPA) is sound, but critical gaps exist in every audited category. No production compose override, no TLS, no monitoring, no backup strategy, no non-root containers, and no health checks. The CI pipeline is the strongest area — it has good test coverage and security scanning — but lacks a deployment stage.

**Overall Readiness: ~2/10 for production**

---

## 1. Docker

### 1.1 docker-compose.yml

| Field | Value |
|-------|-------|
| **File** | `docker-compose.yml` |
| **Severity** | HIGH |
| **Issue** | No production compose override |
| **Current State** | Single compose file for all environments. No `docker-compose.prod.yml`. |
| **Recommended Fix** | Create `docker-compose.prod.yml` with production-specific settings: resource limits, restart policies, logging drivers, volume mounts for Redis persistence, and production env overrides. |

| Field | Value |
|-------|-------|
| **File** | `docker-compose.yml` |
| **Severity** | HIGH |
| **Issue** | Redis data not persisted |
| **Current State** | No volume mount for Redis. All game state lost on container restart. |
| **Recommended Fix** | Add `volumes: - redis_data:/data` to the redis service and declare the named volume. |

| Field | Value |
|-------|-------|
| **File** | `docker-compose.yml` |
| **Severity** | MEDIUM |
| **Issue** | No health checks on any service |
| **Current State** | `depends_on` only checks container start, not service readiness. Backend could start before Redis is actually accepting connections. |
| **Recommended Fix** | Add `healthcheck` directives: `redis-cli ping` for redis, HTTP probe for backend, HTTP probe for frontend. Update `depends_on` to use `condition: service_healthy`. |

| Field | Value |
|-------|-------|
| **File** | `docker-compose.yml` |
| **Severity** | MEDIUM |
| **Issue** | No resource limits |
| **Current State** | Services can consume all host memory/CPU. A memory leak in Daphne could OOM the host. |
| **Recommended Fix** | Add `deploy.resources.limits` for memory and CPU on each service. |

| Field | Value |
|-------|-------|
| **File** | `docker-compose.yml` |
| **Severity** | MEDIUM |
| **Issue** | CORS hardcoded to `http://localhost:80` |
| **Current State** | `CORS_ALLOWED_ORIGINS=http://localhost:80` in compose. Won't work for real domains. |
| **Recommended Fix** | Use environment variable with production domain. Set via `.env` or deployment secrets. |

### 1.2 Dockerfile.backend

| Field | Value |
|-------|-------|
| **File** | `Dockerfile.backend` |
| **Severity** | HIGH |
| **Issue** | Runs as root |
| **Current State** | No `USER` directive. Daphne runs as root inside the container. |
| **Recommended Fix** | Add: `RUN adduser --disabled-password --gecos '' appuser` and `USER appuser`. |

| Field | Value |
|-------|-------|
| **File** | `Dockerfile.backend` |
| **Severity** | MEDIUM |
| **Issue** | No multi-stage build |
| **Current State** | All dependencies (including potential dev deps) in single image. Larger attack surface and image size. |
| **Recommended Fix** | Use multi-stage: install deps in builder, copy to slim runtime image. |

| Field | Value |
|-------|-------|
| **File** | `Dockerfile.backend` |
| **Severity** | LOW |
| **Issue** | Base image not pinned to patch version |
| **Current State** | `python:3.11-slim` — could drift over time. |
| **Recommended Fix** | Pin to `python:3.11.9-slim` (or current patch) for reproducible builds. |

| Field | Value |
|-------|-------|
| **File** | `Dockerfile.backend` |
| **Severity** | MEDIUM |
| **Issue** | No HEALTHCHECK |
| **Current State** | Docker has no way to know if the backend is healthy. |
| **Recommended Fix** | Add `HEALTHCHECK --interval=30s --timeout=5s CMD curl -f http://localhost:8000/health/ || exit 1` (requires a health endpoint). |

### 1.3 Dockerfile.frontend

| Field | Value |
|-------|-------|
| **File** | `Dockerfile.frontend` |
| **Severity** | MEDIUM |
| **Issue** | Nginx stage runs as root |
| **Current State** | No `USER` directive in the nginx stage. |
| **Recommended Fix** | Add `USER nginx` after the COPY directives. |

| Field | Value |
|-------|-------|
| **File** | `Dockerfile.frontend` |
| **Severity** | LOW |
| **Issue** | Build context includes entire project |
| **Current State** | `COPY . .` in build stage copies backend code too. No `.dockerignore` file exists. |
| **Recommended Fix** | Create `.dockerignore` excluding `backend/`, `.git/`, `node_modules/`, `docs/`, etc. |

### 1.4 .dockerignore

| Field | Value |
|-------|-------|
| **File** | `.dockerignore` |
| **Severity** | MEDIUM |
| **Issue** | Missing entirely |
| **Current State** | No `.dockerignore` file exists. Every `COPY . .` sends the entire repo context to Docker. |
| **Recommended Fix** | Create `.dockerignore` with: `.git/`, `backend/`, `node_modules/`, `dist/`, `docs/`, `*.md`, `.env`, `__pycache__/`, `*.pyc` |

---

## 2. Nginx

### 2.1 nginx.conf

| Field | Value |
|-------|-------|
| **File** | `nginx.conf` |
| **Severity** | HIGH |
| **Issue** | No security headers |
| **Current State** | Missing: `X-Frame-Options`, `X-Content-Type-Options`, `Content-Security-Policy`, `Strict-Transport-Security`, `Referrer-Policy`, `Permissions-Policy`. |
| **Recommended Fix** | Add all standard security headers. At minimum: `X-Frame-Options DENY`, `X-Content-Type-Options nosniff`, `Referrer-Policy strict-origin-when-cross-origin`. |

| Field | Value |
|-------|-------|
| **File** | `nginx.conf` |
| **Severity** | HIGH |
| **Issue** | No rate limiting |
| **Current State** | No `limit_req` or `limit_conn` directives. API is unprotected against abuse. |
| **Recommended Fix** | Add `limit_req_zone` and `limit_req` for `/api/` and `/ws/` locations. |

| Field | Value |
|-------|-------|
| **File** | `nginx.conf` |
| **Severity** | MEDIUM |
| **Issue** | No SSL/TLS configuration |
| **Current State** | Listens on port 80 only. No `listen 443 ssl`, no certificate paths, no TLS protocol directives. |
| **Recommended Fix** | Add a server block for port 443 with SSL. Use Let's Encrypt (certbot) or cloud-provided certificates. Redirect HTTP→HTTPS. |

| Field | Value |
|-------|-------|
| **File** | `nginx.conf` |
| **Severity** | MEDIUM |
| **Issue** | Missing `X-Forwarded-For` on proxy |
| **Current State** | Backend sees nginx IP as client IP, not real user IP. |
| **Recommended Fix** | Add `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;` to `/api/` and `/ws/` blocks. |

| Field | Value |
|-------|-------|
| **File** | `nginx.conf` |
| **Severity** | LOW |
| **Issue** | WebSocket proxy missing timeout tuning |
| **Current State** | No `proxy_read_timeout` or `proxy_send_timeout` for `/ws/` — default 60s may drop long-lived connections. |
| **Recommended Fix** | Add `proxy_read_timeout 3600s;` and `proxy_send_timeout 3600s;` to `/ws/` block. |

| Field | Value |
|-------|-------|
| **File** | `nginx.conf` |
| **Severity** | LOW |
| **Issue** | No gzip compression |
| **Current State** | Static assets served without compression. |
| **Recommended Fix** | Add `gzip on;` with appropriate `gzip_types` and `gzip_min_length`. |

---

## 3. CI/CD

### 3.1 .github/workflows/gaia-guards-ci.yml

| Field | Value |
|-------|-------|
| **File** | `.github/workflows/gaia-guards-ci.yml` |
| **Severity** | HIGH |
| **Issue** | No deployment stage |
| **Current State** | CI pipeline runs tests, security scans, and E2E — but has zero deployment automation. Every deploy is manual. |
| **Recommended Fix** | Add a `deploy` job that triggers on push to `main`. Options: Docker Hub/GHCR image push + SSH deploy, or integrate with a platform (Railway, Fly.io, AWS ECS). |

| Field | Value |
|-------|-------|
| **File** | `.github/workflows/gaia-guards-ci.yml` |
| **Severity** | MEDIUM |
| **Issue** | Only one workflow file |
| **Current State** | Single workflow covers CI. No separate workflows for deployment, staging, or rollback. |
| **Recommended Fix** | Create `deploy.yml` for production deployments, potentially with manual approval gate (`environment: production` with required reviewers). |

| Field | Value |
|-------|-------|
| **File** | `.github/workflows/gaia-guards-ci.yml` |
| **Severity** | LOW |
| **Issue** | No Docker image build/push in CI |
| **Current State** | CI runs tests but never builds or publishes Docker images. |
| **Recommended Fix** | Add a job to build and push images to GHCR on merge to `main`. Tag with git SHA. |

---

## 4. Monitoring

| Field | Value |
|-------|-------|
| **File** | N/A (project-wide) |
| **Severity** | HIGH |
| **Issue** | No monitoring, APM, or error tracking |
| **Current State** | Zero references to Sentry, Datadog, New Relic, Prometheus, Grafana, or any monitoring tool. No health endpoint exists. |
| **Recommended Fix** | **Minimum:** Add Sentry SDK to Django (`sentry-sdk` package) with DSN from env var. Add a `/health/` endpoint returning 200 with Redis connectivity check. **Ideal:** Add Prometheus metrics export, structured JSON logging, and uptime monitoring (e.g., UptimeRobot). |

---

## 5. Backup

| Field | Value |
|-------|-------|
| **File** | N/A (project-wide) |
| **Severity** | HIGH |
| **Issue** | No backup strategy |
| **Current State** | SQLite database with no backup mechanism. No `dumpdata` cron, no volume snapshots, no off-site backup. |
| **Recommended Fix** | **Immediate:** Add a daily `python manage.py dumpdata` cron job with output to a persistent volume. **Production:** Migrate to PostgreSQL and use `pg_dump` with scheduled backups to S3/GCS. Add point-in-time recovery. |

---

## 6. Scaling

| Field | Value |
|-------|-------|
| **File** | `docker-compose.yml` / `nginx.conf` |
| **Severity** | HIGH |
| **Issue** | No horizontal scaling support |
| **Current State** | Single instance of each service. Channels uses Redis layer (good for multi-instance), but: no sticky session config in nginx, no shared state for WebSocket Daphne processes beyond Redis channel layer, SQLite can't be shared across instances. |
| **Recommended Fix** | **Critical:** Migrate from SQLite to PostgreSQL for multi-instance support. Add `ip_hash` or `sticky` directive in nginx upstream for WebSocket affinity. Add an upstream block for backend with multiple Daphne instances. Ensure `CHANNEL_LAYERS` uses Redis (already configured). |

---

## 7. SSL/TLS

| Field | Value |
|-------|-------|
| **File** | `nginx.conf` |
| **Severity** | CRITICAL |
| **Issue** | No TLS/SSL anywhere |
| **Current State** | Port 80 only. No certificates, no HTTPS redirect, no HSTS header. `SECURE_SSL_REDIRECT=False` in Django settings. |
| **Recommended Fix** | Use Let's Encrypt with certbot (free, automated). Add `listen 443 ssl` server block in nginx. Enable `SECURE_SSL_REDIRECT=True`, `SECURE_HSTS_SECONDS=31536000`, `SESSION_COOKIE_SECURE=True`, `CSRF_COOKIE_SECURE=True` in Django settings for production. |

---

## 8. DNS/CDN

| Field | Value |
|-------|-------|
| **File** | N/A (project-wide) |
| **Severity** | MEDIUM |
| **Issue** | No CDN or DNS configuration |
| **Current State** | No evidence of custom domain, DNS records, or CDN setup. Static assets served directly from nginx. |
| **Recommended Fix** | **For MVP:** Use Cloudflare as DNS proxy (free plan) — gives CDN, DDoS protection, and automatic TLS. **For scale:** Add CloudFront or Cloudflare for static asset caching with cache-busting filenames. |

---

## 9. Environment Parity

| Field | Value |
|-------|-------|
| **File** | `docker-compose.yml` / `backend/.env` |
| **Severity** | MEDIUM |
| **Issue** | Dev/production parity gaps |
| **Current State** | Single compose file. Dev uses `.env` with `DEBUG=True`, compose overrides to `DEBUG=False`. No staging environment. No `.env.example` for onboarding. |
| **Recommended Fix** | Create `.env.example` with all required variables (non-secret defaults). Create `docker-compose.prod.yml` with production overrides. Document required env vars. Consider a staging environment that mirrors production. |

---

## 10. Disaster Recovery

| Field | Value |
|-------|-------|
| **File** | N/A (project-wide) |
| **Severity** | HIGH |
| **Issue** | No disaster recovery plan |
| **Current State** | No rollback procedures documented. No database backups. No runbook. Docker images not versioned/tagged. |
| **Recommended Fix** | **Minimum:** (1) Tag Docker images with git SHA for rollback. (2) Document rollback: `docker-compose down && docker-compose pull && docker-compose up -d` with previous image tag. (3) Daily database backups. (4) Add a `scripts/rollback.sh` script. **Ideal:** Blue-green or rolling deployment with automated rollback on health check failure. |

---

## Priority Action Plan

### P0 — Block Ship to Production
1. **TLS/SSL** — Add HTTPS via Let's Encrypt + certbot (Issue: nginx.conf has no 443 listener)
2. **Non-root containers** — Add `USER` directives to both Dockerfiles
3. **Security headers** — Add X-Frame-Options, CSP, HSTS to nginx.conf
4. **Monitoring** — Add Sentry to Django + `/health/` endpoint

### P1 — Should Fix Before Production
5. **Redis persistence** — Add volume mount
6. **Health checks** — Add to all services in compose
7. **Rate limiting** — Add to nginx `/api/` and `/ws/`
8. **Backup strategy** — Daily database dumps
9. **Deployment pipeline** — Add deploy job to CI/CD
10. **PostgreSQL migration** — Replace SQLite for multi-instance support

### P2 — Fix Soon After Production
11. **Resource limits** — Add to compose
12. **CDN** — Cloudflare for DNS + CDN
13. **Sticky sessions** — For WebSocket scaling
14. **Log aggregation** — Structured JSON logging + aggregation
15. **Disaster recovery runbook** — Documented rollback procedures

---

## Files Audited

| File | Path |
|------|------|
| Docker Compose | `docker-compose.yml` |
| Backend Dockerfile | `Dockerfile.backend` |
| Frontend Dockerfile | `Dockerfile.frontend` |
| Nginx Config | `nginx.conf` |
| CI/CD Workflow | `.github/workflows/gaia-guards-ci.yml` |
| Django Settings | `backend/sound_royale_api/settings.py` |
| Python Dependencies | `backend/requirements.txt` |
| Environment File | `backend/.env` (dev values only) |
| Pre-push Gate | `scripts/gaia-gate.sh` |
| E2E Guard | `scripts/e2e-guard.sh` |
