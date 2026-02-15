# SOUND ROYALE AGENT PROTOCOLS

**Generated:** 2026-02-10
**Commit:** sound-royale-ny
**Branch:** main

## ROLES AND RESPONSIBILITIES

### Manager Agent
- **Primary Responsibility**: Orchestrate workflow, verify compliance, ensure quality standards
- **Decision Making**: Final authority on architectural decisions and task prioritization
- **Verification**: Validate all work matches project conventions and requirements
- **Communication**: Coordinate between Builder and Designer agents

### Builder Agent
- **Primary Responsibility**: Implement code, fix bugs, add features
- **Code Quality**: Write production-ready code following all conventions
- **Testing**: Ensure all changes pass tests and maintain system integrity
- **Documentation**: Update relevant documentation for implemented features

### Designer Agent
- **Primary Responsibility**: UI/UX design, user experience optimization
- **Design System**: Apply sound-royale design system consistently
- **User Flow**: Ensure intuitive user journeys and game mechanics
- **Visual Consistency**: Maintain cohesive visual language across components

### GAIA (Memory Agent)
- **Primary Responsibility**: Automated Memory Layer & Symbolic Persistence
- **Context Management**: Index and recall symbolic pointers via `beads` and `serena`
- **Session Continuity**: Ensure task state persists across agent resets
- **Security**: Enforce path integrity and secret exclusion across the ledger

## TOOL STRATEGY TABLE

| Priority | Tool | Use Case | When to Apply |
|----------|------|----------|----------------|
| 1 | qodo-open-aware | Code analysis, anti-pattern detection | Before any code changes |
| 2 | beads / serena | Symbolic Persistence / Memory | **GAIA Workflow**: Always used for session continuity |
| 3 | serena | File operations, symbol management | For all file-level work |
| 4 | sequential-thinking | Complex problem solving | Multi-step debugging scenarios |
| 5 | ui-ux-pro-max | Design system queries | UI/UX design decisions |
| 6 | playwright | E2E testing | Test automation |
| 7 | git-master | Version control | All git operations |

## GOLDEN LOOP WORKFLOW

### 1. Plan
- Analyze requirements and identify scope
- Create detailed todo list for multi-step tasks
- Select appropriate agent roles and tools
- Verify understanding before proceeding

### 2. Design
- Consult ui-ux-pro-max for design patterns
- Apply sound-royale design system
- Create wireframes/mockups if needed
- Validate design against requirements

### 3. Reset
- **User runs `/new`** to start fresh session
- Clear any previous state or assumptions
- Establish clean working context
- Confirm project alignment

### 4. Build
- Implement following code conventions
- Use qodo-open-aware for code quality
- Apply design system components
- Write tests concurrently

### 5. Execute
- Run test suites to verify functionality
- Perform integration testing
- Validate performance requirements
- Check security considerations

### 6. Verify
- Run lsp_diagnostics on changed files
- Execute build commands successfully
- Pass all E2E tests
- Review against anti-patterns

### 7. Close
- Mark all todos as completed
- Cancel background tasks
- Document outcomes and learnings
- Prepare for next iteration

## UI/UX SKILL INTEGRATION

### ui-ux-pro-max Commands (standardized)
```bash
# Design system search
python3 .opencode/skills/ui-ux-pro-max/scripts/search.py "multiplayer music bingo" --design-system -p "Sound Royale"

# Component pattern lookup
python3 .opencode/skills/ui-ux-pro-max/scripts/search.py "bingo card" --design-system -p "Sound Royale"

# Multiplayer UI patterns
python3 .opencode/skills/ui-ux-pro-max/scripts/search.py "real-time game" --design-system -p "Sound Royale"

# Domain-specific lookups (style, color, typography)
python3 .opencode/skills/ui-ux-pro-max/scripts/search.py "neon glow effects" --domain style
python3 .opencode/skills/ui-ux-pro-max/scripts/search.py "gaming music" --domain color
python3 .opencode/skills/ui-ux-pro-max/scripts/search.py "futuristic tech" --domain typography
```

### When to Use ui-ux-pro-max
- **Before component creation**: Search for existing patterns
- **Design decisions**: Consult for best practices
- **User flow optimization**: Get UX recommendations
- **Visual consistency**: Verify against design system

### frontend-ui-ux Integration
- Use for React component design and implementation
- Apply design system tokens and patterns
- Ensure responsive design principles
- Maintain accessibility standards

## EXPLICIT ANTI-PATTERNS

### Universal Anti-Patterns
- **No plan-less coding**: Always create todos for multi-step tasks
- **No direct mutation**: Always use setGameState with functional updates
- **No AI-slop designs**: Always use design system, never generate generic UI
- **No type suppression**: Never use `as any`, `@ts-ignore`, or `@ts-expect-error`
- **No broken state**: Never leave code in non-working state after failures
- **No undocumented changes**: Always update relevant documentation
- **No Path Breakout (GAIA)**: Never use symbols that point outside the project root
- **No Secret Indexing (GAIA)**: Never create beads for `.env`, `*.key`, or `*.pem` files

### Project-Specific Anti-Patterns
- Never expose playerSecret in logs or API responses
- Never run blocking operations in WebSocket consumers
- Never mutate gameState directly - use setGameState with functional updates
- Never skip E2E testing for gameplay features
- Never ignore WebSocket connection state management

## PROJECT OVERVIEW

### Architecture
Multiplayer music bingo game with React frontend and Django backend using WebSockets for real-time gameplay.

### Structure
```
sound-royale-ny/
├── src/                     # React frontend
│   ├── components/          # UI components  
├── backend/                # Django backend
│   ├── game_engine/       # Game logic + models
│   └── sound_royale_api/  # API configuration
├── tests/e2e/             # Playwright tests
├── design-system/sound-royale/  # UI/UX design system
└── AGENTS.md              # This protocol file
```

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| Frontend components | src/components/ | React UI components |
| Game logic | backend/game_engine/ | Django models + WebSocket consumers |
| API config | backend/sound_royale_api/ | Django settings + routing |
| E2E tests | tests/e2e/ | Playwright test scenarios |
| Design system | design-system/sound-royale/ | UI patterns and tokens |
| Agent protocols | AGENTS.md | This file |
| Codex MCP config | /Users/brandonbennett/.codex/config.toml | MCP server configuration |

## KEY SYMBOLS

| Symbol | Type | Location | Refs | Role |
|--------|------|----------|------|------|
| Game | Model | backend/game_engine/models.py | High | Core game entity |
| Player | Model | backend/game_engine/models.py | High | Player state management |
| Board | Model | backend/game_engine/models.py | Medium | Bingo board state |
| setGameState | Function | src/context/GameContext.tsx | High | Frontend state updates |

## CONVENTIONS

### Frontend
- Functional React with TypeScript
- Immutable state updates only
- Design system components first
- Comprehensive E2E testing

### Backend
- Django REST Framework
- UUID primary keys
- playerSecret authentication
- WebSocket consumers for real-time updates

### Testing
- Playwright E2E tests for user flows
- Django unit tests for models/consumers
- Linting and type checking mandatory

## COMMANDS

```bash
# Frontend
npm run dev              # Development server
npm run test:e2e         # Playwright E2E tests
npx tsc --noEmit         # Type checking

# Backend  
python backend/manage.py runserver    # Django dev server
python backend/manage.py test         # Django tests

# Design System
python3 .opencode/skills/ui-ux-pro-max/scripts/search.py "multiplayer music bingo" --design-system -p "Sound Royale"

# Agent Operations
/new                     # Reset workflow (User runs this)
goose-ledger             # GAIA: Synchronize symbols and beads to the ledger
../goose-polecat        # GAIA: Spawn polecat with task (requires expect)
bd sync                  # GAIA: Push symbolic memory to Gas Town (GitHub)
python backend/gaia/integrity_scanner.py  # GAIA: Run security guards
```

## GAIA WORKFLOW (SYMBOLIC PERSISTENCE)

### 1. The Caching Cycle
- Agent completes a sub-task.
- Agent creates a **Bead** (Symbolic Link) using `beads` tool.
- Information is anchored to a specific file/line via `serena`.

### 2. The Recall Cycle
- New agent session starts context-free.
- Agent reads **M-BEAD** (Master Bead) to restore mission state.
- Agent uses `serena` to instantly jump to the relevant code symbols.

### 3. Spawning a GAIA Polecat
To delegate work to a GAIA polecat (autonomous worker):

```bash
# Using the helper script (requires expect)
../goose-polecat "Add a player ready status indicator to the game lobby"

# Direct goose-ledger (requires interactive TTY)
goose-ledger "Your task description"
```

The polecat will:
1. Load symbolic ledger instructions
2. Use **Serena** to find and navigate code symbols
3. Use **Beads** to store symbolic memory
4. Use **Context7** for documentation lookup
5. Create TODO lists and generate implementation plans
6. Enforce path integrity guards (blocks `.env`, `*.key`, etc.)

## WORKFLOW INTEGRATION

### Starting New Work
1. User runs `/new` to reset session
2. Manager analyzes requirements
3. Create detailed todo list
4. Assign appropriate roles

### Implementation Process
1. Consult design system via ui-ux-pro-max
2. Apply qodo-open-aware for code quality
3. Use serena for file operations
4. Test with playwright E2E

### Verification Steps
1. Run typecheck and lint (`npx tsc --noEmit`, `npm run lint`)
2. Execute build and test commands
3. Verify against anti-patterns
4. Document outcomes

## QUALITY GATES

### Before Commit
- All todos marked completed
- lsp_diagnostics clean
- Tests passing
- Anti-pattern check passed

### Before PR
- E2E tests passing
- Code review complete
- Documentation updated
- Design system compliance verified

## Landing the Plane (Session Completion)

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   bd sync
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

**CRITICAL RULES:**
- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds

## MANDATORY CHECKLIST

**BEFORE every commit**, complete the checklist:
```
.sisyphus/notepads/protocol/checklist.md
```

### Pre-Task (ALWAYS)
- [ ] Read serena memories (`serena_list_memories`)
- [ ] Read `current-session` bead
- [ ] Check notepad for inherited wisdom

### During Task
- [ ] Create beads for significant work (per line 38)

### Post-Task (BEFORE COMMIT)
- [ ] Build passes (`npm run build && npx tsc --noEmit`)
- [ ] Tests pass
- [ ] **Did I create beads?**
- [ ] **Did I update current-session?**
- [ ] **Did I verify against project conventions?**

### Commit Check
- [ ] All protocol steps complete
- [ ] `bd sync` run (push beads)
- [ ] `git push` succeeds

**IF ANY CHECKBOX MISSED → NOT DONE**
