#!/usr/bin/env bash
set -euo pipefail

# dispatch.sh — CTO decomposition + sub-agent dispatch loop
# Called from Hermes or conductor to break down tasks into sub-agent work
#
# Usage:
#   dispatch.sh decompose <worktree_path>     # CTO prompt → .sub-tasks.json
#   dispatch.sh execute <worktree_path>       # Run sub-agents from .sub-tasks.json
#   dispatch.sh --decompose <worktree_path>   # Both in sequence
#   dispatch.sh create-worktree <name>        # Create Orca-managed worktree

REPO_ROOT="$(git rev-parse --show-toplevel)"
BD_CMD=${BD_CMD:-bd}

# Create an Orca-managed worktree for isolation
# Usage: create_orca_worktree <name> [repo_path] [gh_issue_number] [bead_id]
#   gh_issue_number (optional, integer) -> `orca worktree create --issue <n>` (GitHub link)
#   bead_id (optional) -> always recorded via `--comment "bead:<id>"` (single-lineage stitch,
#     bd stays authoritative — see T1 sound-royale-ny-wisp-c0f.10 / T5 .14).
#   NOTE: --issue expects a GitHub ISSUE NUMBER, NOT a bd bead id. Pass the bead's
#   gh-<n> external-ref number here; the bd id goes in --comment.
create_orca_worktree() {
  local WORKTREE_NAME="$1"
  local REPO_PATH="${2:-$REPO_ROOT}"
  local GH_ISSUE="${3:-}"
  local BEAD_ID="${4:-}"
  
  echo "[dispatch] Creating Orca worktree: $WORKTREE_NAME" >&2
  
  # Check if Orca is available
  if ! command -v orca &> /dev/null; then
    echo "[dispatch] ERROR: orca command not found" >&2
    echo "[dispatch] Falling back to manual worktree creation" >&2
    # Fallback to manual worktree creation
    local WORKTREE_PATH="$REPO_ROOT/.worktrees/$WORKTREE_NAME"
    mkdir -p "$WORKTREE_PATH"
    echo "$WORKTREE_PATH"
    return 0
  fi
  
  # Create worktree via Orca. --issue needs a GitHub NUMBER; --comment always records the bd bead.
  local ORCA_OUTPUT
  local ORCA_ARGS=(--name "$WORKTREE_NAME" --repo "path:$REPO_PATH" --json)
  if [ -n "$GH_ISSUE" ] && [ "$GH_ISSUE" != "null" ]; then
    ORCA_ARGS+=(--issue "$GH_ISSUE")
  fi
  if [ -n "$BEAD_ID" ]; then
    ORCA_ARGS+=(--comment "bead:$BEAD_ID")
  fi
  # Capture STDOUT only (clean JSON for jq). Let stderr go to the terminal for diagnostics —
  # merging it with 2>&1 would pollute the JSON and break jq parsing if Orca emits warnings.
  ORCA_OUTPUT=$(orca worktree create "${ORCA_ARGS[@]}" 2>/dev/null) || {
    echo "[dispatch] ERROR: Orca worktree creation failed" >&2
    echo "[dispatch] Output: $ORCA_OUTPUT" >&2
    # Fallback to manual worktree creation
    local WORKTREE_PATH="$REPO_ROOT/.worktrees/$WORKTREE_NAME"
    mkdir -p "$WORKTREE_PATH"
    echo "$WORKTREE_PATH"
    return 0
  }
  
  # Extract worktree path from Orca output
  local WORKTREE_PATH
  WORKTREE_PATH=$(echo "$ORCA_OUTPUT" | jq -r '.result.worktree.path // empty' 2>/dev/null)
  
  if [ -z "$WORKTREE_PATH" ] || [ ! -d "$WORKTREE_PATH" ]; then
    echo "[dispatch] ERROR: Orca returned invalid worktree path" >&2
    echo "[dispatch] Output: $ORCA_OUTPUT" >&2
    # Fallback to manual worktree creation
    WORKTREE_PATH="$REPO_ROOT/.worktrees/$WORKTREE_NAME"
    mkdir -p "$WORKTREE_PATH"
    echo "$WORKTREE_PATH"
    return 0
  fi
  
  echo "[dispatch] Orca worktree created: $WORKTREE_PATH" >&2
  echo "$WORKTREE_PATH"
}

# Tool profile → runner command mapping
CASE_RUNNER_MAP() {
  local profile="$1"
  local prompt_file="$2"
  local work_dir="$3"
  local timeout="${4:-600}"
  
  case "$profile" in
    coder)
      echo "cat \"$prompt_file\" | hermes chat --accept-hooks"
      ;;
    qa-browser)
      echo "cat \"$prompt_file\" | agent-browser run --work-dir $work_dir --timeout $timeout"
      ;;
    qa-computer-use)
      echo "cat \"$prompt_file\" | orca run --work-dir $work_dir --timeout $timeout"
      ;;
    qa-reach)
      echo "cat \"$prompt_file\" | curl -s"
      ;;
    *)
      echo "cat \"$prompt_file\" | hermes chat --accept-hooks"
      ;;
  esac
}

decompose_task() {
  local WORKTREE_NAME="$1"
  local TASK_FILE_INPUT="${2:-}"
  local GH_ISSUE="${3:-}"
  local BEAD_ID="${4:-}"

  # Create a real Orca-managed git worktree for isolation (links to bead via --comment, gh via --issue)
  local WORKTREE
  WORKTREE=$(create_orca_worktree "$WORKTREE_NAME" "$REPO_ROOT" "$GH_ISSUE" "$BEAD_ID")
  echo "[dispatch] Using worktree: $WORKTREE"

  # If a task file was provided, copy it into the worktree; otherwise expect it there
  if [ -n "$TASK_FILE_INPUT" ] && [ -f "$TASK_FILE_INPUT" ]; then
    cp "$TASK_FILE_INPUT" "$WORKTREE/.conductor-task.md"
  fi

  local TASK_FILE="$WORKTREE/.conductor-task.md"
  local SUBTASKS_FILE="$WORKTREE/.sub-tasks.json"

  if [ ! -f "$TASK_FILE" ]; then
    echo "[dispatch] ERROR: $TASK_FILE not found" >&2
    exit 1
  fi

  echo "[dispatch] Decomposing task via CTO prompt..."

  # CTO decomposition prompt
  CTO_PROMPT=$(cat <<'CTOEOF'
You are a CTO agent. Your job is to decompose a task into parallel sub-agent work.

Given the task below, output ONLY a JSON object with this schema:
{
  "strategy": "parallel" | "sequential",
  "parallel": [
    {
      "id": "sub-task-1",
      "title": "Brief title",
      "prompt": "Detailed prompt for sub-agent",
      "success_criteria": "What defines success",
      "tool_profile": "coder" | "qa-browser" | "qa-computer-use" | "qa-reach",
      "evidence_type": "file" | "log" | "screenshot" | "curl_output"
    }
  ]
}

Rules:
- Use "coder" for code implementation tasks
- Use "qa-browser" for web testing/UI verification
- Use "qa-computer-use" for desktop app testing
- Use "qa-reach" for API health checks
- Each sub-task gets its own detailed prompt
- Include clear success criteria for verification

Task:
CTOEOF
)

  # Build full CTO prompt with task content
  FULL_PROMPT="$CTO_PROMPT

$(cat "$TASK_FILE")"

  # Invoke Hermes for decomposition
  PROMPT_FILE=$(mktemp)
  echo "$FULL_PROMPT" > "$PROMPT_FILE"

  echo "[dispatch] Invoking CTO decomposition..."
  CTO_OUTPUT=$(hermes chat -q "$(cat "$PROMPT_FILE")" --accept-hooks 2>&1) || {
    echo "[dispatch] CTO decomposition failed" >&2
    rm -f "$PROMPT_FILE"
    exit 1
  }
  rm -f "$PROMPT_FILE"

  # Extract JSON from CTO output — strip terminal box chars, then validate with jq
  JSON_OUTPUT=$(echo "$CTO_OUTPUT" | tr -d '─ │⚕\n' | grep -o '{.*}' | tail -1 || echo "")
  if [ -n "$JSON_OUTPUT" ]; then
    # Validate and pretty-print with jq; capture only if valid
    JSON_OUTPUT=$(echo "$JSON_OUTPUT" | jq '.' 2>/dev/null || echo "")
  fi

  # If JSON is empty or parallel array is empty/missing, build a single-task fallback
  PARALLEL_COUNT=$(echo "$JSON_OUTPUT" | jq '.parallel | length' 2>/dev/null || echo "0")
  if [ -z "$JSON_OUTPUT" ] || [ "${PARALLEL_COUNT:-0}" = "0" ]; then
    echo "[dispatch] CTO returned no sub-tasks — falling back to single coder task" >&2
    TASK_ESCAPED=$(cat "$TASK_FILE" | tr '\n' ' ' | sed 's/"/\\"/g')
    JSON_OUTPUT='{"strategy":"parallel","parallel":[{"id":"sub-task-1","title":"Full Task","prompt":"'"$TASK_ESCAPED"'","success_criteria":"Complete the task","tool_profile":"coder","evidence_type":"file"}]}'
  fi

  # Save sub-tasks
  echo "$JSON_OUTPUT" | jq '.' > "$SUBTASKS_FILE"
  echo "[dispatch] Sub-tasks written to $SUBTASKS_FILE"
  
  # Display summary
  TASK_COUNT=$(jq '.parallel | length' "$SUBTASKS_FILE" 2>/dev/null || echo "0")
  echo "[dispatch] Decomposed into $TASK_COUNT sub-tasks:"
  jq -r '.parallel[] | "  - [\(.tool_profile)] \(.title)"' "$SUBTASKS_FILE" 2>/dev/null || true
}

execute_subtasks() {
  local WORKTREE="$1"
  local SUBTASKS_FILE="$WORKTREE/.sub-tasks.json"
  local MAX_PARALLEL="${MAX_PARALLEL:-3}"
  local TIMEOUT="${TIMEOUT:-600}"

  if [ ! -f "$SUBTASKS_FILE" ]; then
    echo "[dispatch] ERROR: $SUBTASKS_FILE not found" >&2
    exit 1
  fi

  echo "[dispatch] Executing sub-agents..."
  
  local PIDS=()
  local RESULTS=()
  local TASK_DIR="$WORKTREE/.sub-agent-results"
  mkdir -p "$TASK_DIR"

  # Execute each sub-task
  while IFS= read -r line; do
    local id=$(echo "$line" | jq -r '.id')
    local title=$(echo "$line" | jq -r '.title')
    local prompt=$(echo "$line" | jq -r '.prompt')
    local profile=$(echo "$line" | jq -r '.tool_profile')
    local criteria=$(echo "$line" | jq -r '.success_criteria')
    local evidence=$(echo "$line" | jq -r '.evidence_type')

    echo "[dispatch] Starting sub-agent: [$profile] $title"

    # Write prompt to temp file
    PROMPT_FILE="$TASK_DIR/$id-prompt.txt"
    echo "$prompt" > "$PROMPT_FILE"

    # Launch sub-agent
    LOG_FILE="$TASK_DIR/$id.log"
    : > "$LOG_FILE"
    
    case "$profile" in
      coder)
        (cd "$WORKTREE" && hermes chat -q "$(cat "$PROMPT_FILE")" --accept-hooks > "$LOG_FILE" 2>&1) &
        ;;
      qa-browser)
        (cd "$WORKTREE" && cat "$PROMPT_FILE" | agent-browser run --work-dir "$WORKTREE" --timeout "$TIMEOUT" > "$LOG_FILE" 2>&1) &
        ;;
      qa-computer-use)
        (cd "$WORKTREE" && cat "$PROMPT_FILE" | orca run --work-dir "$WORKTREE" --timeout "$TIMEOUT" > "$LOG_FILE" 2>&1) &
        ;;
      qa-reach)
        (cd "$WORKTREE" && cat "$PROMPT_FILE" | curl -s > "$LOG_FILE" 2>&1) &
        ;;
      *)
        (cd "$WORKTREE" && hermes chat -q "$(cat "$PROMPT_FILE")" --accept-hooks > "$LOG_FILE" 2>&1) &
        ;;
    esac
    PIDS+=($!)
    RESULTS+=("$id:$LOG_FILE:$criteria:$evidence")

    # Respect MAX_PARALLEL
    if [ ${#PIDS[@]} -ge "$MAX_PARALLEL" ]; then
      wait "${PIDS[0]}" 2>/dev/null || true
      PIDS=("${PIDS[@]:1}")
    fi

  done < <(jq -c '.parallel[]' "$SUBTASKS_FILE" 2>/dev/null || echo "")

  # Wait for remaining sub-agents
  for pid in "${PIDS[@]}"; do
    wait "$pid" 2>/dev/null || true
  done

  echo "[dispatch] All sub-agents completed"
  
  # Verify results
  local ALL_PASSED=1
  for result in "${RESULTS[@]}"; do
    IFS=':' read -r id log_file criteria evidence <<< "$result"
    if [ -f "$log_file" ] && [ -s "$log_file" ]; then
      echo "[dispatch] ✓ $id: has output"
    else
      echo "[dispatch] ✗ $id: no output"
      ALL_PASSED=0
    fi
  done

  if [ "$ALL_PASSED" = "1" ]; then
    echo "[dispatch] All sub-agents produced output"
    touch "$WORKTREE/.sub-agents-done"
  else
    echo "[dispatch] Some sub-agents failed" >&2
    exit 1
  fi
}

resolve_orca_worktree() {
  local WORKTREE_NAME="$1"

  if command -v orca &> /dev/null; then
    local WT_JSON
    WT_JSON=$(orca worktree show --worktree "name:$WORKTREE_NAME" --json 2>/dev/null || \
              orca worktree show --worktree "path:$REPO_ROOT/.worktrees/$WORKTREE_NAME" --json 2>/dev/null || \
              orca worktree show --worktree "branch:refs/heads/branben/$WORKTREE_NAME" --json 2>/dev/null || true)
    if [ -n "$WT_JSON" ]; then
      local WT_PATH
      WT_PATH=$(printf '%s' "$WT_JSON" | jq -r '.result.worktree.path // empty' 2>/dev/null)
      if [ -n "$WT_PATH" ] && [ -d "$WT_PATH" ]; then
        printf '%s' "$WT_PATH"
        return 0
      fi
    fi
  fi

  local GIT_PATH
  GIT_PATH=$(git worktree list --porcelain 2>/dev/null | awk -v name="$WORKTREE_NAME" '
    /^worktree /{ p=$2 }
    /^branch /{
      b=$2
      if (p ~ ("/" name "$") || b ~ ("/" name "$")) { print p; exit }
    }
  ')
  if [ -n "$GIT_PATH" ] && [ -d "$GIT_PATH" ]; then
    printf '%s' "$GIT_PATH"
    return 0
  fi

  local FALLBACK="$REPO_ROOT/.worktrees/$WORKTREE_NAME"
  if [ -d "$FALLBACK" ]; then
    printf '%s' "$FALLBACK"
    return 0
  fi

  return 1
}

# Full lifecycle: create Orca worktree → decompose → execute
# Usage: dispatch.sh orchestrate <name> [task_file] [gh_issue_number] [bead_id]
dispatch_orchestrate() {
  local WORKTREE_NAME="$1"
  local TASK_FILE_INPUT="${2:-}"
  local GH_ISSUE="${3:-}"
  local BEAD_ID="${4:-}"

  echo "[dispatch] Orchestrating full lifecycle for: $WORKTREE_NAME"

  # Create worktree + decompose (also copies task file in); links to bead via --comment, gh via --issue
  decompose_task "$WORKTREE_NAME" "$TASK_FILE_INPUT" "$GH_ISSUE" "$BEAD_ID"

  local WORKTREE
  WORKTREE=$(resolve_orca_worktree "$WORKTREE_NAME") || {
    echo "[dispatch] ERROR: could not resolve worktree path for execution" >&2
    exit 1
  }
  echo "[dispatch] Resolved worktree: $WORKTREE"

  execute_subtasks "$WORKTREE"
  echo "[dispatch] Orchestration complete for: $WORKTREE_NAME"
}

# Race-3 (recipes/parallel-agents): same brief, 3 worktrees, run all, Principal picks winner.
# Usage: dispatch.sh race3 <name> [task_file] [gh_issue_number] [bead_id]
# Creates <name>-r1/-r2/-r3 worktrees from the SAME brief, executes each, then emits a
# diff summary + records race_candidates as bd metadata. The Principal chooses the winner
# (HITL) and discards the other two — the script does NOT auto-merge.
race3_task() {
  local BASE="$1"
  local TASK_FILE_INPUT="${2:-}"
  local GH_ISSUE="${3:-}"
  local BEAD_ID="${4:-}"

  echo "[dispatch] Race-3 for: $BASE (3 parallel worktrees from same brief)"
  local CANDIDATES=()
  for i in 1 2 3; do
    local NAME="${BASE}-r${i}"
    decompose_task "$NAME" "$TASK_FILE_INPUT" "$GH_ISSUE" "$BEAD_ID" || {
      echo "[dispatch] ERROR: decompose failed for $NAME" >&2; return 1; }
    local WT
    WT=$(resolve_orca_worktree "$NAME") || WT="$REPO_ROOT/.worktrees/$NAME"
    CANDIDATES+=("$WT")
    echo "[dispatch] Candidate $i worktree: $WT"
  done

  # Run all three (execute_subtasks is internally parallel via MAX_PARALLEL)
  for WT in "${CANDIDATES[@]}"; do
    execute_subtasks "$WT"
  done

  # Diff summary for the Principal
  echo "[dispatch] === Race-3 diff summary ==="
  for WT in "${CANDIDATES[@]}"; do
    echo "[dispatch] $WT:"
    ( cd "$WT" && git --no-pager diff --stat HEAD 2>/dev/null ) | sed 's/^/    /'
  done

  # Record candidates so the Principal can pick (HITL) and discard the losers
  if [ -n "$BEAD_ID" ] && command -v "$BD_CMD" >/dev/null 2>&1; then
    "$BD_CMD" update "$BEAD_ID" --set-metadata="race_candidates=$(IFS='|'; echo "${CANDIDATES[*]}")" >/dev/null 2>&1 || true
  fi
  echo "[dispatch] Race-3 complete. Candidates: ${CANDIDATES[*]}"
  echo "[dispatch] Principal: review diffs, keep the winning worktree, discard the other two."
}

# Main
case "${1:-}" in
  create-worktree)
    create_orca_worktree "$2"
    ;;
  decompose|--decompose)
    if [ -n "${3:-}" ]; then
      # Called with name + task file: create worktree, decompose, optionally execute
      decompose_task "$2" "$3"
      if [ "${1:-}" = "--decompose" ]; then
        WT=$(resolve_orca_worktree "$2") || WT="$REPO_ROOT/.worktrees/$2"
        execute_subtasks "$WT"
      fi
    else
      # Legacy: pre-made worktree path passed
      decompose_task "$2"
      if [ "${1:-}" = "--decompose" ]; then
        execute_subtasks "$2"
      fi
    fi
    ;;
  orchestrate)
    dispatch_orchestrate "$2" "${3:-}"
    ;;
  race3)
    race3_task "$2" "${3:-}" "${4:-}" "${5:-}"
    ;;
  execute)
    execute_subtasks "$2"
    ;;
  *)
    echo "Usage: dispatch.sh [create-worktree|decompose|orchestrate|race3|execute] <args>"
    echo "  create-worktree <name>            Create an Orca-managed worktree"
    echo "  decompose <name> [task_file]      Create worktree + decompose (CTO prompt)"
    echo "  orchestrate <name> [task_file] [gh_issue] [bead_id]   Full lifecycle"
    echo "  race3 <name> [task_file] [gh_issue] [bead_id]         Race-3 parallel worktrees (recipes/parallel-agents)"
    echo "  execute <worktree_path>           Run sub-agents from .sub-tasks.json"
    echo "  --decompose <name> [task_file]    Create worktree + decompose + execute"
    echo "  orchestrate <name> [task_file]    Full lifecycle: create → decompose → execute"
    echo "  execute <worktree_path>           Run sub-agents from .sub-tasks.json"
    exit 1
    ;;
esac
