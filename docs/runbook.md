# Incident Response Runbook

## Alerting

| Channel | When | Who |
|---------|------|-----|
| Email | Any monitor down | On-call |
| Discord | 5+ min outage | Team |
| PagerDuty | 30+ min outage (paid) | Escalation |

## Triage Checklist

1. **Check monitors**: Better Stack dashboard
2. **Check status pages**:
   - Fly.io: https://status.fly.io
   - Cloudflare: https://www.cloudflarestatus.com
   - Supabase: https://status.supabase.com
3. **Check logs**: `flyctl logs --app sound-royale-ny`
4. **Check health**: `curl https://sound-royale-ny.fly.dev/health/`

## Scenarios

### Backend Down (Fly.io)

**Symptoms**: 502/503 errors, health check fails

**Diagnosis**:
```bash
flyctl status --app sound-royale-ny
flyctl logs --app sound-royale-ny
```

**Common causes**:
- OOM kill (memory limit)
- Crash loop (check logs)
- Deploy failed (rollback)

**Fix**:
```bash
# Rollback to previous deploy
flyctl deploy --image <previous-image>

# Or restart machines
flyctl machines restart --app sound-royale-ny
```

### Database Down (Supabase)

**Symptoms**: 500 errors on all API calls, health check shows database: error

**Diagnosis**:
- Check Supabase status: https://status.supabase.com
- Check connection: `psql "postgresql://..." -c "SELECT 1"`

**Common causes**:
- Supabase outage (wait)
- Connection pool exhausted (PgBouncer limit)
- Wrong credentials (check secrets)

**Fix**:
- If Supabase outage: wait
- If pool exhausted: reduce CONN_MAX_AGE, add PgBouncer
- If wrong credentials: `flyctl secrets set DB_PASSWORD=...`

### WebSocket Issues (Redis)

**Symptoms**: Real-time updates not working, "Reconnecting..." stuck

**Diagnosis**:
```bash
flyctl logs --app sound-royale-ny | grep -i "websocket\|channel\|redis"
```

**Common causes**:
- Redis connection failed
- Channel layer misconfigured
- Daphne WS handshake failed

**Fix**:
```bash
# Restart machines
flyctl machines restart --app sound-royale-ny

# Check Redis URL
flyctl secrets list --app sound-royale-ny | grep REDIS
```

### Frontend Down (Cloudflare)

**Symptoms**: 5xx from Cloudflare, site not loading

**Diagnosis**:
- Check Cloudflare status: https://www.cloudflarestatus.com
- Check Cloudflare dashboard for the site

**Common causes**:
- Cloudflare outage (wait)
- Deploy failed (rollback)
- DNS misconfiguration

**Fix**:
- If Cloudflare outage: wait
- If deploy failed: rollback via Cloudflare Pages dashboard
- If DNS: check Cloudflare DNS settings

### Security Incident

**Symptoms**: Unauthorized access, data breach, suspicious activity

**Immediate actions**:
1. Rotate all secrets:
   ```bash
   flyctl secrets set SECRET_KEY=$(python -c "import secrets; print(secrets.token_urlsafe(50))")
   flyctl secrets set DB_PASSWORD=<new-password>
   ```
2. Revoke all JWT tokens (rotate SECRET_KEY)
3. Check Sentry for suspicious errors
4. Review Fly.io access logs
5. Contact affected users if data exposed

**Post-incident**:
1. Write post-mortem
2. Fix root cause
3. Add monitoring to prevent recurrence

## Escalation

1. **0-15 min**: On-call investigates
2. **15-30 min**: Team notified via Discord
3. **30+ min**: Escalate to management
4. **1+ hour**: Consider rollback to last known good

## Post-Mortem Template

```markdown
# Incident: [Title]

**Date**: YYYY-MM-DD
**Duration**: X hours Y minutes
**Impact**: [What was affected]

## Timeline

- HH:MM - Issue detected
- HH:MM - Investigation started
- HH:MM - Root cause identified
- HH:MM - Fix applied
- HH:MM - Service restored

## Root Cause

[What went wrong]

## What Went Well

[What worked]

## What Went Wrong

[What didn't work]

## Action Items

- [ ] Fix 1 (owner: @user, due: YYYY-MM-DD)
- [ ] Fix 2 (owner: @user, due: YYYY-MM-DD)
```
