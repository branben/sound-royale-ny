# Sound Royale — Agent Knowledge Base

> **SkillOpt living document** (arXiv:2605.23904) — this file is a trainable parameter. It evolves via validation-gated edits after each session. The vault at `/Users/brandonbennett/Documents/KnowledgeCore` is the reflection/evaluation layer.

**Version:** 3 | **Edit count:** 3 | **Last session:** 2026-06-20 | **Branch:** `main` | **Commit:** `55f3642`

## Overview

Multiplayer music bingo game — producers compete head-to-head on 3×3 genre boards, upload beats in real-time, and race to claim tiles. Django 4.2 + DRF + Channels + Redis + PostgreSQL fronted by React 18 + TypeScript + Vite + Tailwind/shadcn.

## Project Structure

```
sound-royale-ny/
├── src/                  # React frontend (147 TS/TSX)
│   ├── pages/            # Route pages (11), lazy-loaded via React.lazy
│   ├── components/       # UI (~70 files): ui/ (shadcn), game/, lobby/, auth/
│   ├── services/         # api.ts (Axios), gameSocket.ts (WS singleton), discordSession.ts
│   ├── context/          # GameContext.tsx + useGame.ts (room state), UserContext.tsx (identity)
│   ├── hooks/            # usePlayerColors, use-toast, use-mobile
│   ├── lib/              # cn() utility, motion variants
│   ├── types/            # game.ts — GameState, Player, Tile, Round, etc.
│   └── data/             # Mock game state
├── backend/              # Django (49 Python files)
│   ├── sound_royale_api/ # Project config: settings, asgi, wsgi, urls
│   ├── game_engine/      # Core: models, views, serializers, consumers, auth, bingo_utils
│   ├── gaia/             # LLM client utilities (decoupled, future AI)
│   └── media/audio/      # Uploaded beats
├── docs/
│   ├── plans/            # Remediation/bug-fix plans
│   ├── architecture/     # SYSTEM_DESIGN_CHOICES.md
│   ├── reference/        # GAME_ENGINE.md, VARIABLE_LOG.md
│   └── guides/           # MVP_SCOPE.md (locked core loop)
├── design-system/        # MASTER.md — colors, typography, spacing
├── tests/e2e/            # Playwright E2E tests
└── .agents/skills/       # agent-browser, design-taste-frontend
```

## Where to Look

| Task | Path |
|------|------|
| Entry point | `src/main.tsx` → `src/App.tsx` |
| Routes | `src/App.tsx` — React Router v6, lazy-loaded |
| Game state | `src/context/GameContext.tsx` + `useGame.ts` |
| HTTP client | `src/services/api.ts` — `roomApi`, `gameApi` |
| WebSocket | `src/services/gameSocket.ts` — singleton, exp backoff |
| Auth (frontend) | `src/services/discordSession.ts` + `DiscordCallback.tsx` |
| DB models | `backend/game_engine/models.py` — Room, Player, Tile, Round, Vote, ThemeRotation |
| Serializers | `backend/game_engine/serializers.py` — nested GameState |
| API routes | `backend/game_engine/urls.py` — DRF routers |
| WS consumer | `backend/game_engine/consumers.py` — GameConsumer |
| Auth (backend) | `backend/game_engine/auth.py` — PlayerSecretAuthentication |
| Game logic | `backend/game_engine/bingo_utils.py` — bingo detection, scoring |
| Design system | `design-system/sound-royale/MASTER.md` |
| Architecture decisions | `docs/architecture/SYSTEM_DESIGN_CHOICES.md` |
| State variable ref | `docs/reference/VARIABLE_LOG.md` |

## Conventions

### Frontend
- **Imports**: `@/` alias → `src/`
- **Styling**: Tailwind + shadcn/ui primitives
- **Components**: Functional + hooks, no class components
- **State**: React Context (per-room) + React Query (server data)
- **Naming**: Pages `PascalCase`, components `PascalCase`, hooks `use*`, utils `camelCase`
- **Type safety**: Strict mode, types in `src/types/game.ts`. No `@ts-ignore`/`@ts-expect-error`/`as any`

### Backend
- **Framework**: Django 4.2 + DRF + Channels (ASGI via Daphne, Redis channel layer)
- **Models**: UUID PKs, `TextChoices` enums, `snake_case`, `is_` prefix for booleans
- **Auth**: `X-Player-Id` + `X-Player-Secret` headers (issued on room join/create). JWT for admin only
- **Real-time**: AsyncWebsocketConsumer. Clients can only send `bingo_achievement` + `vote_submitted`

### Auth Flow
1. Create/join room → server returns `player_id` + `player_secret`
2. Sent as `X-Player-Id` + `X-Player-Secret` on every API call
3. WebSocket auth: same creds as query params on connect
4. Discord OAuth: optional, via `discordSession.ts` + `discord_service.py`

## Anti-Patterns

- **No Redux or Zustand** — React Context + React Query only
- **No producer voting** — spectators only. Cut from MVP
- **Dark flat stage is INTENDED** — the "polished Jackbox" aesthetic is a dark game-show stage (`#09090b` near-black bg per `design-system/sound-royale/MASTER.md`). The prohibition is *styling*, not darkness: NO neon/glow/cyberpunk/synthwave — no glow box-shadows, no gradients, no glassmorphism, no always-on pulse. Authoritative spec: `design-system/sound-royale/MASTER.md` (the repo-level shorthand here is a summary, not the source of truth).
- **No `as any`, `@ts-ignore`, `@ts-expect-error`** — CI-enforced
- **No direct DOM manipulation** — use shadcn/ui abstractions
- **No tile gen before players join** — generate on join for immediate feedback

## Active Guardrails

These are living rules tied to open GitHub issues. Remove each section when its issue closes.
Serena memories at `guardrails/` contain the canonical version with full context.

### WebSocket Reconnect (issue #101)
- MUST re-fetch full game state on WebSocket reconnect via `roomApi.getRoom(roomCode)`
- MUST NOT rely solely on incremental `game_state_update` events after reconnect
- MUST display a "Reconnecting…" banner during the reconnection window
- MUST replace (not merge) game state after reconnect

### Error Handling (issue #102)
- MUST NOT use empty catch blocks (`} catch {}`, `catch (e) {}` with no body)
- MUST NOT use bare except in Python (`except: pass`, `except Exception: pass`)
- MUST log AND surface all errors to the user (toast, banner, or error state)
- MUST NOT use `console.error()` as the only error handling — invisible to users
- Backend: MUST NOT swallow DB exceptions in consumers

### Database Transactions (issue #103)
- MUST use `@transaction.atomic` on all state-mutating endpoints
- MUST use `select_for_update()` on contested rows (tiles, votes, host)
- MUST wrap room creation (Room + Player) in a single atomic transaction
- MUST make bingo claim endpoint idempotent

### Audio Upload (issue #104)
- MUST show upload progress indicator (0-100%)
- MUST validate file size client-side BEFORE upload (max 10MB)
- MUST restrict to MP3, WAV, OGG formats only
- MUST support cancel/retry on failed uploads
- MUST surface specific error messages

### Secret Handling (issue #105)
- MUST hash player_secret before storage (Argon2 or SHA-256)
- MUST NOT send secrets in URL query strings
- MUST use `Sec-WebSocket-Protocol` header or post-handshake auth for WebSocket
- MUST implement secret rotation endpoint

## Session-Start Protocol

Before making any code changes in this repo:

1. Read `serena read_memory("guardrails/")` to load all active guardrails
2. Run `codegraph explore` on any symbol before editing it
3. Run `lsp_diagnostics` on every changed file before reporting done
4. If a guardrail blocks your intended change, surface it to the user — don't bypass silently

## Commands

```bash
npm run dev              # Vite (8081) + backend concurrently
npm run build            # Production build
npm run lint             # Type check + ESLint
npm run format:write     # Prettier
npm run test             # Vitest unit tests
npm run test:backend     # Django test suite
npm run db:migrate       # Makemigrations + migrate
npm run test:e2e         # Playwright E2E
npm run verify:types     # tsc --noEmit
docker compose up        # Full prod stack
```

## Notes

- **MVP lock**: 2 producers + spectators, 15-min rounds, beat upload, voting, bingo, ELO — frozen. New features sign off against `docs/guides/MVP_SCOPE.md`
- **Colors**: Player 1=red, 2=blue, 3=yellow, 4=green. Tailwind `player-1` through `player-4`. Borders/highlights only, never large surfaces
- **Fonts**: Righteous (titles), Poppins (body), SF Mono (room codes, timers)
- **Sentry**: Error tracking via DSN env var
- **Gaia**: LLM client utilities in `backend/gaia/` — decoupled from core game flow

---

## SkillOpt Learning Loop

This file is a **trainable parameter** (per SkillOpt arXiv:2605.23904). Every session should:
1. **Read** this file + the experience buffer below
2. **Work** — implement, fix, refactor
3. **Reflect** — run the reflection protocol
4. **Update** — propose validation-gated edits to this file
5. **Propagate** — sync learnings to the vault

### Reflection Protocol (run at end of every session)

```
1. What did we learn about the codebase?
   → Add to Experience Buffer below
2. Did any convention/anti-pattern prove useful?
   → Update the Conventions/Anti-Patterns sections
3. Were any commands wrong or missing?
   → Update Commands section
4. Did any Where-to-Look path change?
   → Update the mapping table
5. Are there new test patterns or CI quirks?
   → Add to Experience Buffer
6. Run validation gates before committing any edit to this file
```

### Validation Gates (must pass before AGENTS.md edits are accepted)

| Gate | Command | Required |
|------|---------|----------|
| TypeScript compiles | `npm run verify:types` | ✅ Always |
| Linter clean | `npm run lint` | ✅ Always |
| Frontend tests pass | `npm run test` | If tests touched |
| Backend tests pass | `npm run test:backend` | If backend touched |
| Formatting clean | `npm run format` | ✅ Always |
| E2E smoke passes | `npm run test:e2e -- --grep "smoke"` | If game logic changed |
| Vault sync | Vault daily note + log created | ✅ Always |

### Experience Buffer

*Learnings accumulated across sessions. Append new entries on reflection.*

| Date | Learning | Source |
|------|----------|--------|
| 2026-06-19 | Django is 4.2.7, not 5.2 (in requirements.txt). Both AGENTS.md and README.md had wrong version. Always verify deps from lockfile, not memory. | [AGENTS.md fix] |
| 2026-06-19 | The KnowledgeCore vault already had a deep Architecture.md (326 lines) created by parallel explore agents the day before. Before creating docs, check the vault first. | [Architecture.md discovery] |
| 2026-06-19 | Lobby redesign (Jun 18) switched to game-show layout with GSAP animations, viewport-fit, no-scroll. Any lobby work must respect this — no scroll, no scrollbars. | [commit 6be0a3b] |
| 2026-06-19 | `npm run format` (prettier check) fails — only `npm run format:write` works. Prettier check is an unreliable validation gate. | [AGENTS.md v2] |
| 2026-06-20 | JWT auth migration: `resolve_player_from_request()` pattern works well for JWT-primary + player_secret fallback. Must separate requester auth from target identification in actions like kick_player. | [#67c] |
| 2026-06-20 | Subagent (category: unspecified-high) tends to produce stray files and incomplete implementations — always verify changes and clean up. | [#67d, #71] |
| 2026-06-20 | MagicMock in Django tests causes false positives for auth checks — use real request objects or AnonymousPlayer for unauthenticated test cases. | [#67d] |
| 2026-06-20 | All 17 production remediation issues closed. 195 backend tests + 15 new frontend tests pass. | [session end] |

### Session History

| Date | Agent | Focus | Key Outcome | Validation |
|------|-------|-------|-------------|------------|
| 2026-06-19 | Sisyphus | AGENTS.md creation + vault contextualization | Created 144-line AGENTS.md, connected to vault, fixed Django version, added SkillOpt learning loop | — |

### Vault Reference

The KnowledgeCore vault (`/Users/brandonbennett/Documents/KnowledgeCore`) stores:
- `01-Projects/Sound Royale/README.md` — Project index: branch, status, links
- `01-Projects/Sound Royale/Architecture.md` — Deep architecture: data flows, DB models, WebSocket protocol, auth, E2E tests (326 lines)
- `05-Daily/YYYY-MM-DD.md` — Daily context and session logs
- `Logs/YYYY-MM-DD.md` — Operation logs
- `_CLAUDE.md` — Vault operating manual, Active Projects list

Start every session by reading the vault daily note for continuity.

## Agent skills

### Issue tracker

Issues live on GitHub. Use the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Five canonical roles: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context repo. Read `CONTEXT.md` at repo root for domain vocabulary. ADRs live in `docs/adr/` (created lazily). See `docs/agents/domain.md`.
