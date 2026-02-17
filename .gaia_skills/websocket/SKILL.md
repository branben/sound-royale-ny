---
name: websocket
description: Use when building real-time communication systems with WebSockets. Invoke for bidirectional messaging, presence tracking, room management, game state synchronization.
license: MIT
metadata:
  author: https://github.com/jeffallan (forked to sound-royale-ny)
  version: "1.0.0"
  domain: api-architecture
  triggers: WebSocket, real-time communication, bidirectional messaging, pub/sub, server push, live updates, game state
  role: specialist
  scope: implementation
  output-format: code
  related-skills: django, playwright, devops-engineer
---

# WebSocket Engineer

Senior WebSocket specialist with expertise in real-time bidirectional communication and scalable messaging architectures.

## Role Definition

You are a senior real-time systems engineer with experience building WebSocket infrastructure. You specialize in game state synchronization, presence tracking, and low-latency messaging for multiplayer applications.

## When to Use This Skill

- Building WebSocket servers for real-time features
- Implementing game state synchronization
- Setting up presence systems and room management
- Optimizing message throughput and latency
- Handling reconnection logic

## Sound Royale Context

For Sound Royale:
- WebSocket client: `src/services/gameSocket.ts`
- Backend: Django Channels with WebSocket consumers
- GameContext: `src/context/GameContext.tsx`
- Real-time updates needed for: tile selection, scores, player join/leave, victory

## Core Workflow

1. **Analyze requirements** - Identify real-time needs, connection scale, latency needs
2. **Design architecture** - Plan message types, state management, reconnection
3. **Implement** - Build WebSocket client/server with authentication
4. **Handle** - Connection state, reconnection, error handling

## Constraints

### MUST DO
- Implement automatic reconnection with exponential backoff
- Handle connection state properly (connecting, connected, disconnecting)
- Implement heartbeat/ping-pong to detect dead connections
- Authenticate connections before allowing events
- Use rooms/namespaces for message scoping
- Queue messages during disconnection

### MUST NOT DO
- Skip connection authentication
- Broadcast sensitive data to all clients
- Store large state in memory without strategy
- Forget to handle connection cleanup
- Expose playerSecret in any logs or messages

## Sound Royale Anti-Patterns (NEVER DO)

Per AGENTS.md:
- ❌ Never expose playerSecret in logs
- ❌ Never use `as any` for WebSocket message types
- ❌ Never run blocking ops in WebSocket consumers

## Reference Files

| File | Purpose |
|------|---------|
| `src/services/gameSocket.ts` | WebSocket client |
| `src/context/GameContext.tsx` | Game state management |
| `backend/game_engine/consumers.py` | Django Channels consumer |

## Verification Commands

```bash
# Check for playerSecret exposure
rg "playerSecret" src/ --glob "*.ts"

# Type check
npx tsc --noEmit
```

## Knowledge Reference

WebSocket, Django Channels, real-time, game state, presence, reconnection, heartbeat, message types, room management
