# Database Backups

Sound Royale uses Supabase (PostgreSQL) which has no auto-backup on the free tier. This document describes the backup strategy.

## Strategy

- **Frequency**: Daily at 2 AM UTC
- **Retention**: 30 days
- **Storage**: Cloudflare R2 (free tier: 10GB)
- **Encryption**: AES-256-GCM via `gpg`

## Setup

### 1. Create R2 Bucket

```bash
# Install wrangler
npm install -g wrangler

# Login to Cloudflare
wrangler login

# Create R2 bucket
wrangler r2 bucket create sound-royale-backups
```

### 2. Get R2 Credentials

Go to Cloudflare Dashboard → R2 → Manage R2 API Tokens

Create a token with:
- Object Read & Write permissions
- Bucket: `sound-royale-backups`

### 3. Add GitHub Secrets

Go to GitHub Repo → Settings → Secrets → Actions

Add:
- `R2_ACCOUNT_ID`: Your Cloudflare account ID
- `R2_ACCESS_KEY_ID`: R2 access key
- `R2_SECRET_ACCESS_KEY`: R2 secret key
- `R2_BUCKET`: `sound-royale-backups`
- `BACKUP_ENCRYPTION_KEY`: Random 32-char string (generate: `openssl rand -base64 32`)

## Backup Workflow

See `.github/workflows/backup.yml`

## Restore Procedure

```bash
# Download latest backup
wrangler r2 object get sound-royale-backups/backups/latest.sql.gpg --file backup.sql.gpg

# Decrypt
gpg --decrypt --passphrase "$BACKUP_ENCRYPTION_KEY" --batch backup.sql.gpg > backup.sql

# Restore to Supabase
psql "postgresql://postgres:<password>@db.jpnfsgzmmifupnvhtppm.supabase.co:5432/postgres" < backup.sql
```

## Testing Restores

Test restores monthly to a local database:

```bash
# Start local Postgres
docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=postgres postgres:15

# Restore
psql "postgresql://postgres:postgres@localhost:5432/postgres" < backup.sql

# Verify
psql "postgresql://postgres:postgres@localhost:5432/postgres" -c "SELECT COUNT(*) FROM game_engine_room;"
```
