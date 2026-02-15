# Sound Royale 🎹

> The High-Stakes Game Show for Music Producers.
> Built with React + TypeScript + Django (PERN-like client patterns with a Python backend).

---

## GAIA Polecat - Symbolic Memory Architecture

This project implements a **GAIA polecat** that combines:
- **Gas Town** patterns (polecats, hooks, beads)
- **Serena MCP** for symbolic code navigation
- **Symbolic memory** via extended bead schema

### The Pain Point

Based on [Gastown Issue #1061](https://github.com/steveyegge/gastown/issues/1061): *"From Task Orchestration to Systems Engineering"*

> **Beads tracks tasks. Git tracks code. Nothing tracks specs.**

The problem: Every time an AI agent starts a session, it has to re-explore the codebase, re-learn patterns, and re-discover architecture. Context doesn't persist.

### My Solution

GAIA polecat uses **symbolic memory** - beads that store not just descriptions, but **Serena symbol references**:

```json
{
  "id": "sound-royale-ny-xxx",
  "title": "Game State Management Pattern",
  "description": "GameContext manages game state using React Context",
  "symbols": [
    {"name": "GameContext", "path": "src/context/GameContext.tsx", "line": 42},
    {"name": "setGameState", "path": "src/context/GameContext.tsx", "line": 89}
  ]
}
```

### How It Works

```
gaia-polecat (Python orchestrator)
    │
    ├── Reads beads from .beads/issues.jsonl
    ├── Finds relevant beads (keyword matching)
    ├── Passes context to Codex (via codex exec)
    │
    └── Codex uses Serena MCP tools:
        ├── serena.find_symbol()     → exact code location
        ├── serena.get_symbols_overview() → file structure
        ├── serena.replace_symbol_body() → safe edits
        │
    └── Creates new bead documenting work
```

### Components

| Component | Role |
|-----------|------|
| [Gas Town](https://github.com/steveyegge/gastown) | Multi-agent orchestration patterns |
| [Serena MCP](https://github.com/oraios/serena) | Symbolic code navigation via LSP |
| `.beads/issues.jsonl` | Public symbolic memory (git-tracked) |
| `.gaia_private/` | Private polecat state (git-ignored) |
| `gaia-polecat` | Python orchestrator script |

### Usage (with Codex + Serena MCP)

```bash
# Run a task via GAIA polecat (uses Codex + Serena MCP)
../gaia-polecat "Add a comment to GameContext.tsx"

# The polecat uses Codex with these MCP tools:
# - Serena: Symbolic code navigation
# - Linear: Issue tracking
# - Context7: Documentation lookup
# - Qodo: Code review feedback
```

### Quick Reference

| Command | Description |
|---------|-------------|
| `../gaia-polecat "task"` | Run Codex to execute task |
| `gt mail send sound_royale_ny/mayor -s "Subject" -m "Body"` | Notify Gas Town mayor |
| `codex exec --dangerously-bypass-approvals-and-sandbox "task"` | Direct Codex execution |

### Prerequisites

1. **Codex** - `brew install codex` or use web interface
2. **Serena MCP** - Already configured in Codex
3. **Linear MCP** - Run `codex mcp login linear`
4. **Gas Town** - `gt` CLI for mail/roles

### References

- [Gastown Issue #1061](https://github.com/steveyegge/gastown/issues/1061) - The core pain point (specs/knowledge layer)
- [Gastown PR #212](https://github.com/steveyegge/gastown/pull/212) - Gas Town Web GUI (related polecat UI)
- [Serena](https://github.com/oraios/serena) - Symbolic code intelligence

---

## System Evolution: Before vs After GAIA

This project has evolved from a **simple music game** to an **AI-enhanced development platform**. Here's how the system has changed:

### Before GAIA (Original System)

```
Sound Royale (v1)
├── Manual coding workflow
├── Standard git commits only
├── No AI assistance during development
├── Basic README with game features
├── Security: Minimal (no path guards)
└── Issue tracking: External (Linear/GitHub Issues)
```

**Characteristics:**
- Traditional development workflow
- Context lost between AI sessions
- Manual code review via GitHub PRs
- No symbolic memory persistence

### After GAIA (Current System)

```
Sound Royale + GAIA (v2)
├── GAIA polecat: Automated task execution
├── Beads: Symbolic memory persistence
├── Qodo feedback loop: Automated code review → bead creation
├── Security guards: Path integrity, secret exclusion
├── Serena MCP: Exact code locations without searching
└── Session continuity via M-beads
```

**New Capabilities:**
| Capability | Old System | New System (GAIA) |
|------------|------------|-------------------|
| **Memory** | Lost between sessions | Beads persist across sessions |
| **Code Navigation** | Grep/search | `serena.find_symbol()` → exact line |
| **Code Review** | Manual PR review | Qodo bot → auto-bead → polecat fix |
| **Security** | None | Path guards, secret exclusion |
| **Session Continuity** | Start fresh each time | M-bead carries context |
| **Task Tracking** | Git commits | Beads with symbol refs |

### Qodo Feedback → Fix Flow

The key new capability is **automated code review response**:

```
1. Qodo bot comments on PR
   ↓
2. qodo-feedback-loop.sh detects comment
   ↓
3. Creates bead with file/line refs (PR #5 example)
   ↓
4. Optional: Spawns polecat to fix
   ↓
5. Fix applied, committed to git
```

**Recent fixes from Qodo feedback (PR #5):**
- `.beadsignore`: Removed duplicate `.aws/`, redundant `.ssh/*`
- `gaia-guards-ci.yml`: Fixed TS_FILES array with `readarray`
- `guards_adapter.py`: Added `.expanduser()` before path resolution

---

## QODO Test (Branch-specific)

This branch includes intentional anti-patterns to exercise QODO:
- Direct state mutations (frontend)
- PlayerSecret exposure (logs)
- Direct context usage instead of hooks
- Missing error handling

Expected QODO feedback:
- Flag anti-patterns and suggest immutable updates
- Identify secret exposure risks
- Recommend React/Django best practices

Tradeoffs: Keeping test antipatterns visible speeds tooling evaluation but can confuse new devs; we isolate these in test files and CI gates to limit impact.

