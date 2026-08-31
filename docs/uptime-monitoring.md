# Uptime Monitoring

Sound Royale uses [Better Stack](https://betterstack.com) for uptime monitoring (free tier: 5 monitors).

## Monitors

| Monitor | URL | Interval | Alerts |
|---------|-----|----------|--------|
| Frontend | https://soundroyale.pages.dev | 1 min | Email + Discord |
| Backend API | https://sound-royale-ny.fly.dev | 1 min | Email + Discord |
| Health Check | https://sound-royale-ny.fly.dev/health/ | 30 sec | Email + Discord |

## Setup

1. Create Better Stack account at https://betterstack.com
2. Go to Monitors → Add Monitor
3. Add the 3 URLs above
4. Configure alert channels:
   - Email: your-email@example.com
   - Discord: Webhook URL from your server
5. Set up status page (optional but recommended)

## Alert Rules

- **Down for 1 minute**: Email alert
- **Down for 5 minutes**: Discord alert
- **SSL expiring in 30 days**: Email alert

## Response Procedure

1. Check Better Stack dashboard for which monitor is down
2. Check Fly.io status: https://status.fly.io
3. Check Cloudflare status: https://www.cloudflarestatus.com
4. Check Supabase status: https://status.supabase.com
5. Follow the runbook for specific failure types
