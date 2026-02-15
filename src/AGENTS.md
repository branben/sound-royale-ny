# React Frontend Knowledge Base

## OVERVIEW
React TypeScript frontend (80 files) for multiplayer music bingo game with real-time WebSocket integration.

## STRUCTURE
```
src/
├── components/           # React components (ui + game)
├── context/            # React contexts (GameContext)
├── hooks/              # Custom React hooks
├── pages/              # Route components
├── services/           # API and WebSocket services
├── types/              # TypeScript type definitions
├── lib/                # Utility functions
└── data/               # Static data and constants
```

## WHERE TO LOOK
| Task | Location | Notes |
|------|----------|-------|
| Game state management | context/GameContext.tsx | Central gameState store |
| UI components | components/ui/ | Reusable design system components |
| Game components | components/game/ | Bingo board, tile, player components |
| WebSocket handling | services/gameSocket.ts | Real-time game updates |
| Type definitions | types/ | Shared TypeScript interfaces |
| Custom hooks | hooks/ | Game logic and state hooks |

## CONVENTIONS
- Functional components with TypeScript
- Immutable state updates via setGameState
- Custom hooks for game logic separation
- WebSocket integration for real-time updates
- Design system components for UI consistency

## ANTI-PATTERNS (FRONTEND)
- Never mutate gameState directly - use functional updates
- No direct WebSocket connections in components - use services
- Never expose playerSecret in client-side logs
- No inline styles - use design system components
- Avoid useEffect without proper dependency arrays

## UNIQUE STYLES
- Music bingo domain with tile selection and upload
- Real-time multiplayer state synchronization
- Audio file handling and preview
- PlayerSecret-based authentication