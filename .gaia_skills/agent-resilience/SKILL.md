---
name: agent-resilience
description: Checkpoint-based resilience for GAIA polecat sessions. Use for long-running tasks, recovery from session death, and dead agent detection.
---

# Agent Resilience for GAIA Polecat

> Building unkillable GAIA sessions with checkpoint-based recovery.

## The Problem

GAIA sessions can die unexpectedly:
- Terminal disconnection
- System sleep/shutdown
- OOM kills
- Network timeouts

Without resilience, all progress is lost.

## The Solution: Checkpoint-Based Recovery

Gas Town 0.7.0's `gt done` provides checkpoint-based resilience:

```
Session Start → [Work] → Checkpoint → [Work] → Checkpoint → ... → Session Death
                                                              ↓
Session Restart → Load Checkpoints → Resume → [Work] → ... → Complete
```

---

## Core Principles

### 1. Atomic Progress Chunks

Break work into small, atomic chunks that can be resumed:

```python
# BAD: One giant task
def implement_feature():
    analyze_codebase()  # 10 min
    design_solution()   # 5 min
    implement_code()    # 30 min
    write_tests()        # 10 min
    verify_build()      # 5 min
    # If dies at 40min → lose ALL progress

# GOOD: Checkpoint after each chunk
def implement_feature():
    checkpoint("phase:analyze", analyze_codebase())
    checkpoint("phase:design", design_solution())
    checkpoint("phase:implement", implement_code())
    checkpoint("phase:test", write_tests())
    checkpoint("phase:verify", verify_build())
    # If dies at phase:implement → resume from phase:design
```

### 2. Idempotent Operations

All checkpointed operations must be idempotent:

```python
# BAD: Appending to file
def write_log(message):
    with open("log.txt", "a") as f:
        f.write(message + "\n")
    # Running twice = duplicate entries

# GOOD: Upsert pattern
def write_log(message):
    with open("log.txt", "r+") as f:
        lines = f.readlines()
        if message + "\n" not in lines:
            f.write(message + "\n")
    # Running twice = no duplicate
```

### 3. State Serialization

All state must be serializable to disk:

```python
# BAD: In-memory state
class Analyzer:
    def __init__(self):
        self.cache = {}  # Lost on death
    
    def analyze(self, files):
        # Uses self.cache - not recoverable
        pass

# GOOD: Serializable state
class Analyzer:
    def __init__(self, state_file=".gaia/cache.json"):
        self.state_file = state_file
        self.cache = self._load_cache()
    
    def _load_cache(self):
        if os.path.exists(self.state_file):
            return json.load(open(self.state_file))
        return {}
    
    def _save_cache(self):
        os.makedirs(os.path.dirname(self.state_file), exist_ok=True)
        json.dump(self.cache, open(self.state_file, "w"))
    
    def analyze(self, files):
        for f in files:
            if f not in self.cache:
                self.cache[f] = self._analyze_file(f)
                self._save_cache()  # Checkpoint after each
        return self.cache
```

---

## Checkpoint API

### Basic Checkpoint

```bash
# Create checkpoint with message
gt done --checkpoint "Analyzed 50 files, found 3 issues"
```

### Checkpoint Recovery

```bash
# On restart, check for existing checkpoints
gt bead list --type mol-gaia-work --format json | jq '.[] | select(.status == "checkpointed")'
```

### Checkpoint Structure

```json
{
  "id": "gaia-checkpoint-001",
  "type": "mol-gaia-work",
  "status": "checkpointed",
  "title": "GAIA: Analyze auth system",
  "checkpoint": {
    "phase": "analyze",
    "progress": "50/100 files",
    "findings": ["file1.ts", "file2.ts"],
    "timestamp": "2026-02-15T10:30:00Z"
  }
}
```

---

## Implementation Patterns

### Pattern 1: Phase-Based Checkpointing

```python
import json
import os
from datetime import datetime

class CheckpointedTask:
    def __init__(self, task_id: str, phases: list[str]):
        self.task_id = task_id
        self.phases = phases
        self.checkpoint_file = f".gaia/checkpoints/{task_id}.json"
        self.current_phase = self._load_phase()
    
    def _load_phase(self) -> int:
        if os.path.exists(self.checkpoint_file):
            data = json.load(open(self.checkpoint_file))
            return data.get("phase_index", 0)
        return 0
    
    def _save_checkpoint(self, phase_index: int, data: dict):
        os.makedirs(os.path.dirname(self.checkpoint_file), exist_ok=True)
        json.dump({
            "phase_index": phase_index,
            "phase": self.phases[phase_index],
            "data": data,
            "timestamp": datetime.utcnow().isoformat()
        }, open(self.checkpoint_file, "w"))
        
        # Also create Gas Town bead checkpoint
        os.system(f'gt done --checkpoint "Phase: {self.phases[phase_index]}"')
    
    def run(self):
        while self.current_phase < len(self.phases):
            phase = self.phases[self.current_phase]
            print(f"Running phase: {phase}")
            
            # Execute phase
            result = self._execute_phase(phase)
            
            # Checkpoint
            self._save_checkpoint(self.current_phase, result)
            
            self.current_phase += 1
        
        # Clean up checkpoint file on completion
        if os.path.exists(self.checkpoint_file):
            os.remove(self.checkpoint_file)
    
    def _execute_phase(self, phase: str) -> dict:
        # Implement phase logic
        pass
```

### Pattern 2: File-Based Progress

```python
class FileProgressTracker:
    """Track progress via files for durability."""
    
    def __init__(self, task_id: str):
        self.task_id = task_id
        self.progress_dir = f".gaia/progress/{task_id}"
        os.makedirs(self.progress_dir, exist_ok=True)
    
    def mark_complete(self, item: str):
        """Mark item as complete."""
        path = os.path.join(self.progress_dir, f"{item}.done")
        with open(path, "w") as f:
            f.write(datetime.utcnow().isoformat())
    
    def is_complete(self, item: str) -> bool:
        """Check if item is complete."""
        return os.path.exists(os.path.join(self.progress_dir, f"{item}.done"))
    
    def get_remaining(self, items: list[str]) -> list[str]:
        """Get incomplete items."""
        return [i for i in items if not self.is_complete(i)]
    
    def checkpoint(self, context: dict):
        """Save context for recovery."""
        with open(f"{self.progress_dir}/context.json", "w") as f:
            json.dump(context, f)
    
    def load_context(self) -> dict:
        """Load saved context."""
        path = f"{self.progress_dir}/context.json"
        if os.path.exists(path):
            return json.load(open(path))
        return {}
```

### Pattern 3: Dead Agent Detection

```python
import subprocess
import time

class AgentHealthMonitor:
    """Monitor and restart dead GAIA agents."""
    
    def __init__(self):
        self.session_prefix = "gaia-"
        self.check_interval = 60  # seconds
    
    def is_agent_alive(self, agent_id: str) -> bool:
        """Check if agent session is alive."""
        result = subprocess.run(
            ["tmux", "has-session", "-t", f"{self.session_prefix}{agent_id}"],
            capture_output=True
        )
        return result.returncode == 0
    
    def detect_dead_agents(self) -> list[str]:
        """Find dead GAIA agents with checkpointed work."""
        result = subprocess.run(
            ["gt", "bead", "list", "--type", "mol-gaia-work", "--format", "json"],
            capture_output=True
        )
        beads = json.loads(result.stdout)
        
        dead = []
        for bead in beads:
            if bead.get("status") == "checkpointed":
                agent_id = bead.get("owner", "").replace("gaia-", "")
                if not self.is_agent_alive(agent_id):
                    dead.append(bead)
        
        return dead
    
    def restart_agent(self, bead_id: str):
        """Restart dead agent with checkpoint."""
        print(f"Restarting dead agent for bead: {bead_id}")
        # Load checkpoint and restart
        subprocess.run(["gt", "sling", "--resume", bead_id])
    
    def run_health_check(self):
        """Run health check loop."""
        while True:
            dead = self.detect_dead_agents()
            for bead in dead:
                self.restart_agent(bead["id"])
            time.sleep(self.check_interval)
```

---

## Recovery Protocol

When GAIA restarts after death:

### 1. Detect Previous Session

```bash
# Check for checkpoint beads
gt bead list --type mol-gaia-work --status checkpointed
```

### 2. Load Context

```python
# Load checkpoint data
checkpoint_data = load_checkpoint(bead_id)
task = checkpoint_data["task"]
completed_phases = checkpoint_data["completed_phases"]
```

### 3. Resume

```python
# Resume from last checkpoint
for phase in phases:
    if phase in completed_phases:
        continue  # Skip already done
    result = execute_phase(phase)
    checkpoint(phase, result)
```

---

## Anti-Patterns

### ❌ Don't: Rely on Memory

```python
# BAD: All state in memory
def process_files(files):
    results = []  # Lost on death!
    for f in files:
        results.append(analyze(f))
    return results
```

### ❌ Don't: Skip Checkpointing

```python
# BAD: Checkpoint at end only
def process_files(files):
    results = []
    for f in files:
        results.append(analyze(f))
    checkpoint(results)  # Too late - death = lost
```

### ❌ Don't: Non-Idempotent Operations

```python
# BAD: Append operations
def log(message):
    with open("log.txt", "a") as f:
        f.write(message + "\n")  # Duplicates on retry!
```

---

## Testing Resilience

```bash
# Simulate death mid-task
# 1. Start long task
gaia-polecat "Analyze 1000 files"

# 2. Kill session during execution
kill -9 $(pgrep -f codex)

# 3. Verify checkpoint exists
gt bead list --type mol-gaia-work --status checkpointed

# 4. Restart and verify resumes
gaia-polecat --resume  # Should pick up from checkpoint
```

---

## Integration with GAIA Polecat

```python
# In gaia-polecat/main.py
import os
import sys

class ResilientGAIAPolecat:
    def __init__(self):
        self.checkpoint_dir = ".gaia/checkpoints"
        self.health_monitor = AgentHealthMonitor()
    
    def run(self, task: str, resume_from: str = None):
        if resume_from:
            # Resume from checkpoint
            self.resume_task(resume_from)
        else:
            # Start new task with checkpointing
            self.run_with_checkpointing(task)
    
    def run_with_checkpointing(self, task: str):
        tracker = CheckpointedTask(
            task_id=generate_id(),
            phases=["analyze", "design", "implement", "verify"]
        )
        
        # Start health monitor in background
        # (would use threading in real implementation)
        
        # Run with checkpointing
        tracker.run()
        
        # Notify completion
        os.system('gt done "Task complete: {task}"')
```

---

## Summary

| Pattern | When to Use |
|---------|-------------|
| Phase-based | Multi-step tasks |
| File progress | Large batch processing |
| Dead agent detection | Long-running sessions |
| Idempotent ops | All operations |

**Core rule**: If it takes >1 minute, checkpoint it.
