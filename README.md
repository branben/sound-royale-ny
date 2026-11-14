# Sound Royale

[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-20232A?logo=react&logoColor=61DAFB)](https://react.dev/)
[![Python](https://img.shields.io/badge/Python-3776AB?logo=python&logoColor=white)](https://www.python.org/)
[![Django](https://img.shields.io/badge/Django-092E20?logo=django&logoColor=white)](https://www.djangoproject.com/)
[![License](https://img.shields.io/badge/License-MIT-green)](LICENSE)
[![CI](https://github.com/your-org/sound-royale-ny/actions/workflows/gaia-guards-ci.yml/badge.svg)](https://github.com/your-org/sound-royale-ny/actions)

The High-Stakes Game Show for Music Producers.

Sound Royale is a multiplayer music bingo game where producers compete head-to-head by completing bingo boards with audio tiles. Players upload samples, the game broadcasts them in real-time, and opponents race to match and claim tiles.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui |
| Backend | Django 4.2, Django REST Framework, Django Channels |
| Real-time | WebSockets via Django Channels + Redis |
| Database | PostgreSQL (production), SQLite (development) |
| CI/CD | GitHub Actions, Docker Compose, Playwright |

## Installation

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or later) and [pnpm](https://pnpm.io/)
- Python 3.11 — the `python3.11` executable specifically, since the backend scripts invoke it by that name
- [Redis](https://redis.io/) 6 or later — the backend uses it for the cache (API throttling) and for the Django Channels layer (WebSocket broadcasts). With Docker installed, `docker compose up -d redis` starts it on the default port.

### Frontend

```bash
# Clone the repository
git clone https://github.com/branben/sound-royale-ny.git
cd sound-royale-ny

# Install dependencies
pnpm install

# Start the frontend dev server
pnpm run dev:frontend
```

The frontend will be available at `http://localhost:8081`.

### Backend

Start Redis first — from the repository root:

```bash
docker compose up -d redis
```

A locally installed Redis on `127.0.0.1:6379` works just as well.

The commands below are for macOS/Linux shells. See [Windows](#windows) for the PowerShell equivalents.

```bash
cd backend

# Create a virtual environment with the same interpreter the dev scripts use
python3.11 -m venv venv
source venv/bin/activate

# Install dependencies
python3.11 -m pip install --upgrade pip
python3.11 -m pip install -r requirements.txt

# The Django file log handler writes to backend/logs/ — create it on a fresh clone
mkdir -p logs

# Create a local environment file (skipped when you already have one)
if [ ! -f .env ]; then
  cat > .env << EOF
SECRET_KEY=$(python3.11 -c "import secrets; print(secrets.token_urlsafe(50))")
DEBUG=True
CORS_ALLOWED_ORIGINS=http://localhost:8081,http://127.0.0.1:8081
DB_ENGINE=django.db.backends.sqlite3
EOF
fi

# Point Django at the local SQLite database: an exported DATABASE_URL would
# otherwise send these migrations to a shared or production database
unset DATABASE_URL DB_ENGINE DB_NAME DB_HOST DB_PORT DB_USER DB_PASSWORD

# Run database migrations
python3.11 manage.py migrate

# Start the development server
python3.11 manage.py runserver
```

The backend API will be available at `http://localhost:8000`.

Notes on the local `.env`:

- `SECRET_KEY` is generated per machine. These values are for local development only — never copy them into a deployment, and never run a deployment with `DEBUG=True`.
- `DEBUG=True` keeps Django on plain HTTP locally. Without it, `SECURE_SSL_REDIRECT` and the secure-cookie flags turn on and `http://localhost:8000` just redirects to HTTPS.
- `CORS_ALLOWED_ORIGINS` has to list the frontend origin (`http://localhost:8081`) or the browser blocks API requests.
- `DB_ENGINE` keeps development on SQLite. Real environment variables take precedence over `.env`, and `settings.py` turns an exported `DATABASE_URL` into `DB_*` variables — which is why the `unset` above comes before `migrate`. Never run `migrate` against a shared or production database.

### Windows

```powershell
cd backend

# Create a virtual environment (use `py -3.11 -m venv venv` if `python3.11` is not on PATH)
python3.11 -m venv venv
.\venv\Scripts\Activate.ps1

# Install dependencies
python -m pip install --upgrade pip
python -m pip install -r requirements.txt

# The Django file log handler writes to backend/logs/ — create it on a fresh clone
New-Item -ItemType Directory -Force -Path logs | Out-Null

# Create a local environment file (skipped when you already have one)
if (-not (Test-Path .env)) {
  $secret = python -c "import secrets; print(secrets.token_urlsafe(50))"
  Set-Content .env -Encoding ascii @(
    "SECRET_KEY=$secret"
    "DEBUG=True"
    "CORS_ALLOWED_ORIGINS=http://localhost:8081,http://127.0.0.1:8081"
    "DB_ENGINE=django.db.backends.sqlite3"
  )
}

# Point Django at the local SQLite database
Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
Remove-Item Env:DB_ENGINE,Env:DB_NAME,Env:DB_HOST,Env:DB_PORT,Env:DB_USER,Env:DB_PASSWORD -ErrorAction SilentlyContinue

# Run database migrations
python manage.py migrate

# Start the development server
python manage.py runserver
```

The Windows virtual environment exposes `python.exe`, not `python3.11.exe`, so the commands above use `python` inside the activated environment. The `dev:backend` script calls `python3.11` directly — on Windows, run `python manage.py runserver` instead, or install Python 3.11 with the `python3.11` launcher alias enabled.

## Quick Start

For the full setup walkthrough, see the [Installation](#installation) section above.

With Redis running, activate the backend virtual environment and start the two servers in separate terminals:

```bash
# Terminal 1 — backend (http://localhost:8000)
source backend/venv/bin/activate
pnpm run dev:backend

# Terminal 2 — frontend (http://localhost:8081)
pnpm run dev:frontend
```

`pnpm run dev:backend` runs `python3.11 -m daphne`, so the virtual environment has to be active for it to find the installed dependencies.

On macOS/Linux both can be started from one terminal instead, again with the virtual environment active:

```bash
source backend/venv/bin/activate
pnpm run dev
```

`pnpm run dev` chains the two commands with `&`. The Windows command prompt reads that as a command separator and blocks on the frontend server, so the backend never starts — use separate terminals there.

## Testing

```bash
# Type check
npx tsc --noEmit

# E2E tests (requires frontend on localhost:8081)
pnpm run test:e2e

# Backend tests
cd backend && python3.11 manage.py test game_engine
```

## Production Deployment

```bash
docker compose up --build
```

See [docs/operations/CHANGELOG.md](docs/operations/CHANGELOG.md) for release history.

## Architecture

- **Frontend:** Functional components with hooks, immutable state updates, TypeScript strict mode
- **Backend:** Django REST Framework, UUID primary keys, async WebSocket consumers
- **Real-time:** Django Channels WebSocket layer with Redis channel backend

For detailed architecture decisions, see [docs/architecture/SYSTEM_DESIGN_CHOICES.md](docs/architecture/SYSTEM_DESIGN_CHOICES.md).

## License

MIT
# auto-review test
# test
