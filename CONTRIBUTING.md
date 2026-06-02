# Contributing

## Code Conventions

### Frontend
- Functional components with hooks, no class components
- Immutable state updates — never mutate state directly
- TypeScript strict mode enabled — no `as any` or `@ts-ignore`
- Use `data-testid` attributes for E2E selectors, not CSS classes
- Animation via framer-motion, gated under `prefers-reduced-motion: reduce`

### Backend
- Django REST Framework patterns with ViewSets
- UUID primary keys for all models
- Async WebSocket consumers for real-time features
- Never expose `playerSecret` in logs, error responses, or serialized output
- Use `setGameState()` with functional updates on the frontend

### API
- Backend returns snake_case JSON
- All real-time state updates flow through WebSocket

## Before Committing

- [ ] `npx tsc --noEmit` passes
- [ ] `npm run build` passes
- [ ] Backend tests pass: `python backend/manage.py test game_engine`
- [ ] E2E tests pass if gameplay/UI changed
- [ ] No secrets or PII in committed files
- [ ] No large binaries or database dumps committed

## Security

- Never hardcode secrets, API keys, or tokens
- Never commit `.env` files, database files, or certificate files
- Report security issues privately, not in public issues
