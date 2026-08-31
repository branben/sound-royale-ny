# Sentry Error Tracking

Sound Royale uses [Sentry](https://sentry.io) for error tracking in production.

## Setup

1. Create a Sentry project at https://sentry.io
2. Get your DSN from Project Settings → Client Keys
3. Add to Fly.io secrets:

```bash
flyctl secrets set SENTRY_DSN="https://<key>@<host>.ingest.sentry.io/<project>" --app sound-royale-ny
```

4. For local development, add to `backend/.env`:

```bash
SENTRY_DSN=https://<key>@<host>.ingest.sentry.io/<project>
SENTRY_ENVIRONMENT=development
```

## What's Tracked

- Django exceptions (automatic via `DjangoIntegration`)
- Redis errors (automatic via `RedisIntegration`)
- Frontend React errors (via `@sentry/react`)
- Performance traces (10% sampling rate)

## Frontend Integration

The React frontend uses `@sentry/react` with:

- Error boundary (catches render errors)
- Redux/vuex state tracking (if applicable)
- Performance tracing
- Session replay (optional, free tier)

## Alerts

Configure in Sentry:

- Email alerts for new issues
- Slack/Discord webhook for critical errors
- Weekly digest for error trends
