---
name: polecat-operational-hygiene
description: Prevent operational failures when running GAIA polecat tasks. Check infrastructure health, monitor queue state, and batch file reads before starting long-running work.
---

# Polecat Operational Hygiene

> **Core rule: Never start or continue polecat work without verifying infrastructure and queue state first.**

## Failure Mode 1: Dead External Infrastructure

**Symptom:** Polecat crashes with `KeyError: 'choices'` or network timeout when calling LM Studio / ngrok / remote API.

**Root cause:** External tunnel/service died silently. Polecat assumed it was alive because it worked earlier.

### Prevention Checklist

Before ANY polecat run that depends on external infrastructure:

```bash
# 1. Ping the endpoint
 curl -s "${LMSTUDIO_BASE_URL}/models" | head -5

# 2. Verify response is JSON (not HTML error page)
#    Bad: <!DOCTYPE html> (ngrok dead)
#    Good: {"data": [...]}

# 3. If ngrok: check tunnel is active
 ngrok status 2>/dev/null || echo "ngrok not running"

# 4. If fails: STOP. Do not proceed.
#    Options: restart tunnel, switch to fallback provider, or report blockage.
```

### Hardened Pattern

```python
# In polecat startup or task contract compilation:
def verify_lmstudio_health(base_url: str) -> bool:
    try:
        r = requests.get(f"{base_url}/models", timeout=5)
        data = r.json()
        return "data" in data and len(data.get("data", [])) > 0
    except Exception:
        return False

if not verify_lmstudio_health(lmstudio_url):
    raise RuntimeError(
        f"LM Studio at {lmstudio_url} not healthy. "
        "Restart ngrok or check local LM Studio."
    )
```

---

## Failure Mode 2: Phantom Queue Accumulation

**Symptom:** Polecat runs for hours, queue grows with failed tasks, no progress made.

**Root cause:** No periodic queue status check. Failed tasks accumulate with exponential backoff. Operator assumes "it's working" because process is alive.

### Prevention Checklist

Before starting polecat:
```bash
# 1. Inspect queue state
python scripts/gaia-polecat.py --list-queue

# 2. If queue has FAILED tasks → diagnose before running
#    Failed tasks indicate systematic problem (bad infra, bad tasks, etc.)

# 3. Clear stale/failed tasks if they're from old .beads/ migration
rm .gaia_private/gaia/task_queue.jsonl  # only if tasks are confirmed stale

# 4. Run polecat with bounded attempts
python scripts/gaia-polecat.py --run-queue --max-attempts 2
```

### Hardened Pattern

```python
# At polecat startup, log queue health:
queue = load_queue()
failed_count = sum(1 for t in queue if t.get("status") == "failed")
pending_count = sum(1 for t in queue if t.get("status") == "pending")

if failed_count > 0:
    print(f"⚠️  {failed_count} FAILED tasks in queue. Investigate before continuing.")
    # Option: abort, or run with --max-attempts 1 to surface errors quickly
```

---

## Failure Mode 3: Sequential File Reading Waste

**Symptom:** Resolving merge conflicts or analyzing multi-file issues takes many sequential read_file calls.

**Root cause:** Not exploiting parallel tool calls. Each read blocks on the previous.

### Prevention Checklist

When more than 2 files are needed:

```python
# BAD: sequential
read_file("src/A.tsx")
read_file("src/B.tsx")  # waits for A
read_file("src/C.tsx")  # waits for B

# GOOD: batch parallel (MCP/LLM tool call batching)
read_file("src/A.tsx")
read_file("src/B.tsx")  # same turn, parallel
read_file("src/C.tsx")   # same turn, parallel
```

### Hardened Pattern

```
RULE: For any task involving >1 file:
1. List all files needed FIRST
2. Read all in a SINGLE batch where the tool supports it
3. Only THEN analyze and edit

For merge conflicts specifically:
1. git diff --name-only --diff-filter=U  → list conflicted files
2. Read ALL conflicted files in parallel
3. Resolve all in one edit session
```

---

## Pre-Flight Checklist (Mandatory Before Polecat Run)

```
□ Queue inspected (--list-queue). Failed tasks < 2 or cleared.
□ External infra verified (curl /models or equivalent).
□ LM Studio / ngrok / API endpoint returns JSON, not HTML.
□ If --run-queue: --max-attempts set (default 3, use 2 for debugging).
□ If merge conflict resolution: all conflicted files read in parallel first.
□ Plan saved to .windsurf/plans if task is non-trivial.
```

---

## When to Abort a Polecat Run

| Condition | Action |
|---|---|
| 3+ consecutive task failures | Stop. Infrastructure or task definitions are broken. |
| Queue only has failed tasks after 30 min | Stop. No forward progress possible. |
| `choices` KeyError from LLM API | Stop. Endpoint is dead or misconfigured. |
| Merge conflict resolution > 10 min | Stop. Get human help for complex conflicts. |

---

## Post-Run Checklist

```
□ --list-queue to confirm queue state (empty = success, failed = investigate)
□ git status to verify no unintended changes
□ git diff --stat to sanity-check change scope
□ Type check + test run before push
```
