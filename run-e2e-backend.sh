#!/usr/bin/env bash
# Start the Sound Royale backend (Django/Channels via daphne) for local E2E.
# Uses sqlite + local redis (already running). Reads env from backend/.env.e2e.
set -a
# Load e2e env (python-decouple reads these)
export SECRET_KEY=e2e-local-dev-secret-key-not-for-production-0123456789abcdef
export DEBUG=True
export ALLOWED_HOSTS=localhost,127.0.0.1,testserver
export DB_ENGINE=django.db.backends.sqlite3
export DB_NAME=db.sqlite3
export REDIS_URL=redis://127.0.0.1:6379/0
export DISABLE_THROTTLES=true
export SR_ROUND_SECONDS=15
set +a

cd "$(dirname "$0")/backend"
exec ../backend/venv/bin/daphne -b 127.0.0.1 -p 8000 sound_royale_api.asgi:application
