# Sound Royale 🎹

The High-Stakes Game Show for Music Producers

## Quick Start

```bash
# Frontend
npm install
npm run dev

# Backend
cd backend
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
python manage.py runserver
```

## Project Overview

Sound Royale is a multiplayer music bingo game where producers compete by completing bingo boards with audio tiles. Players upload audio samples, and the game broadcasts them in real-time for other players to match and claim tiles.

**Tech Stack:**
- **Frontend:** React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui
- **Backend:** Django 5.2, Django REST Framework, Django Channels (WebSockets)
- **Real-time:** WebSockets via Django Channels with Redis
- **Database:** SQLite (dev), PostgreSQL (production)

## Architecture

```
sound-royale-ny/
├── src/              # React frontend
│   ├── components/   # UI components
│   ├── context/      # React Context for state management
│   ├── pages/        # Route components
│   ├── services/     # API and WebSocket clients
│   └── types/        # TypeScript definitions
├── backend/          # Django backend
│   ├── game_engine/  # Core game logic and models
│   └── sound_royale_api/  # Django project config
├── tests/            # E2E tests (Playwright)
└── docs/             # Documentation
    ├── guides/       # How-to guides
    ├── reference/    # Technical references
    ├── architecture/ # Architecture docs
    ├── operations/  # CI/CD & operations
    ├── testing/      # Testing docs
    └── gaia/         # AI-assisted development docs
```

See [docs/architecture/SYSTEM_DESIGN_CHOICES.md](docs/architecture/SYSTEM_DESIGN_CHOICES.md) for detailed architecture decisions.

## Development

### Running Tests

```bash
# Frontend type check
npx tsc --noEmit

# E2E tests (requires frontend running on localhost:8080)
npm run test:e2e

# Backend tests
cd backend
python manage.py test
```

### Code Conventions

- **Frontend:** Functional components with hooks, immutable state updates, TypeScript strict mode
- **Backend:** Django REST Framework patterns, UUID primary keys, async WebSocket consumers
- **State:** Never mutate gameState directly - use functional updates
- **Security:** Never expose playerSecret in logs or API responses

See `AGENTS.md` for detailed anti-patterns and conventions.

## Documentation

- [Full Documentation](docs/README.md)
- [Getting Started](docs/guides/MVP_SCOPE.md)
- [Architecture](docs/architecture/SYSTEM_DESIGN_CHOICES.md)
- [Testing](docs/testing/E2E_TASK_LIST.md)

## AI-Assisted Development

This project uses AI tools for development automation. See [docs/gaia/README.md](docs/gaia/README.md) for details on:
- GAIA polecat orchestration
- Serena MCP for code navigation
- CocoIndex Code for semantic discovery
- Qodo feedback automation

## Before Commit

- [ ] Build passes (`npm run build && npx tsc --noEmit`)
- [ ] Tests pass (`npm run test:e2e` or `python backend/manage.py test`)
- [ ] No secrets/PII in committed files
- [ ] Update CHANGELOG.md if applicable
