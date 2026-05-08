# GAIA Polecat - AI-Assisted Development

This project uses **GAIA polecat** for AI-assisted development automation.

## Overview

GAIA polecat combines:
- **Gas Town** patterns (polecats, hooks, beads)
- **CocoIndex Code** for semantic codebase discovery
- **Serena MCP** for symbolic code navigation
- **Symbolic memory** via extended bead schema

## How It Works

```
gaia-polecat (Python orchestrator)
    │
    ├── Stores local/private state in .gaia_private/gaia/
    ├── Loads curated skills from .gaia_skills/**/SKILL.md
    ├── Uses CocoIndex Code (`ccc search`) for semantic discovery
    ├── Compiles a minimal task contract (local-first optional)
    ├── Passes the contract to a provider (opencode/ollama/codex)
    │
    └── Provider verifies with rg + Serena MCP tools:
        ├── rg                         → exact strings, anti-patterns, secret scans
        ├── serena.find_symbol()     → exact code location
        ├── serena.get_symbols_overview() → file structure
        ├── serena.replace_symbol_body() → safe edits
        │
    └── Creates new bead documenting work
```

## Components

| Component | Role |
|-----------|------|
| [Gas Town](https://github.com/steveyegge/gastown) | Multi-agent orchestration patterns |
| CocoIndex Code (`ccc`) | Semantic discovery across code, tests, docs, and GAIA workflow files |
| [Serena MCP](https://github.com/oraios/serena) | Symbolic code navigation via LSP |
| `.gaia_private/` | Private polecat state + bead outputs (git-ignored) |
| `scripts/gaia-polecat.py` | Repo-local canonical runner |
| `.gaia_skills/` | AI development skills & PR error test suite |

## GAIA Skills Framework

| Skill | Description |
|-------|-------------|
| `systematic-debugging` | Root cause analysis before fixing bugs |
| `test-driven-development` | Red-green-refactor methodology |
| `verification-before-completion` | Evidence-based completion claims |
| `rating-system` | Evaluating GAIA's contribution |

## Usage

```bash
# Run a task via GAIA polecat (repo-local runner)
python scripts/gaia-polecat.py "Add a comment to GameContext.tsx"

# The polecat uses these MCP tools:
# - CocoIndex Code: semantic codebase discovery
# - Serena: Symbolic code navigation
# - Linear: Issue tracking
# - Context7: Documentation lookup
# - Qodo: Code review feedback
```

## Discovery Guardrail

Agents must use this order when the task touches unfamiliar code:

1. `ccc status`; if stale or missing, run `ccc index`
2. `ccc search "<concept>"` to identify likely files
3. `rg "<exact string>"` for exact checks and security/test guardrails
4. Serena MCP or direct file reads for exact symbol locations before edits

CocoIndex narrows the search space. It does not authorize edits by itself.

## Quick Reference

| Command | Description |
|---------|-------------|
| `python scripts/gaia-polecat.py "task"` | Run GAIA task via repo-local runner |
| `gaia-polecat "task"` | Run via convenience wrapper (forwards to repo-local runner) |
| `gaia-polecat --list-queue` | Show queued tasks |
| `gaia-polecat "task" --queue` | Add task to queue |
| `gaia-polecat --run-queue` | Run queued tasks |
| `ccc status` | Check CocoIndex project index health |
| `ccc index` | Refresh semantic index |
| `ccc search "<concept>"` | Semantic codebase discovery |

## Prerequisites

1. **Codex** - `brew install codex` or use web interface
2. **CocoIndex Code** - `uv tool install --upgrade 'cocoindex-code[full]'`
3. **Serena MCP** - Already configured in Codex
4. **Linear MCP** - Run `codex mcp login linear`
5. **Gas Town** - `gt` CLI for mail/roles

## References

- [Gastown Issue #1061](https://github.com/steveyegge/gastown/issues/1061) - The core pain point (specs/knowledge layer)
- [Gastown PR #212](https://github.com/steveyegge/gastown/pull/212) - Gas Town Web GUI (related polecat UI)
- [Serena](https://github.com/oraios/serena) - Symbolic code intelligence
