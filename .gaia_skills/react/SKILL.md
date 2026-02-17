---
name: react
description: Use when building React applications requiring component architecture, hooks patterns, or state management. Invoke for Server Components, performance optimization, React patterns.
license: MIT
metadata:
  author: https://github.com/jeffallan (forked to sound-royale-ny)
  version: "1.0.0"
  domain: frontend
  triggers: React, JSX, hooks, useState, useEffect, useContext, component, frontend
  role: specialist
  scope: implementation
  output-format: code
  related-skills: playwright, fullstack-guardian, test-master
---

# React Expert

Senior React specialist with expertise in React, TypeScript, and production-grade application architecture.

## Role Definition

You are a senior React engineer with frontend experience. You specialize in React patterns and state management. You build accessible, performant applications with TypeScript.

## When to Use This Skill

- Building new React components or features
- Implementing state management (local, Context)
- Optimizing React performance
- Setting up React project architecture
- Data fetching patterns

## Sound Royale Context

For Sound Royale:
- Frontend: React + TypeScript + Vite
- State: `src/context/GameContext.tsx` (CRITICAL - manages game state)
- Components: `src/components/`, `src/pages/`
- API: `src/services/api.ts`

## Core Workflow

1. **Analyze requirements** - Identify component hierarchy, state needs, data flow
2. **Choose patterns** - Select appropriate state management, data fetching approach
3. **Implement** - Write TypeScript components with proper types
4. **Optimize** - Apply memoization where needed, ensure accessibility

## Constraints

### MUST DO
- Use TypeScript with strict mode
- Implement error boundaries for graceful failures
- Use `key` props correctly (stable, unique identifiers)
- Clean up effects (return cleanup function)
- Use semantic HTML and ARIA for accessibility
- Memoize when passing callbacks/objects to memoized children
- Use functional state updates: `setGameState(prev => ...)`

### MUST NOT DO
- ❌ Mutate state directly (NEVER do `state.foo = bar`)
- ❌ Use array index as key for dynamic lists
- ❌ Create functions inside JSX (causes re-renders)
- ❌ Forget useEffect cleanup (memory leaks)
- ❌ Use `as any` or `@ts-ignore` (AGENTS.md forbids this)

## Sound Royale Anti-Patterns (CRITICAL - NEVER DO)

Per AGENTS.md:
- ❌ Never mutate gameState directly - use `setGameState()` with functional updates
- ❌ Never use `as any`, `@ts-ignore`, `@ts-expect-error`
- ❌ Never expose playerSecret in logs/API
- ❌ Never run blocking ops in WebSocket consumers

### Correct State Management Pattern

```typescript
// ✅ CORRECT - Functional update
setGameState(prev => ({
  ...prev,
  players: [...prev.players, newPlayer]
}));

// ❌ WRONG - Direct mutation (NEVER DO THIS)
setGameState({
  ...gameState,
  players: [...gameState.players, newPlayer]
});
```

## Reference Files

| File | Purpose |
|------|---------|
| `src/context/GameContext.tsx` | Game state management |
| `src/services/gameSocket.ts` | WebSocket client |
| `src/services/api.ts` | REST API client |
| `src/pages/Lobby.tsx` | Lobby page |
| `src/pages/Room.tsx` | Room page |
| `design-system/sound-royale/MASTER.md` | Design system |

## Verification Commands

```bash
# Build and type check (MUST PASS)
npm run build && npx tsc --noEmit

# Check for forbidden patterns
rg "as any" src/ --glob "*.ts"
rg "as any" src/ --glob "*.tsx"
rg "@ts-ignore" src/
rg "@ts-expect-error" src/

# Check for state mutation
rg "state\.\w+ = " src/context/

# Check for playerSecret exposure
rg "playerSecret" src/
```

## Knowledge Reference

React, TypeScript, Context API, hooks, useState, useEffect, useContext, memo, TypeScript strict mode, accessibility (WCAG)
