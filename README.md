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
- Python 3.11 with the `python3.11` executable and `pip`

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

```bash
cd backend

# Create a virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Create a local environment file for development
cat > .env << 'EOF'
SECRET_KEY=dev-secret-key
DEBUG=True
EOF

# Run database migrations
python manage.py migrate

# Start the development server
python manage.py runserver
```

The backend API will be available at `http://localhost:8000`.

## Quick Start

For the full setup walkthrough, see the [Installation](#installation) section above.

```bash
# Start both frontend and backend together
pnpm run dev
```

## Testing

```bash
# Type check
npx tsc --noEmit

# E2E tests (requires frontend on localhost:8081)
pnpm run test:e2e

# Backend tests
cd backend && python manage.py test game_engine
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
