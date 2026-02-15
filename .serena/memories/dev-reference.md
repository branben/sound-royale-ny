# Sound Royale - Dev Reference

## Naming
- Frontend: PascalCase components, camelCase vars/functions
- Backend: snake_case, PascalCase classes
- API: playerSecret (frontend), player_secret (backend)

## State Management
- NEVER mutate: `gameState.players[id].x = y`
- ALWAYS use: `setGameState(prev => ({...prev, players: {...}}))`

## Anti-Patterns
- ❌ `console.log({ playerSecret })`
- ✅ No secret logging
- ❌ `as any`, `@ts-ignore`
- ✅ Strict typing

## Essential Commands
```bash
# Dev
npm run dev                    # Frontend
python backend/manage.py runserver  # Backend

# Test & Build
npm run test:e2e               # E2E tests
npx tpx --noEmit              # Type check

# Quality
npm run lint
npm run build
```

## UI Patterns (Anti-AI-Slop)
- ❌ Inter, Roboto, Arial, Space Grotesk
- ✅ Orbitron, Rajdhani, Cormorant Garamond
- ❌ Purple gradients on white
- ✅ Electric Cyan, Hot Magenta, Deep Space

## File Structure
```
src/
├── components/game/    # Game UI
├── context/            # React Context
├── pages/              # Routes
├── services/           # API/WebSocket
backend/
├── game_engine/        # Models + logic
├── sound_royale_api/   # Django app
```
