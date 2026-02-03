# SOUND ROYALE - AGENTIC PROTOCOLS

## 🎭 THE ROLES
- **MANAGER (Plan Agent):** High-level architect. Uses `qodo`. Responsibilities: Problem diagnosis, dependency mapping, and updating `docs/CURRENT_PLAN.md`.
- **BUILDER (Build Agent/Sisyphus):** The implementer. Reads the plan and executes code changes.
- **EXECUTOR (Goose):** The "hands." Triggered by the Builder for heavy-duty tasks (multi-file refactors, environment setup, long test runs).

## 🛠 MCP TOOLSET STRATEGY
| Tool | Primary Use Case |
| :--- | :--- |
| **qodo-open-aware** | Semantic search. Use this FIRST to find where logic "lives." |
| **serena** | Symbol definition. Use this to get exact function signatures/interfaces. |
| **sequential-thinking** | Complex problem decomposition. Use for multi-step reasoning and planning. |
| **goose** | Complex Execution. Delegate to Goose for multi-file edits or E2E test runs. |

## 🔄 THE GOLDEN LOOP (WORKFLOW)
1. **PLAN:** Manager analyzes the issue and writes/updates `docs/CURRENT_PLAN.md`.
2. **RESET:** User runs `/new` to clear context and prevent "Agent Drift."
3. **BUILD:** Builder (Sisyphus) reads the plan. 
4. **DELEGATE:** Builder uses `goose` for heavy lifting (e.g., "Goose, implement the changes in the plan").
5. **VERIFY:** Run `npm run test:e2e` or `python manage.py test`.
6. **CLOSE:** Update plan status to `[x] DONE` and document any side effects.

## ⚠️ ANTI-PATTERNS (DO NOT DO)
- **No Guessing:** If a variable isn't in `CLAUDE.md`, use `serena` or `qodo` to find it.
- **No Direct Mutation:** Frontend state must always use `setGameState` with functional updates.
- **No Secret Exposure:** Never allow `playerSecret` to be logged or returned in API responses.
- **No Plan-less Coding:** Never edit code without an entry in `CURRENT_PLAN.md`.

## 🚀 COMMAND CHEATSHEET
- Frontend: `npm run dev` | `npm run test:e2e`
- Backend: `python manage.py runserver` | `python manage.py test`
- Global: `oo` (OhMyOpenCode) | `goose info`