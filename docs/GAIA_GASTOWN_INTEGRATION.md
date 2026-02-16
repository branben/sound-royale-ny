# GAIA Integration for Gas Town

## Overview

GAIA (Generative AI Architecture) is a security-hardened AI coding agent that integrates with Gas Town as a polecat worker. It uses **Serena** MCP for symbolic code references and implements **path integrity guards** to prevent unauthorized file access.

## Architecture

```
You → Mayor (gt mayor) → assigns work → GAIA Polecat
                                      ↓
                              Uses Serena MCP tool
                                      ↓
                              Creates symbolic beads
                                      ↓
                              Enforces path integrity guards
                                      ↓
                              Works on task
```

## Components

### 1. Path Integrity Guards (`guards_adapter.py`)

Prevents GAIA from accessing secrets outside the project root.

```python
from backend.gaia.guards_adapter import evaluate_path_request

# GAIA checks every path access
decision = evaluate_path_request(
    repo_root="/path/to/project",
    target_path="src/components/Game.tsx"
)
if not decision.allowed:
    # Access denied - log reason
    print(f"DENIED: {decision.reason}")
```

**Security Features:**
- Denies access to `.env`, `*.key`, `*.pem`, `*.crt`, etc.
- Blocks path traversal attacks (`../../etc/passwd`)
- Respects `.beadsignore` patterns
- Windows drive-letter protection

### 2. Integrity Scanner (`integrity_scanner.py`)

CI-integrated scanner that validates path integrity in pipelines.

```bash
python backend/gaia/integrity_scanner.py --ci --json
```

### 3. Serena MCP Integration

Symbolic code references for AI context:

```
GAIA: Find the GameContext definition
Serena: Found at src/context/GameContext.tsx:GameContext
GAIA: Create a bead pointing to this symbol
```

## Setup

### Step 1: Add GAIA Guards to Your Project

```bash
# Copy GAIA guard files to your project
cp -r backend/gaia/ /your-project/backend/
```

### Step 2: Configure .beadsignore

```gitignore
# .beadsignore - GAIA exclusion patterns
/.gaia_private/
/private/
/experimental/
/.env
/*.key
/*.pem
/node_modules/
/dist/
```

### Step 3: Add to Gas Town Rig

```bash
cd ~/gt
gt rig add yourproject https://github.com/you/project

# Configure GAIA as agent
gt config agent set gaia "opencode"
```

### Step 4: Configure MCP for Serena

Add to your rig's CLAUDE.md or Codex config:

```toml
[mcp_servers.serena]
command = "uvx"
args = ["--from", "git+https://github.com/oraios/serena", "serena", "start-mcp-server", "--context", "codex"]
```

## Usage

### Starting a GAIA Polecat

```bash
# Create a bead for the work
bd create "Add player scoring feature"

# Sling to GAIA polecat
gt sling <bead-id> yourproject --agent gaia
```

### GAIA Workflow

1. **Receive task** from Mayor via bead
2. **Check path integrity** using guards_adapter
3. **Find symbols** using Serena MCP
4. **Create symbolic beads** documenting the work
5. **Report completion** back to convoy

## Example: Security-Hardened Polecat

```python
# guards_adapter.py - Path integrity enforcement

SECRET_GLOBS = [
    ".env",
    ".env.*",
    "*.pem",
    "*.key",
    "*.crt",
    "*.cer",
    "*.p12",
    "*.pfx",
    "*.asc",
    "id_*",
    ".ssh",
    ".aws",
    ".gaia_private",
    ".gaia_private/*",
]

def evaluate_path_request(repo_root, target_path, op="read"):
    # 1. Block path traversal
    if ".." in Path(target_path).parts:
        return Decision(allowed=False, reason="DENY_OUTSIDE_ROOT")
    
    # 2. Resolve and check in-root
    target_resolved = (root / target_path).resolve()
    if not _is_within(target_resolved, root):
        return Decision(allowed=False, reason="DENY_OUTSIDE_ROOT")
    
    # 3. Check secret patterns
    if _matches_any_glob(target_resolved, SECRET_GLOBS, root):
        return Decision(allowed=False, reason="DENY_SECRET_PATTERN")
    
    return Decision(allowed=True, reason="ALLOW")
```

## CI Integration

```yaml
# .github/workflows/gaia-guards.yml
name: GAIA Guards CI

on: [pull_request, push]

jobs:
  integrity:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Run GAIA Integrity Scanner
        run: |
          python backend/gaia/integrity_scanner.py --ci --json > report.json
      
      - name: Fail on violations
        if: contains(fromJson(steps.scan.outputs.result), 'violations')
        run: exit 1
```

## Benefits

1. **Security**: GAIA cannot accidentally expose secrets
2. **Symbolic Memory**: Serena provides exact code references
3. **Git-backed**: All beads persist in version control
4. **Multi-agent**: Works alongside other Gas Town agents

## Files

- `backend/gaia/guards_adapter.py` - Path integrity enforcement
- `backend/gaia/integrity_scanner.py` - CI scanner
- `.beadsignore` - Exclusion patterns
- `.github/workflows/gaia-guards-ci.yml` - CI integration

## License

MIT
