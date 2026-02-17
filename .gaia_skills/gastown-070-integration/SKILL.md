---
name: gastown-070-integration
description: Gas Town 0.7.0 features for GAIA polecat. Use for configuring GAIA workflows with ownership, merge strategies, and agent resilience patterns.
---

# Gas Town 0.7.0 Integration

> Enhancing GAIA with Gastown 0.7.0 features: Convoy Ownership, Merge Strategies, Agent Factory, and Checkpoint Resilience.

## Overview

Gas Town 0.7.0 introduced several features critical for GAIA polecat operations:

1. **Convoy Ownership** - Own work units to prevent context theft
2. **Merge Strategies** - Control how bead commits merge
3. **Agent Factory** - Data-driven preset registry
4. **Checkpoint Resilience** - Recovery from session death

---

## 1. Convoy Ownership (`--owned`)

### Purpose

GAIA polecats should own their work units to prevent other agents from stealing context or interfering with ongoing work.

### Usage

```bash
# Create owned convoy for GAIA work
gt convoy create --owned --title "GAIA: Fix TypeScript errors"

# Or with sling
gt sling --owned --merge local "Fix the auth middleware"
```

### Benefits

- **Context Isolation**: Other agents cannot see GAIA's in-progress work
- **Faster Dispatch**: Owned convoys skip witness/refinery registration
- **Clean Lifecycle**: `gt convoy land` for owned convoy cleanup

### Best Practices

```bash
# GAIA workflow with ownership
gt convoy create --owned --merge local --title "GAIA: $TASK"

# After completion
gt convoy land  # Cleanup and complete
```

---

## 2. Merge Strategy Selection (`--merge`)

### Options

| Strategy | Use Case | Speed |
|----------|----------|-------|
| `direct` | Fast commits, no MR | Fastest |
| `mr` | Requires review | Slowest |
| `local` | Private until ready | Medium |

### GAIA Recommendations

```bash
# For experimental work (private)
gt convoy create --owned --merge local

# For reviewable changes
gt convoy create --owned --merge mr

# For quick fixes (skip MR)
gt convoy create --owned --merge direct
```

### When to Use Each

- **local**: Bug fixes, experiments, work-in-progress
- **mr**: Significant changes requiring review
- **direct**: Hotfixes, trivial changes

---

## 3. Agent Factory (Data-Driven Presets)

### Concept

Gas Town 0.7.0 replaces hardcoded agent configurations with a data-driven preset registry.

### Configuring GAIA as Preset

```yaml
# In town config or preset registry
agent_presets:
  gaia:
    runtime: codex
    model: claude-sonnet-4-20250514
    mcp_servers:
      - serena
      - linear
      - context7
    env:
      SUPERPOWERS_PROMPT: |
        [Existing GAIA skills...]
        [New checkpoint resilience patterns...]
```

### Adding New Runtimes

The agent factory makes adding new AI providers trivial:

```yaml
# Gemini CLI
gemini:
  runtime: gemini-cli
  model: gemini-2.0-flash

# Copilot CLI
copilot:
  runtime: copilot
  model: gpt-4o
```

---

## 4. Checkpoint Resilience (`gt done`)

### Problem

GAIA sessions can die mid-task, losing context and progress.

### Solution

Periodic checkpointing with `gt done`:

```bash
# In long-running GAIA task
#!/bin/bash
# checkpoint-gaia.sh

while true; do
    # Do work...
    
    # Checkpoint progress
    gt done --checkpoint "Progress: analyzed $files files"
    
    # Check for interruption
    if [ -f /tmp/gaia-stop ]; then
        break
    fi
    
    sleep 300  # Every 5 minutes
done
```

### Recovery

When GAIA restarts after session death:

1. `gt done` creates checkpoint beads
2. On restart, GAIA reads checkpoint beads
3. Resumes from last known good state

### Integration with GAIA Polecat

```python
# In gaia-polecat orchestrator
def run_task_with_checkpointing(task: str, checkpoint_interval: int = 300):
    """Run task with periodic checkpointing."""
    
    # Start task
    checkpoint_id = create_checkpoint(task)
    
    while not task_complete:
        # Do work chunk
        work_result = do_work_chunk()
        
        # Update checkpoint
        update_checkpoint(checkpoint_id, work_result)
        
        # Check for death signal
        if os.path.exists(GAIA_STOP_FILE):
            save_progress(checkpoint_id)
            return "CHECKPOINTED"
    
    return "COMPLETED"
```

---

## 5. JSON Patrol Receipts

### Purpose

Structured output for automated GAIA task tracking.

### Usage

```bash
# Get JSON patrol receipts
gt witness patrol --json

# Parse for GAIA beads
gt witness patrol --json | jq '.[] | select(.type == "mol-gaia-work")'
```

### Example Output

```json
{
  "patrol_id": "patrol-20260215",
  "timestamp": "2026-02-15T10:30:00Z",
  "beads": [
    {
      "id": "gaia-fix-ts-001",
      "type": "mol-gaia-work",
      "status": "in_progress",
      "owner": "gaia-polecat",
      "created_at": "2026-02-15T09:00:00Z"
    }
  ],
  "orphans": [],
  "stale": []
}
```

---

## 6. Orphaned Molecule Detection

### Problem

GAIA work molecules can become orphaned (stuck in IN_PROGRESS with dead polecat).

### Detection

```bash
# Find orphaned GAIA molecules
gt witness patrol

# Or programmatically
gt witness patrol --json | jq '.orphans[] | select(.type == "mol-gaia-work")'
```

### Cleanup

```bash
# Auto-dismiss stalled permission prompts
gt witness clear-stalled

# Land orphaned convoys
gt convoy land --orphaned
```

---

## GAIA Workflow with 0.7.0 Features

```bash
#!/bin/bash
# gaia-workflow-070.sh - GAIA workflow using Gas Town 0.7.0 features

set -e

TASK="$1"
CHECKPOINT_FILE="/tmp/gaia-checkpoint-$$"

# Create owned, local-merge convoy for GAIA work
CONVOY_ID=$(gt convoy create --owned --merge local --title "GAIA: $TASK" --json | jq -r '.id')

echo "🎯 GAIA working on: $TASK"
echo "📦 Convoy: $CONVOY_ID"

# Checkpoint function
checkpoint() {
    local progress="$1"
    gt done --checkpoint "$progress" 2>/dev/null || true
    echo "$(date): $progress" >> "$CHECKPOINT_FILE"
}

# Trap for cleanup on exit
cleanup() {
    rm -f "$CHECKPOINT_FILE"
    gt convoy land "$CONVOY_ID" 2>/dev/null || true
}
trap cleanup EXIT

# Main work loop with checkpointing
main() {
    checkpoint "Started: $TASK"
    
    # Run GAIA task (via codex, etc.)
    codex exec --dangerously-bypass-approvals-and-sandbox "$TASK"
    
    checkpoint "Completed: $TASK"
}

main
```

---

## Migration Checklist

For existing GAIA setups to use 0.7.0:

- [ ] Update `gaia-polecat` to use `--owned --merge local` by default
- [ ] Add checkpointing logic to long-running tasks
- [ ] Parse JSON patrol receipts instead of text
- [ ] Add orphaned molecule detection to patrol cron
- [ ] Configure agent factory for extensible runtime selection
- [ ] Test recovery from simulated session death

---

## References

- [Gas Town CHANGELOG 0.7.0](https://github.com/steveyegge/gastown/blob/main/CHANGELOG.md)
- [Convoy Ownership PR](https://github.com/steveyegge/gastown/pull/XXX)
- [Agent Factory Design](https://github.com/steveyegge/gastown/issues/XXX)
