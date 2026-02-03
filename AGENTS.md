# SOUND ROYALE - AGENTIC PROTOCOLS

## 🎭 THE ROLES
- **MANAGER (Plan Agent):** High-level architect. Uses `qodo`. Responsibilities: Problem diagnosis, dependency mapping, and updating `docs/CURRENT_PLAN.md`.
- **BUILDER (Build Agent/Sisyphus):** The implementer. Reads the plan and executes code changes.
- **DESIGNER (UI/UX Agent):** The aesthetic director. Uses `ui-ux-pro-max` skill. Responsibilities: Design system generation, visual consistency, preventing "AI slop".

## 🛠 MCP TOOLSET STRATEGY
| Tool | Primary Use Case |
| :--- | :--- |
| **qodo-open-aware** | Semantic search. Use this FIRST to find where logic "lives." |
| **serena** | Symbol definition. Use this to get exact function signatures/interfaces. |
| **sequential-thinking** | Complex problem decomposition. Use for multi-step reasoning and planning. |
| **skill: ui-ux-pro-max** | **Design system generation.** Use for UI/UX work to prevent generic styling. |
| **skill: frontend-ui-ux** | **Creative direction.** Use for aesthetic decisions and anti-pattern prevention. |
| **bash** | Command execution for E2E tests, design system generation. |
| **edit** | Multi-file code changes. |

## 🔄 THE GOLDEN LOOP (WORKFLOW)
1. **PLAN:** Manager analyzes the issue and writes/updates `docs/CURRENT_PLAN.md`.
2. **DESIGN:** Designer generates design system using `ui-ux-pro-max` skill (for UI tasks).
3. **RESET:** User runs `/new` to clear context and prevent "Agent Drift."
4. **BUILD:** Builder (Sisyphus) reads the plan and design system.
5. **EXECUTE:** Builder uses `bash`, `edit`, and MCP tools for implementation.
6. **VERIFY:** Run `npm run test:e2e` or `python manage.py test`.
7. **CLOSE:** Update plan status to `[x] DONE` and document any side effects.

## 🎨 UI/UX SKILL INTEGRATION

### **Skill: ui-ux-pro-max** (INSTALLED)
**Location**: `.opencode/skills/ui-ux-pro-max/`

**When to Use**:
- Building new UI components or pages
- Choosing color palettes and typography
- Reviewing code for UX issues
- Preventing "AI slop" (generic purple gradients, Inter font, etc.)

**Workflow**:
```bash
# Step 1: Generate Design System (REQUIRED before UI work)
python3 .opencode/skills/ui-ux-pro-max/scripts/search.py \
  "<product_type> <industry> <keywords>" \
  --design-system \
  -p "Project Name"

# Step 2: Persist for hierarchical retrieval (OPTIONAL)
python3 .opencode/skills/ui-ux-pro-max/scripts/search.py \
  "<query>" \
  --design-system \
  --persist \
  -p "Project Name"

# Step 3: Domain-specific searches (as needed)
python3 .opencode/skills/ui-ux-pro-max/scripts/search.py \
  "<keyword>" \
  --domain <domain> \
  [-n <max_results>]
```

**Example for Sound Royale**:
```bash
python3 .opencode/skills/ui-ux-pro-max/scripts/search.py \
  "multiplayer music bingo game social gaming" \
  --design-system \
  -p "Sound Royale"
```

**Available Domains**:
- `product` - Product type recommendations
- `style` - UI styles (67 available: Glassmorphism, Brutalism, etc.)
- `color` - Color palettes (96 available)
- `typography` - Font pairings (57 available)
- `landing` - Page structure patterns
- `chart` - Chart types for dashboards
- `ux` - UX best practices and anti-patterns

### **Skill: frontend-ui-ux** (BUILT-IN)
**When to Use**: Creative direction, aesthetic decisions, anti-pattern prevention.

**Anti-Patterns to Avoid** (from skill):
- ❌ Generic fonts: Inter, Roboto, Arial, Space Grotesk
- ❌ Cliched colors: Purple gradients on white ("AI slop")
- ❌ Predictable layouts and component patterns
- ❌ Cookie-cutter design lacking context-specific character

## ⚠️ ANTI-PATTERNS (DO NOT DO)
- **No Guessing:** If a variable isn't in `CLAUDE.md`, use `serena` or `qodo` to find it.
- **No Direct Mutation:** Frontend state must always use `setGameState` with functional updates.
- **No Secret Exposure:** Never allow `playerSecret` to be logged or returned in API responses.
- **No Plan-less Coding:** Never edit code without an entry in `CURRENT_PLAN.md`.
- **No AI-Slop UI:** Never use generic styling (purple gradients, Inter font, predictable layouts). Always generate design system first.

## 🚀 COMMAND CHEATSHEET

### Development
- **Frontend**: `npm run dev` | `npm run test:e2e`
- **Backend**: `python manage.py runserver` | `python manage.py test`
- **Typecheck**: `npx tsc --noEmit`
- **Verify Symbols**: `serena-slim`

### Design System
- **Generate**: `python3 .opencode/skills/ui-ux-pro-max/scripts/search.py "<query>" --design-system -p "Project"`
- **Persist**: Add `--persist` flag for hierarchical retrieval
- **Domain search**: Add `--domain <name>` for specific areas

### Skills
- **Load**: `skill(name="frontend-ui-ux")`
- **Check available**: `skill(name="<skill-name>")` then review output
