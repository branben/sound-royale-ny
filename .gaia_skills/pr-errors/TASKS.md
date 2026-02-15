# PR Error Test Suite

Common PR errors (inspired by Gas Town issues) for GAIA to fix atomically.

## Error Patterns

| # | Error Type | Description | File | Pattern |
|---|------------|-------------|------|---------|
| 1 | TypeScript Error | Missing return type causes build failure | `src/lib/utils.ts` | Function lacks return type |
| 2 | State Mutation | Direct state mutation (anti-pattern) | `src/context/GameContext.tsx` | `state.score = newScore` |
| 3 | Missing Error Handler | No try/catch on async API call | `src/services/api.ts` | Unhandled Promise rejection |
| 4 | Secret Exposure | playerSecret logged to console | `src/services/gameSocket.ts` | `console.log(playerSecret)` |
| 5 | Missing Import | Using undefined function | `src/pages/Lobby.tsx` | Import not found |
| 6 | Race Condition | Stale closure in useEffect | `src/components/game/BingoTile.tsx` | Missing dependency |

## Usage

For each error:
1. Introduce the bug (if not already present)
2. Run `gaia-polecat` to fix
3. Verify with build/tests
4. Rate using `.gaia_skills/rating-system/RATING.md`

---

## Current Status

- [x] Error 1: TypeScript return type
- [x] Error 2: State mutation  
- [x] Error 3: Missing error handler
- [x] Error 4: Secret exposure
- [x] Error 5: Missing import
- [x] Error 6: Race condition

---

## Notes

These errors mirror real-world PR issues:
- #905 (Gas Town): Flag hallucination → TypeScript errors
- #660: Race conditions → useEffect dependencies
- Security issues: Secret exposure in logs
