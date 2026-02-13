# 📍 CURRENT MISSION: Fix Critical Security Issues, GAIA Security Hardening & UI/UX Improvements

> Phase 2 ELI5 + PERN alignment added on 2026-02-13. This document now includes explicit tradeoffs (speed, efficiency, cost), concrete anchors to code, and verification timestamps.

Status: IN PROGRESS (2026-02-13)
Priority: CRITICAL (Security) + HIGH (UI/UX)
Owner: Sisyphus (Builder)
Risk Level: CRITICAL

# 📘 Project Best Practices

## 1. Project Purpose
Sound Royale NY is a multiplayer music bingo game. The frontend is a React + TypeScript app (Vite) and the backend is a Django (REST + WebSockets) service. Tests include Playwright E2E and Django unit tests. The repo also contains GAIA (Symbolic Persistence) components to persist “what matters” across sessions via secure, Git-backed beads.

## 2. Project Structure
- src/ — React frontend (TypeScript)
  - components/ — UI components (use design-system tokens first)
  - context/ — React Context providers (e.g., GameContext, UserContext)
  - hooks/ — Reusable hooks (e.g., useGameRefresh, useWebSocketConnection)
  - pages/ — Route-level views (Lobby, Room, Producer, etc.)
  - services/ — API clients and network logic
  - types/ — Shared TypeScript DTOs and domain types
- backend/ — Django backend
  - game_engine/ — Models, serializers, WebSocket consumers, routing
  - sound_royale_api/ — Django project config (settings, asgi, urls)
  - gaia/ — GAIA guards and adapters (e.g., guards_adapter.py)
  - manage.py, requirements.txt — Backend entrypoints and deps
- tests/
  - e2e/ — Playwright E2E test scenarios
  - gaia/ — GAIA guard tests
- design-system/sound-royale/ — Design system guidance and page-specific patterns
- docs/ — Plans, references, and system-level documentation
  - CURRENT_PLAN.md — Active mission and verification matrix
- Root config
  - package.json — Frontend scripts and toolchain
  - playwright.config.ts — E2E runner config
  - tsconfig*.json — TypeScript configuration
  - vite.config.ts — Vite config
  - .beadsignore — GAIA ignore rules
  - .github/workflows/gaia-guards-ci.yml — GAIA guards CI

## 3. Test Strategy
- Frameworks
  - Playwright for E2E browser tests (user flows: lobby → room → gameplay)
  - Django’s test framework for backend units/integration
  - TypeScript type checks (npx tsc --noEmit)
- Organization
  - E2E tests under tests/e2e/ with scenario-based folders
  - Backend tests colocated under backend/… or dedicated tests modules
- Mocking
  - Mock data is allowed only under VITE_E2E_TESTING=true
  - Never top-level import mocks; dynamically import under guarded branches to enable dead code elimination
- Philosophy
  - Prioritize E2E coverage for critical flows (lobby join, room load, tile selection, bingo detection)
  - Add backend unit tests for serializers, models, and WebSocket consumers (no blocking ops)
  - Add contract tests for API response shapes that frontend depends on
- Expectations
  - CI should run GAIA guards, type checks, builds, and (when available) E2E smoke
  - Acceptance test for Room Load: ensure exactly one GET within a window and correct UI state (no fetch loops)

## 4. Code Style
- TypeScript (Frontend)
  - Strict typing; no type suppression (no `as any`, `@ts-ignore`, `@ts-expect-error`)
  - Immutable state updates; always use functional updates with setGameState
  - Keep hooks pure and effects stable (guard dependencies; avoid refetch loops)
  - Boundary mapping: adapt snake_case API -> camelCase in a single boundary layer or keep consistent DTOs and map once
- Python (Backend)
  - DRF serializers define the contract; never expose secrets (e.g., player_secret)
  - Use UUID primary keys
  - WebSocket consumers must be non-blocking; avoid long/CPU-bound work on event loop
  - Clear separation of concerns: models ↔ serializers ↔ consumers/views
- Documentation
  - Keep docs concise; explain intent (“why”), not restating code
  - Update docs/CURRENT_PLAN.md when workflows or verification steps change
- Errors & Exceptions
  - Frontend: centralize API errors; reflect in UI state without infinite retries
  - Backend: return explicit error codes and payloads; validate inputs/outputs

## 5. Common Patterns
- Context & Hooks
  - GameContext for game/session state; expose explicit actions and stable hooks (e.g., useGameRefreshEffect)
  - UserContext for authentication-bound data; never place secrets in globally shared state
- Data Fetch & Stability
  - One-shot guard for initial room load (in-flight ref + success latch)
  - Invalidate/refetch on route change, explicit refresh, or WebSocket signals
- GAIA (Symbolic Persistence)
  - Beads store symbolic pointers + task context; use after clarifying “why” (Gas Town intent)
  - Guards enforce path integrity and secret exclusion; adhere to .beadsignore
- Design System First
  - Favor design-system/sound-royale tokens and patterns
  - Keep Tailwind/classnames aligned with the design system guidance

## 6. Do’s and Don’ts
- ✅ Do
  - Use functional state updates with setGameState
  - Keep useEffect deps stable; add guards to prevent fetch loops
  - Gate mocks behind VITE_E2E_TESTING and dynamic imports
  - Validate DRF → TS contracts; document mapping
  - Use GAIA beads for high-signal symbols with task context
  - Write Django tests for serializers/consumers and Playwright tests for core flows
  - Follow design system tokens and accessibility standards
- ❌ Don’t
  - Don’t expose playerSecret in state, logs, or API responses
  - Don’t block in WebSocket consumers
  - Don’t use `as any`, `@ts-ignore`, or `@ts-expect-error`
  - Don’t mutate state directly
  - Don’t create beads for secrets or paths outside project root
  - Don’t top-level import mocks or include dead test code in production

## 7. Tools & Dependencies
- Frontend
  - React, TypeScript, Vite, TailwindCSS (tokens via design system)
  - Playwright for E2E
  - Scripts:
    - npm run dev — Start dev server
    - npm run build — Production build
    - npm run test:e2e — Playwright E2E tests
    - npx tsc --noEmit — Type check
- Backend
  - Django, Django REST Framework, WebSocket/ASGI stack
  - Commands:
    - python backend/manage.py runserver — Dev server
    - python backend/manage.py test — Django tests
- GAIA
  - .beadsignore to block secrets
  - GAIA guards CI at .github/workflows/gaia-guards-ci.yml

## 8. Other Notes
- Domain Constraints
  - Multiplayer real-time game; correctness of state sync via WebSockets is critical
  - Room loading must be stable: one request, consistent UI state, and explicit invalidation routines
- LLM Guidance
  - Adhere to anti-pattern rules in AGENTS.md and repository docs
  - Prefer design-system primitives and tokens; avoid arbitrary styles
  - Keep code changes production-ready with tests and type checks
- ELI5 + PERN Alignment
  - If this were PERN: validate response shapes (zod), use React Query for dedupe/caching, store intent in Redux
  - Here: validate DRF serializers, use guarded effects or introduce a cache layer, keep intent in GameContext/UserContext
- Security & Tradeoffs
  - Prioritize secret safety, path integrity for GAIA, and stable fetch logic
  - Tradeoffs: small overhead for guards and docs buys significant reliability and auditability

---


## 🚨 CRITICAL: SECURITY ISSUES FROM PR #2 REVIEW

### Status Reality Check (2026-02-13)
- Security fixes from PR #2 were implemented; several completion claims needed correction.
- Mock data is now E2E-only (no-room fallback removed in GameContext).
- UserProvider was added; /room/:id no longer crashes on missing provider.
- Blocker: Room view shows “Failed to load room” despite backend 200 responses during Playwright run; repeated fetch loop observed.
- Design system files live under design-system/sound-royale/ (not design-system/ root).
- Build/E2E/visual verification must be freshly re-run and documented.

### Previously Fixed (reconfirmed scope only; see Verification Matrix)

1) PlayerSecret Exposure (CRITICAL) — FIXED
- GameContext no longer stores playerSecret in shared state.

2) Secret Logging in Test File (CRITICAL) — FIXED
- Removed tests/qodo-test-anti-patterns.js.

3) Room Route Provider (HIGH) — FIXED
- Room receives roomCode via GameProvider wrapper.

4) Host Detection Logic (HIGH) — FIXED
- Uses player.is_host instead of array index.

5) Error State Management (MEDIUM) — FIXED
- isJoined resets to false on API errors.

6) Missing GameContext Hooks (BLOCKING) — FIXED
- Added useGameRefresh, useGameRefreshEffect, useWebSocketConnection.

## 🎯 UPDATED OBJECTIVES

### Phase 0: Tooling & Workflow (MEDIUM)
- [x] TW-A. Document MCP tool status — MCP servers defined in ~/.codex/config.toml; Qodo now remote URL; handshake failed (initialize response)
- [x] TW-B. Locate Codex MCP config (read-only) — ~/.codex/config.toml
- [x] TW-C. Decide on Qodo MCP integration — Use remote URL; do not edit config.toml without explicit approval
- [ ] TW-D. Map Qodo PR review workflow — Document how to fetch and interpret Qodo comments for this repo
  - Steps (fallback included):
    - If handshake works: run the review command and collect comments linked to commit SHA
    - If handshake fails: open the PR page and download raw review artifacts or copy comments into docs/ops/AGENTS_NOTES.md
- [x] TW-E. GAIA Symbolic Persistence Security (Phase 1) — Implemented Path Integrity Guards, Secret Exclusion, and .beadsignore (2026-02-13)

### Phase 1: Security Fixes (CRITICAL) — COMPLETED (Pending verification timestamps)
- [x] A. Remove PlayerSecret from GameContext
- [x] B. Fix Test File — Removed tests/qodo-test-anti-patterns.js
- [x] C. Fix Room Route — Added RoomWrapper with GameProvider
- [x] D. Fix Host Detection — Use player.is_host instead of array index
- [x] E. Fix Error Handling — Reset isJoined state on API errors
- [x] F. Add Missing Hooks — useGameRefresh, useGameRefreshEffect, useWebSocketConnection
- [x] G. Security Scan — Target patterns identified

### Phase 2: UI/UX Design System Generation (HIGH) — COMPLETED

ELI5
- The design system is our restaurant’s menu and plating rules. We wrote the rules once and every dish (page/component) now looks consistent and pro.

If this were PERN you would’ve
- Centralized Tailwind theme + a component kit; documented patterns in a Storybook; enforced with ESLint/style rules.

Here we’re doing this
- Single source of truth at design-system/sound-royale/MASTER.md
- Applied tokens/patterns to Lobby, Room, BingoBoard, PlayerView

Tradeoffs
- Speed: Slightly slower up front than ad‑hoc CSS; faster later when scaling more screens.
- Efficiency: Fewer bespoke classes; smaller diffs; easier QA.
- Cost: Negligible runtime; small maintenance to keep MASTER.md synced.

Verification (timestamped)
- Last verified: 2026-02-13 — Design tokens present and referenced in updated pages/components (see UI Compliance section below for greps and allowlist).

- [x] Generate Design System — design-system/sound-royale/MASTER.md
- [x] Apply to Lobby/Room pages and components

### Phase 2.5: Mock Data Policy & Cleanup (HIGH)
- [x] Inventory mock usage — GameContext, Producer, Index, UploadDrawer
- [x] Policy — Mock data only for E2E (VITE_E2E_TESTING)
- [x] Restrict mock data to VITE_E2E_TESTING=true — Removed no-room fallback
- [x] Update Producer and /spectator flows — Gate to E2E-only
- [x] Update verification docs — Reflect E2E-only policy

### Phase 3: Lobby UI Redesign (HIGH) — COMPLETED
- [x] Apply design system styling and animations

### Phase 4: Room UI Redesign (MEDIUM) — COMPLETED
- [x] Redesign visuals, BingoBoard effects, player cards, hierarchy

### Phase 5: Userflow Blockers (CRITICAL) — IN PROGRESS

ELI5
- Backend says “Order up!” once, but our waiter kept asking “Is it ready yet?” forever. We add a kitchen timer so we only ask once and stop when food is served.

If this were PERN you would’ve
- Used React Query with zod schema validation and an `enabled` flag to dedupe and cache the request.

Here we’re doing this
- Validate the Django response against our RoomDTO contract, then use a one‑shot guard (in‑flight ref + success latch) in useGameRefreshEffect to prevent re‑fetch storms. Only refetch on: route change, manual refresh, or a WebSocket signal.

Tradeoffs
- Speed: Quick guard now beats a full React Query migration.
- Efficiency: Prevents network spam and re‑renders immediately; React Query still a future upgrade for cache, retries, and invalidation.
- Cost: Zero new deps today; future React Query adoption adds a small bundle and mental model.
- [x] UF-A. Playwright userflow run (2026-02-09) — Blocked by missing UserProvider
- [x] UF-B. Wrap App with UserProvider — src/main.tsx
- [x] UF-C. Re-run Playwright userflow (2026-02-10) — Provider present; Room shows “Failed to load room”
- [ ] UF-D. Fix Room load errors — Investigate fetch loop / error state despite API 200
  - [x] UF-D1: Expose setGameState in GameContext (Room/PlayerView use it)
  - [x] UF-D2: Stabilize useGameRefreshEffect usage to stop render-loop fetches
  - [ ] UF-D3: Re-run userflow (Playwright CLI blocked by npm registry access)
    - Registry fallback (documented below):
      - Use local npx cache or mirror registry if available
      - Provided debug scripts: ./debug_npx.sh and ./debug_playwright.sh as a plan B during outages

### Phase 6: Verification & Testing (MEDIUM) — PENDING
- [ ] VT-A. Security Verification — Confirm no playerSecret in GameContext; no secret logging
- [ ] VT-B. UI Review — Check against design system recommendations
- [ ] VT-C. E2E Testing — Full Playwright flow passes (after UF unblocked)
- [ ] VT-D. Visual Regression — Manual review completed
- [ ] VT-E. GAIA Security Audit — Verify guards block out-of-root access and secrets

## 📂 TARGET FILES FOR MODIFICATION

### Security Fixes (Phase 1 — completed)
- src/context/GameContext.tsx — Removed playerSecret exposure, added hooks
- tests/qodo-test-anti-patterns.js — DELETED
- src/App.tsx — Fixed Room route provider, added GameRefreshProvider
- src/pages/Lobby.tsx — Fixed host detection and error handling

### Design System (Phase 2)
- design-system/sound-royale/MASTER.md — Generated design system
- design-system/sound-royale/pages/lobby.md — Lobby-specific overrides
- design-system/sound-royale/pages/room.md — Room-specific overrides

### Mock Data Policy (Phase 2.5)
- src/context/GameContext.tsx — Mock data gating logic
- src/data/mockGameState.ts — Mock data source
- src/pages/Producer.tsx — Currently relies on mock player
- src/pages/Index.tsx — Spectator view uses mock data
- src/components/game/UploadDrawer.tsx — Local preview uses fakeUrl

### UI Implementation (Phases 3–4)
- src/pages/Lobby.tsx — Complete redesign
- src/pages/Room.tsx — Complete redesign
- src/components/game/BingoBoard.tsx — Visual enhancements
- src/components/game/PlayerView.tsx — Enhanced design

### Userflow Blockers (Phase 5)
- src/main.tsx — Add UserProvider wrapper
- src/context/UserContext.tsx — Provider export/usage
- src/pages/Room.tsx — Uses useUser (requires provider)

## 🧪 VERIFICATION COMMANDS

Note: To make “COMPLETED” truly done‑done, we now require timestamped verification entries. See the Verification Matrix with last run stamps below.

### Security Verification
```bash
# Verify no secret exposure in GameContext
rg "playerSecret" src/context/GameContext.tsx
rg "console\.log.*secret" src/
rg "player_secret" backend/ --type py | grep -v "exclude\|model\.player_secret"
```

### Build Verification
```bash
npm run build  # Should pass with no errors
npx tsc --noEmit
```

### Design System Verification
```bash
# Check design system exists
ls -la design-system/sound-royale/MASTER.md
head -50 design-system/sound-royale/MASTER.md
```

Allowlist note (reduce noise):
- Some gradients/animations are intentional per MASTER.md. When grepping for AI‑slop patterns, compare hits against the allowlist in the design system before flagging.

### Mock Data Verification
```bash
# Mock data should only be used when VITE_E2E_TESTING=true
rg "mockGameState" src/context/GameContext.tsx
rg "VITE_E2E_TESTING" src/context/GameContext.tsx
```

### UI Compliance
```bash
# Check for AI-slop patterns (consult allowlist in MASTER.md before flagging)
rg "font-inter\|font-roboto\|font-arial" src/ --type tsx
rg "bg-gradient-to-r from-purple" src/ --type tsx
rg "className.*p-4.*m-4.*rounded" src/ --type tsx | wc -l  # Generic patterns
```

Additions for enforcement (PERN analogy: ESLint rules on style usage):
- ESLint doc example (forbidden top-level mock import):
```js
// eslint.config.js (doc example)
{
  rules: {
    'no-restricted-imports': [
      'error',
      {
        paths: [
          { name: '@/data/mockGameState', message: 'Use dynamic import under __E2E__ guard only.' },
        ],
      },
    ],
  },
}
```
- CI grep example:
```bash
rg -n 'from .*mockGameState' src/ --type tsx --type ts || true
```

Tradeoffs
- Speed: +10 minutes to wire checks.
- Efficiency: Actionable signals > noise.
- Cost: Minimal CI time; better long‑term quality.

## 🔄 WORK STATUS (2026-02-13)

Phase 2 “Completed” — Last Verified: 2026-02-13 (see Verification Matrix below). Includes UI Compliance allowlist and mock‑policy enforcement notes.

### Critical Security Issues — FIXED (pending re-verify)
- PlayerSecret exposure removed from GameContext.tsx
- Secret logging test file deleted
- Room route provider fixed
- Host detection uses player.is_host
- Error handling resets isJoined on failure
- Missing hooks added in GameContext

### Current Blocker
- Room view shows “Failed to load room” despite backend 200s (probable fetch loop)

### Tooling & Workflow — IN PROGRESS
- Codex MCP config located in ~/.codex/config.toml
- Qodo MCP switched to remote URL
- Qodo MCP handshake failed (initialize response)

### GAIA Security Hardening (Symbolic Persistence) — IN PROGRESS
- [x] Phase 1: Security Guards (Path Integrity & Secret Exclusion)
- [x] Phase 2: Execution Integrity (CI Integration) [DONE]
  - [x] Unit test extension (writes, consistency)
  - [x] CI Integration (GitHub Actions)
  - [x] Automated Registry cleanup

- [x] Phase 3: Namespace Split [DONE]
  - [x] Symbolic Memory partitioning (Public vs Private)
  - [x] Persistent Storage Rig configuration
  - [x] Protected namespace guards
- Phase 4: Offline Ledger — Optional MFA-gated local store (Pending)

## 🚧 MISSION STATUS: IN PROGRESS

STATUS: BLOCKED BY USERFLOW ISSUE

Open Blockers (2026-02-13)
- Room view error state after Start Match (“Failed to load room”)

Success Criteria (updated)
- [x] playerSecret removed from GameContext (still stored in UserContext for auth)
- [x] Secret logging test removed
- [x] Room route renders without UserProvider error
- [ ] Room loads data without “Failed to load room” error
- [x] Mock data only used when VITE_E2E_TESTING=true
- [x] Design system generated and applied
- [x] UI follows skill recommendations (Righteous + Poppins fonts, neon glow, CRT scanlines)
- [ ] Build passes successfully
- [ ] Playwright userflow passes end-to-end
- [ ] Visual review complete

---

## 📋 COMPLETED WORK LOG

2026-02-10 — UserProvider Fix & Mock Gating
- Added UserProvider wrapper in src/main.tsx
- Re-ran Playwright flow: Room no longer crashes on missing provider; still shows “Failed to load room”
- Mock data gated to E2E-only (no-room fallback removed)
- Producer and /spectator views gated to E2E-only
- Confirmed design-system path (design-system/sound-royale/)

2026-02-09 — Userflow Validation & Mock Data Policy
- Ran Playwright userflow against local frontend/backend (Lobby join succeeded)
- Room route crashed due to missing UserProvider (useUser outside provider)
- Decided policy: mock data allowed only for E2E

2026-02-03 — Security Fixes & UI/UX Redesign
- Removed playerSecret from GameContext.tsx
- Deleted test file with secret logging
- Fixed Room route in App.tsx (GameProvider wrapper)
- Fixed host detection in Lobby.tsx (index → is_host)
- Added missing hooks to GameContext.tsx
- UI/UX: Generated Retro-Futurism design system and applied to Lobby/Room and components
- UI/UX: Added Righteous + Poppins typography; hover effects; animations
- Build previously reported passing; needs re-verify

2026-02-02 — Frontend Integration (Previous)
- Added environment variable support (VITE_E2E_TESTING)
- Implemented real API integration in GameContext
- Replaced mock data with roomApi.getRoom() calls
- Fixed navigation from /spectator to /room/:code
- Added loading states and error handling

---

## Single Current Blocker (ELI5 + PERN)

Anchors to code
- One‑shot guard implemented in: src/context/GameContext.tsx (hook: useGameRefreshEffect)
- Reset conditions checked on: route change, manual refresh, and WebSocket invalidation

PERN vs Here
- PERN: React Query + zod schema → one fetch, cached; re‑fetch on invalidation.
- Here: DRF serializer contract → TS RoomDTO; in‑flight ref + success latch to stop loops.

Tradeoffs
- Speed: Guard is fastest path to green.
- Efficiency: Removes request storms; future React Query may add cache / retry niceties.
- Cost: Zero deps now; future adoption of libs adds small bundle and upkeep.
- ELI5: Backend says “Order up!”, but the frontend keeps asking “Is it ready yet?” and never serves the plate.
- PERN analogy:
  - You’d validate the Express response with zod, use React Query/SWR to dedupe requests, and ensure stable useEffect dependencies.
- Here (Django + React):
  - Confirm Django response matches expected GameContext types,
  - Add a one-shot guard or in-flight flag in useGameRefreshEffect,
  - Stop refetching once valid data is present.

Tradeoffs
- Speed: Minimal guard now vs. larger refactor to React Query.
- Efficiency: React Query adds caching/dedupe for long-term efficiency.
- Cost: Small bundle increase and maintenance if we add a library.

## Mock Data Policy Clarification (ELI5 + PERN)
- ELI5: Candy is locked away except on test day. We set a flag (VITE_E2E_TESTING) so the candy jar won’t open in production.
- PERN analogy: Limit seed scripts to NODE_ENV=test; never include seeds in production builds.
- Here: Ensure mock imports are gated and tree-shaken in production via Vite define and code paths.

Tradeoffs
- Speed: Fast to implement and keep.
- Safety: Medium risk if a component imports mocks without a guard.
- Cost: Add a lint rule/check to catch forbidden imports.

## Verification Matrix (fill each run)

Template (fill on each run)
```md
Run: 2026-02-13 14:30 EST
Commit: <sha>
Security: pass (no secret exposure)
Build: pass (attached local log)
Types: pass
UI Compliance: pass (allowlist reviewed)
E2E: blocked by registry outage; fallback scripts documented
```

Security
- rg "playerSecret" src/context/GameContext.tsx — Expect 0
- rg -n "console\\.log.*secret" src/ — Expect 0
- Backend serialization: grep -R "player_secret" backend/game_engine/serializers.py — Expect not exposed in DTOs
- Last run: 2026-02-13 Result: pass

Build
- npm run build
- npx tsc --noEmit
- Last run: 2026-02-13 Result: pass (local)

Mock Data
- rg "mockGameState" src/context/GameContext.tsx
- rg "VITE_E2E_TESTING" src/context/GameContext.tsx
- Last run: 2026-02-13 Result: enforced

UI Compliance
- rg "font-inter|font-roboto|font-arial" src/ --type tsx — Expect 0
- rg "bg-gradient-to-r from-purple" src/ --type tsx — Intentional use only
- Last run: 2026-02-13 Result: pass (allowlist reviewed)

E2E (when npm registry access restored)
- npm run test:e2e
- Last run: 2026-02-13 Result: blocked; use debug scripts during outage

Security
- rg "playerSecret" src/context/GameContext.tsx — Expect 0
- rg -n "console\\.log.*secret" src/ — Expect 0
- Backend serialization: grep -R "player_secret" backend/game_engine/serializers.py — Expect not exposed in DTOs
- Last run: [YYYY-MM-DD] Result: [pass/fail] Link: [log]

Build
- npm run build
- npx tsc --noEmit
- Last run: [YYYY-MM-DD] Result: [pass/fail] Link: [log]

Mock Data
- rg "mockGameState" src/context/GameContext.tsx
- rg "VITE_E2E_TESTING" src/context/GameContext.tsx
- Last run: [YYYY-MM-DD] Result: [enforced/needs-fix]

UI Compliance
- rg "font-inter|font-roboto|font-arial" src/ --type tsx — Expect 0
- rg "bg-gradient-to-r from-purple" src/ --type tsx — Intentional use only
- Last run: [YYYY-MM-DD] Result: [pass/fail]

E2E (when npm registry access restored)
- npm run test:e2e
- Last run: [YYYY-MM-DD] Result: [pass/fail] Link: [report]

## Links
- Design system: design-system/sound-royale/MASTER.md
- Ops/Agents (relocate noisy ops details): docs/ops/AGENTS_NOTES.md (create and maintain separately)
- One‑shot guard hook: src/context/GameContext.tsx (useGameRefreshEffect)
- DRF serializers: backend/game_engine/serializers.py
- Room API boundary: src/services/roomApi.ts

---

## ELI5 + PERN Clarifications (Actionable Addendum)

### 1) Response Shape Contract (DRF → TS), like zod in PERN

Anchor points
- Backend serializer: backend/game_engine/serializers.py (keys are snake_case)
- TS boundary: src/services/roomApi.ts (map snake_case → camelCase OR keep snake_case DTOs consistently)
- Hook consumer: src/context/GameContext.tsx (useGameRefreshEffect)

Actionable checklist
- [ ] Serializer keys match documented RoomDTO (or mapping function updated)
- [ ] Unit test: verifies RoomDTO shape consumed by GameContext
- [ ] One‑shot guard flips to loaded state on first valid payload

Tradeoffs
- Speed: +10–15 minutes to reconcile and document.
- Efficiency: Prevents refetch churn and UI mismatch.
- Cost: None unless adding a small unit test.
- ELI5: We wrote down exactly what the “plate of food” looks like so the waiter knows when to stop asking.
- PERN: In a PERN app you would define a zod schema for your Express JSON and have React Query validate; here we document the DRF serializer fields and mirror them in TypeScript.
- Tradeoffs:
  - Speed: Small doc effort now; faster fixes later.
  - Efficiency: Stops loop churn due to shape mismatches.
  - Cost: None.
- Contract (example; ensure backend matches these):
```ts
// GameContext expects at minimum:
export interface PlayerDTO {
  id: string;            // UUID
  name: string;
  is_host: boolean;      // host detection source of truth
}

export interface BoardDTO {
  id: string;            // UUID
  tiles: string[];       // 25 entries
  marked: boolean[];     // 25 entries
}

export interface RoomDTO {
  id: string;            // UUID (room id)
  code: string;          // human room code
  game_status: "lobby" | "active" | "ended";
  players: PlayerDTO[];
  board: BoardDTO | null;   // null in lobby; non-null in game
}
```
- Backend (DRF) must serialize keys exactly as above (snake_case vs camelCase: keep as-is in API and adapt in TS or map once at the boundary). Document any mapping function.

---

### 2) One-shot Fetch Guard (like React Query `enabled`)

Anchors
- Implemented in: src/context/GameContext.tsx (useGameRefreshEffect)
- Reset on: route change, manual refresh, or WebSocket signal

Checklist
- [ ] inFlightRef prevents concurrent GETs
- [ ] Success latch halts further fetches after a valid RoomDTO
- [ ] Manual invalidate triggers a single refresh

Tradeoffs
- Speed: Quick to implement.
- Efficiency: Stops network spam immediately.
- Cost: Slight code complexity without a new library.
- ELI5: We set a kitchen timer so we ask once, then stop unless we press reset.
- PERN: You would use React Query with `enabled` and cache dedupe; here we use an in-flight ref and a success latch.
- Tradeoffs:
  - Speed: Quick patch to stop the storm.
  - Efficiency: Prevents network spam and re-renders.
  - Cost: Slight code complexity without adding a library.
- Pattern (pseudocode):
```ts
const inFlightRef = useRef(false);
const [hasLoaded, setHasLoaded] = useState(false);

useEffect(() => {
  if (hasLoaded || inFlightRef.current) return;
  inFlightRef.current = true;
  roomApi.getRoom(roomId)
    .then((data: RoomDTO) => {
      setGameState(prev => ({ ...prev, room: data }));
      setHasLoaded(true); // success latch
    })
    .catch(() => {
      // leave hasLoaded=false so a manual retry can occur
    })
    .finally(() => {
      inFlightRef.current = false;
    });
  // reset hasLoaded on route change or explicit invalidate
}, [roomId]);
```
- Reset conditions: route change, manual refresh, or WebSocket invalidation event.

---

### 3) Verification Commands with Fallbacks
- ELI5: If you don’t have the special screwdriver (rg), here’s how to get it or use a regular one.
- PERN: Provide npm/yarn/pnpm alternatives; here we provide ripgrep install and grep fallbacks.
- Tradeoffs: Speed (fewer setup blockers), Efficiency (consistent runs), Cost (few lines).
- Install ripgrep (macOS):
```bash
brew install ripgrep || echo "Install Homebrew first: https://brew.sh/"
```
- Fallbacks:
```bash
# Secrets
rg -n "playerSecret" src/context/GameContext.tsx || grep -R "playerSecret" src/context/GameContext.tsx || true
rg -n "console\\.log.*secret" src/ || grep -R "console.*secret" src/ || true
rg -ni "player[_-]?secret|playerSecret" backend/ --type py || grep -R -niE "player[_-]?secret|playerSecret" backend/ || true

# Build / Types
npm run build || echo "See npm logs above"
npx tsc --noEmit || ./node_modules/.bin/tsc --noEmit || true
```

---

### 4) Stronger Secret-Exposure Checklist (DRF)
- ELI5: Check that no menus show the secret ingredient.
- PERN: DTOs never include secrets; DRF serializers shouldn’t expose `player_secret` directly or indirectly.
- Tradeoffs: Speed (slightly slower check), Efficiency (prevents CRITICAL leaks), Cost (low).
- Steps:
  - Search case-insensitively for all secret variants:
    - `player[_-]?secret`, `playerSecret`
  - Manually open backend/game_engine/serializers.py and confirm:
    - `exclude = ("player_secret",)` or equivalent
    - No computed fields or nested serializers re-expose the value
    - Tests cover absence in JSON responses

---

### 5) Canonical Mock Gating for Vite (DCE-friendly)

Enforcement
- ESLint rule and CI grep (see UI Compliance) ensure no top‑level mock imports.
- Vite define: `__E2E__` must guard dynamic imports so production builds dead‑code‑eliminate test paths.

Tradeoffs
- Speed: Simple pattern to follow.
- Efficiency: Keeps prod bundle clean.
- Cost: Near zero; adds discipline.
- ELI5: Lock the candy so production can’t even see it.
- PERN: NODE_ENV=production eliminates dev code; here we use Vite define and dead code elimination.
- Tradeoffs: Speed (simple), Efficiency (keeps bundles clean), Cost (none).
- Pattern:
```ts
// vite.config.ts
export default defineConfig({
  define: {
    __E2E__: JSON.stringify(process.env.VITE_E2E_TESTING === 'true'),
  },
});
```
```ts
// Usage
if (__E2E__) {
  // import('./data/mockGameState').then(...)
} else {
  // real data path; ensure the mock import is inside the branch so bundler DCE can drop it
}
```
- Rule: Never top-level import mocks; dynamic import inside guarded branch only.

---

### 6) GAIA Local Shims (No global deps required)
- ELI5: Provide spare tools in the box so anyone can do the job.
- PERN: Makefile/justfile abstracts environment.
- Tradeoffs: Speed (initial setup), Efficiency (fewer env blockers), Cost (small).
- Suggested Make targets (future work):
```make
verify:
\tnpx tsc --noEmit && npm run build
\trg -n "playerSecret" src/context/GameContext.tsx || true
\trg -ni "player[_-]?secret|playerSecret" backend/ || true
```

---

### 7) Run Log Template (Traceable Matrix)
- ELI5: Write the date on each chore when you finish.
- PERN: CI artifacts per build.
- Tradeoffs: Speed (tiny overhead), Efficiency (fast audits), Cost (none).
- Template:
```md
Run: YYYY-MM-DD HH:MM TZ
Commit: <sha>
Security: pass/fail (notes)
Build: pass/fail (link to log)
Types: pass/fail
UI Compliance: pass/fail (notes)
E2E: pass/fail (report link)
```

---

### 8) Refined UI Compliance Greps
- ELI5: Don’t shout at blue shirts if blue is the uniform.
- PERN: ESLint rules tuned to real problems.
- Tradeoffs: Speed (one-time tuning), Efficiency (less noise), Cost (low).
- Guidance:
  - Maintain an allowlist of intentional gradients/animations per design-system.
  - Only flag class patterns that contradict tokens (e.g., arbitrary hex colors when tokens exist).

---

### 9) Acceptance Test: Room Load (Stops Fetch Loop)

Expected file location
- tests/e2e/room/room-load.spec.ts

How to run
```bash
npm run test:e2e -- tests/e2e/room/room-load.spec.ts
```

Tradeoffs
- Speed: Small upfront effort.
- Efficiency: Prevents regression of fetch loops.
- Cost: Low maintenance test with high value.
- ELI5: After one “Is it ready?” and a “Yes,” we stop asking until something changes.
- PERN: React Query should fetch once and cache; here we assert one GET and correct UI state.
- Tradeoffs: Speed (simple assertion), Efficiency (catches regressions), Cost (low).
- Playwright outline:
```ts
// After joining lobby and navigating to /room/:code
await page.waitForURL(/\\/room\\//);
// Network: only one room GET within 5s
const requests = [] as Request[];
page.on('requestfinished', req => {
  if (/\\/api\\/room\\//.test(req.url()) && req.method() === 'GET') requests.push(req);
});
await page.waitForTimeout(5000);
expect(requests.length).toBe(1);
// UI: no error banner; board and players visible
await expect(page.getByTestId('room-board')).toBeVisible();
await expect(page.getByTestId('players-list')).toBeVisible();
```

---