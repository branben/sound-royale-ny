#!/usr/bin/env bash
set -euo pipefail
REPO_ROOT="$(git rev-parse --show-toplevel)"
BD_CMD=${BD_CMD:-bd}
SLEEP_SEC=2
MAX_POLLS=3
polls=0
TRACES_DIR="$REPO_ROOT/.agents/orchestration/traces"
mkdir -p "$TRACES_DIR"

# Agent completion timeout (default 30 minutes) and poll interval
AGENT_TIMEOUT="${AGENT_TIMEOUT:-1800}"
AGENT_POLL_INTERVAL="${AGENT_POLL_INTERVAL:-15}"

# Auto-detect repo identity from git remote
REPO_NAME="$(basename "$REPO_ROOT")"
REPO_URL="$(git remote get-url origin 2>/dev/null || echo "")"
GH_REPO=""
if echo "$REPO_URL" | grep -q 'github.com'; then
  GH_REPO="$(echo "$REPO_URL" | sed -E 's|.*github.com[:/]([^/]+/[^./]+).*|\1|' | sed 's/\.git$//')"
fi

# Configurable identity (override via env for non-detected or non-GitHub repos)
ORCA_REPO_ID="${ORCA_REPO_ID:-}"
CONDUCTOR_REPO_DESCRIPTION="${CONDUCTOR_REPO_DESCRIPTION:-}"

write_trace() {
  local bead="${1:-unknown}"
  local title="${2:-untitled}"
  local task_id="${3:-unknown}"
  local worktree="${4:-unknown}"
  local hermes_terminal="${5:-}"
  local workspace_url="${6:-}"
  local bootstrap_exit="${7:-}"
  local verify_exit="${8:-}"
  local agent_status="${9:-unknown}"
  local agent_rc="${10:-}"
  local file
  file="$TRACES_DIR/$(date -u +%Y-%m-%d)-${REPO_NAME}-${bead}.md"
  cat >> "$file" <<EOF
## Trace ${bead}

- **date**: $(date -u +%Y-%m-%dT%H:%M:%SZ)
- **bead**: ${bead}
- **title**: ${title}
- **task_id**: ${task_id}
- **repo**: ${REPO_NAME}${GH_REPO:+ (${GH_REPO})}
- **worktree**: ${worktree}
- **workspace_url**: ${workspace_url}
- **hermes_terminal**: ${hermes_terminal}
- **bootstrap_exit_code**: ${bootstrap_exit}
- **verify_exit_code**: ${verify_exit}
- **agent_status**: ${agent_status}
- **agent_exit_code**: ${agent_rc}
EOF
}

while [ "$polls" -lt "$MAX_POLLS" ]; do
  READY_JSON=$($BD_CMD ready --json 2>/dev/null || $BD_CMD ready 2>/dev/null || echo "[]")
  ID=$(printf '%s' "$READY_JSON" | jq -r '.[0].id // empty' 2>/dev/null || true)
  if [ -n "$ID" ]; then
    set +e
    (
      set -e

      # --- Read bead metadata from ready list ---
      ISSUE_TYPE=$(printf '%s' "$READY_JSON" | jq -r '.[0].type // "task"')
      TITLE=$(printf '%s' "$READY_JSON" | jq -r '.[0].title // empty' 2>/dev/null || true)

      # --- Get full bead details via bd show ---
      BEAD_JSON=$($BD_CMD show "$ID" --json 2>/dev/null || echo "[]")
      BODY=$(printf '%s' "$BEAD_JSON" | jq -r '.[0].description // empty' 2>/dev/null || echo "")
      # external-ref is set via 'bd create --external-ref "gh-N"'; try both hyphen and underscore
      EXTERNAL_REF=$(printf '%s' "$BEAD_JSON" | jq -r '.[0]["external-ref"] // .[0]["external_ref"] // empty' 2>/dev/null || echo "")
      # Merge labels into a comma-separated string for the prompt
      LABELS=$(printf '%s' "$BEAD_JSON" | jq -r '.[0].labels // [] | join(", ")' 2>/dev/null || echo "")

      $BD_CMD update "$ID" --claim >/dev/null 2>&1 || true
      trap 'write_trace "$ID" "$TITLE" "$TASK_ID" "$WT_PATH" "$HERMES_TERMINAL" "$WORKSPACE_URL" "$BOOTSTRAP_EXIT_CODE" "$VERIFY_EXIT_CODE" "$AGENT_STATUS" "$AGENT_RC"' EXIT

      TASK_ID="conductor-${ID##*-}"
      WT_PATH=""
      ORCA_WT_ID=""

      # --- Build task prompt from bead metadata + optional GitHub issue ---
      ISSUE_NUMBER=""
      ISSUE_BODY=""
      ISSUE_TITLE=""
      if echo "$EXTERNAL_REF" | grep -qE '^gh-[0-9]+'; then
        ISSUE_NUMBER="${EXTERNAL_REF#gh-}"
        if command -v gh >/dev/null 2>&1 && [ -n "$GH_REPO" ]; then
          GH_JSON=$(gh issue view "$ISSUE_NUMBER" --repo "$GH_REPO" --json title,body 2>/dev/null || echo "{}")
          ISSUE_TITLE=$(printf '%s' "$GH_JSON" | jq -r '.title // empty')
          ISSUE_BODY=$(printf '%s' "$GH_JSON" | jq -r '.body // empty')
        fi
      fi

      # Assemble the agent prompt with all available context
      PROMPT=$(cat <<TASKEOF
# Task: ${ISSUE_TITLE:-$TITLE}

## Repository
${REPO_NAME}${GH_REPO:+ (${GH_REPO})}
$(if [ -n "$CONDUCTOR_REPO_DESCRIPTION" ]; then echo "${CONDUCTOR_REPO_DESCRIPTION}"; fi)
$(if [ -n "$ISSUE_NUMBER" ] && [ -n "$GH_REPO" ]; then echo "GitHub Issue: https://github.com/${GH_REPO}/issues/${ISSUE_NUMBER}"; fi)
$(if [ -n "$LABELS" ]; then echo "Labels: ${LABELS}"; fi)

## Description
$(if [ -n "$ISSUE_BODY" ]; then echo "${ISSUE_BODY}"; elif [ -n "$BODY" ]; then echo "${BODY}"; else echo "(No additional description provided.)"; fi)

## Completion
1. Implement the changes described above
2. Run validation: verify types, linting, and tests pass
3. When you have completed the task and verified it works, exit the shell cleanly (the supervisor detects completion via the Orca terminal going idle).
TASKEOF
)

      # --- Create worktree (Orca, with git worktree fallback) ---
      if command -v orca >/dev/null 2>&1 && [ -n "$ORCA_REPO_ID" ]; then
        ORCA_JSON="$(orca worktree create --repo "id:${ORCA_REPO_ID}" --name "$TASK_ID" --no-parent --setup skip --json 2>/dev/null || true)"
        if [ -n "$ORCA_JSON" ]; then
          WT_PATH="$(printf '%s' "$ORCA_JSON" | jq -r '.result.worktree.path // empty' 2>/dev/null || true)"
          ORCA_WT_ID="$(printf '%s' "$ORCA_JSON" | jq -r '.result.worktree.id // empty' 2>/dev/null || true)"
        fi
      fi
      if [ -z "$WT_PATH" ]; then
        WT_PATH="$REPO_ROOT/.worktrees/$TASK_ID"
        mkdir -p "$WT_PATH"
        if ! git worktree list | grep -q "$WT_PATH"; then
          git worktree add -q -b "$TASK_ID" "$WT_PATH" HEAD
        fi
      fi

      # --- Write task spec files ---
      # .conductor-task.md — the prompt Hermes receives
      cat > "$WT_PATH/.conductor-task.md" <<TASKEOF
${PROMPT}
TASKEOF

      # .conductor-task.json — metadata for tools to read
      cat > "$WT_PATH/.conductor-task.json" <<EOFE
{
  "bead_id":"$ID",
  "issue_type":"$ISSUE_TYPE",
  "repo":"$(basename "$REPO_ROOT")",
  "worktree":"$WT_PATH",
  "external_ref":"$EXTERNAL_REF",
  "created_at":"$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOFE

      # --- Bootstrap (install deps in worktree) ---
      BOOTSTRAP_EXIT_CODE=""
      BOOTSTRAP_LOG="/tmp/orca-bootstrap-${TASK_ID}.out"
      if [ -n "$ORCA_WT_ID" ] && [ -x "$REPO_ROOT/scripts/conductor/orca-bootstrap.sh" ]; then
        ( cd "$WT_PATH" && "$REPO_ROOT/scripts/conductor/orca-bootstrap.sh" "$WT_PATH" >"$BOOTSTRAP_LOG" 2>&1 )
        BOOTSTRAP_EXIT_CODE=$?
        echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] bootstrap exit=$BOOTSTRAP_EXIT_CODE log=$BOOTSTRAP_LOG"
      fi

      # --- Mark bead in_progress with metadata ---
      $BD_CMD update "$ID" --status=in_progress \
        --set-metadata="worktree=$WT_PATH" \
        --set-metadata="task_id=$TASK_ID" \
        --set-metadata="supervisor=firstmate-conductor" \
        --set-metadata="supervisor_version=conductor-v2" \
        --set-metadata="status=in_flight" >/dev/null 2>&1 || true

      # --- Launch agent via Orca terminal lifecycle (replaces detached hermes & + .agent-done sentinel) ---
      # T4 (sound-royale-ny-wisp-c0f.13): use Orca-native terminal create/send/wait instead of
      # (bash .run-agent.sh &) + sleep-poll on a marker file.
      AGENT_STATUS="pending"
      AGENT_RC=""
      HERMES_TERMINAL=""

      # Derive gh issue number (for orca worktree --issue) + bead id (for --comment) for the runner
      CONDUCTOR_BEAD_ID="$ID"
      CONDUCTOR_GH_ISSUE=""
      if echo "${EXTERNAL_REF:-}" | grep -qE '^gh-[0-9]+'; then
        CONDUCTOR_GH_ISSUE="${EXTERNAL_REF#gh-}"
      fi

      # Write the runner script the Orca terminal launches (launcher pattern: --text invokes
      # this file; the brief itself lives in .conductor-task.md, never inlined into --text).
      cat > "$WT_PATH/.run-agent.sh" << 'AGENTSCRIPT'
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
TASK_FILE=".conductor-task.md"
if [ ! -f "$TASK_FILE" ]; then
  echo "FATAL: $TASK_FILE not found" >&2
  echo "1" > .agent-exit-code
  exit 1
fi
if [ "${CONDUCTOR_CTO:-0}" = "1" ]; then
  SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
  if [ -x "$SCRIPT_DIR/../../scripts/conductor/dispatch.sh" ]; then
    "$SCRIPT_DIR/../../scripts/conductor/dispatch.sh" decompose "." "${CONDUCTOR_GH_ISSUE:-}" "$CONDUCTOR_BEAD_ID"
    "$SCRIPT_DIR/../../scripts/conductor/dispatch.sh" execute "."
    HERMES_RC=$?
  else
    hermes chat -q "$(cat "$TASK_FILE")" --accept-hooks
    HERMES_RC=$?
  fi
else
  hermes chat -q "$(cat "$TASK_FILE")" --accept-hooks
  HERMES_RC=$?
fi
echo "$HERMES_RC" > .agent-exit-code
exit "$HERMES_RC"
AGENTSCRIPT
      chmod +x "$WT_PATH/.run-agent.sh"

      if command -v orca >/dev/null 2>&1; then
        # Launcher pattern: tell the agent to run its task file, do NOT inline the brief.

        # pass the FILE PATH as the brief, never inline the whole prompt into --text.
        # --worktree selector needs a prefix: id:<orcaId> if we have one, else path:<fsPath>.
        WT_SEL="path:$WT_PATH"
        if [ -n "$ORCA_WT_ID" ]; then WT_SEL="id:$ORCA_WT_ID"; fi
        CREATE_JSON="$(orca terminal create --worktree "$WT_SEL" --title "$TASK_ID" --json 2>/dev/null || true)"
        HERMES_TERMINAL="$(printf '%s' "$CREATE_JSON" | jq -r '.result.terminal.handle // empty' 2>/dev/null || true)"
        if [ -z "$HERMES_TERMINAL" ]; then
          HERMES_TERMINAL="$(printf '%s' "$CREATE_JSON" | grep -oiE 'term_[a-z0-9-]+' | head -1)"
        fi

        if [ -n "$HERMES_TERMINAL" ]; then
          echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] orca terminal created: $HERMES_TERMINAL"
          # --- T5 single-lineage stitch: link bead <-> orchestration task (bd stays authoritative) ---
          ORCA_TASK_ID=""
          if command -v orca >/dev/null 2>&1; then
            TASK_JSON="$(orca orchestration task-create --spec "$ID $TITLE" --json 2>/dev/null || true)"
            ORCA_TASK_ID="$(printf '%s' "$TASK_JSON" | jq -r '.id // empty' 2>/dev/null || true)"
            if [ -z "$ORCA_TASK_ID" ]; then
              ORCA_TASK_ID="$(printf '%s' "$TASK_JSON" | grep -oiE 'task_[a-z0-9-]+' | head -1)"
            fi
            if [ -n "$ORCA_TASK_ID" ]; then
              orca orchestration dispatch --task "$ORCA_TASK_ID" --to "$HERMES_TERMINAL" --inject >/dev/null 2>&1 || true
              $BD_CMD update "$ID" --set-metadata="orca_task_id=$ORCA_TASK_ID" >/dev/null 2>&1 || true
              echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] orchestration task $ORCA_TASK_ID dispatched to $HERMES_TERMINAL"
            fi
          fi
          # Launcher pattern: tell the agent to run its task file, do NOT inline the brief.
          orca terminal send --terminal "$HERMES_TERMINAL" \
            --text "cd $(dirname "$WT_PATH"/.conductor-task.md 2>/dev/null || echo "$WT_PATH") && bash .run-agent.sh" \
            --enter --json >/dev/null 2>&1 || true
          $BD_CMD update "$ID" --set-metadata="hermes_terminal=$HERMES_TERMINAL" >/dev/null 2>&1 || true

          # Wait for the agent to go idle (replaces sleep-poll on .agent-done)
          WAIT_JSON="$(orca terminal wait --terminal "$HERMES_TERMINAL" --for tui-idle --timeout-ms $((AGENT_TIMEOUT * 1000)) --json 2>/dev/null || true)"
          if printf '%s' "$WAIT_JSON" | grep -Eq '"timed_out"[[:space:]]*:[[:space:]]*true'; then
            AGENT_STATUS="timed_out"
            echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] agent timed out after ${AGENT_TIMEOUT}s"
          else
            AGENT_STATUS="completed"
            # Read exit code written by .run-agent.sh (still used as the in-worktree signal)
            AGENT_RC="$(cat "$WT_PATH/.agent-exit-code" 2>/dev/null || echo "0")"
            echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] agent idle (rc=${AGENT_RC:-0})"
          fi
        else
          echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] orca terminal create failed — falling back to detached hermes"
          AGENT_STATUS="manual_launch_required"
        fi
      else
        echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] orca not found — manual agent launch required"
        AGENT_STATUS="manual_launch_required"
      fi

      if [ -z "${HERMES_TERMINAL:-}" ]; then
        echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] hermes not available via orca — manual agent launch required"
        AGENT_STATUS="manual_launch_required"
        $BD_CMD update "$ID" --set-metadata="hermes_terminal=manual_launch_required" >/dev/null 2>&1 || true
      fi

      # --- Verify work: Orca-native diff review ---
      # Gate A: agent exited successfully (rc=0)  [kept — cheap pre-check]
      # Gate B: worktree has actual source changes (git diff)  [kept — real change detection]
      # Gate C (log-line heuristic, ">3 lines") DROPPED: a failed agent can emit 4 setup
      #   lines and pass. Review status is now explicit (approved/revision), never inferred
      #   from log volume. See T3 (sound-royale-ny-wisp-c0f.12).
      CONDUCTOR_WORK_VERIFIED=0
      REVIEW_STATUS=""
      VERIFY_EXIT_CODE=""

      if [ "$AGENT_STATUS" = "completed" ]; then
        echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] === Verification gates ==="

        # Gate A: agent exit code
        echo "[verify] Gate A: agent exit code = ${AGENT_RC:-unknown}"
        if [ "${AGENT_RC:-}" != "0" ]; then
          echo "[verify] Gate A FAILED — agent returned non-zero ($AGENT_RC)"
        else
          echo "[verify] Gate A PASSED"
        fi

        # Gate B: actual git changes in worktree
        WORKTREE_CHANGES=""
        if git -C "$WT_PATH" rev-parse --git-dir >/dev/null 2>&1; then
          if ! git -C "$WT_PATH" diff --quiet HEAD 2>/dev/null; then
            WORKTREE_CHANGES="yes"
            echo "[verify] Gate B PASSED — worktree has uncommitted changes"
          elif [ -n "$(git -C "$WT_PATH" diff --cached --quiet HEAD 2>/dev/null || echo "staged")" ]; then
            WORKTREE_CHANGES="yes"
            echo "[verify] Gate B PASSED — worktree has staged changes"
          else
            echo "[verify] Gate B FAILED — no changes in worktree"
          fi
        else
          echo "[verify] Gate B SKIPPED — worktree is not a git repo"
        fi

        # Gate C removed — review is now explicit via Orca diff viewer + Principal annotation.
        # Surfaces changed files/hunks in the Orca review surface (review/annotate-ai-diff);
        # no dedicated orca annotate/commit subcommand exists. If Orca is unavailable,
        # fall back to git diff --stat + Serena diagnostics — NEVER the log-line heuristic.
        if command -v orca >/dev/null 2>&1; then
          echo "[verify] Opening changed files for review: orca file open-changed --worktree $WT_SEL --mode both"
          orca file open-changed --worktree "$WT_SEL" --mode both >/dev/null 2>&1 || true
          # Principal annotates the diff; revision-required => re-dispatch loop is external.
          # Default to awaiting explicit approval: REVIEW_STATUS carried from bd metadata if set.
          REVIEW_STATUS="$( $BD_CMD show "$ID" --json 2>/dev/null | jq -r '.[0].metadata.review_status // empty' 2>/dev/null || true )"
          if [ -z "$REVIEW_STATUS" ]; then
            echo "[verify] No review_status metadata — defaulting to 'pending_review' (bead NOT auto-closed)"
            REVIEW_STATUS="pending_review"
          fi
        else
          echo "[verify] orca unavailable — fallback git diff --stat:"
          git -C "$WT_PATH" diff --stat HEAD 2>/dev/null || true
          REVIEW_STATUS="pending_review"
        fi

        # Overall verdict: Gate A (rc=0) + Gate B (changes) + explicit review approval
        if [ "${AGENT_RC:-}" = "0" ] && [ "$WORKTREE_CHANGES" = "yes" ] && [ "$REVIEW_STATUS" = "approved" ]; then
          CONDUCTOR_WORK_VERIFIED=1
          echo "[verify] === ALL GATES PASSED (A + B + review approved) ==="
        else
          echo "[verify] === WORK NOT VERIFIED — rc=${AGENT_RC:-?} changed=$WORKTREE_CHANGES review=$REVIEW_STATUS ==="

          # --- Run verify_task.sh as additional signal (only if agent completed but work verification failed) ---
          if [ "${CONDUCTOR_VERIFY:-0}" = "1" ] && [ -n "$(command -v npm || true)" ]; then
            if command -v timeout >/dev/null 2>&1; then
              timeout 180s bash "$REPO_ROOT/scripts/conductor/verify_task.sh" "$REPO_ROOT" "$WT_PATH" "$TASK_ID" > "/tmp/verify-${TASK_ID}.out" 2>&1 || true
              VERIFY_EXIT_CODE=$?
            else
              bash "$REPO_ROOT/scripts/conductor/verify_task.sh" "$REPO_ROOT" "$WT_PATH" "$TASK_ID" > "/tmp/verify-${TASK_ID}.out" 2>&1 || true
              VERIFY_EXIT_CODE=$?
            fi
            if [ "$VERIFY_EXIT_CODE" -eq 124 ] || [ "$VERIFY_EXIT_CODE" = "timeout" ]; then
              echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] verify_task timed out for $TASK_ID"
              : > "/tmp/verify-${TASK_ID}.out"
            elif [ "$VERIFY_EXIT_CODE" -ne 0 ]; then
              echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] verify_task failed (rc=${VERIFY_EXIT_CODE})"
              tail -n 20 "/tmp/verify-${TASK_ID}.out" || true
            else
              echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] verify_task passed"
            fi
          fi
        fi
      elif [ "$AGENT_STATUS" = "failed" ]; then
        echo "[verify] agent failed — running verify_task.sh for diagnostics"
        if command -v timeout >/dev/null 2>&1; then
          timeout 120s bash "$REPO_ROOT/scripts/conductor/verify_task.sh" "$REPO_ROOT" "$WT_PATH" "$TASK_ID" > "/tmp/verify-${TASK_ID}.out" 2>&1 || true
          VERIFY_EXIT_CODE=$?
        fi
      fi

      # --- Resolve bead outcome ---
      if [ "$CONDUCTOR_WORK_VERIFIED" = "1" ]; then
        $BD_CMD close "$ID" --reason="verified" >/dev/null 2>&1 || true
        echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] closed bead=$ID (all verification gates passed)"
      elif [ "$AGENT_STATUS" = "completed" ] || [ "$AGENT_STATUS" = "failed" ]; then
        if [ "${CONDUCTOR_VERIFY:-0}" = "1" ] && [ "${VERIFY_EXIT_CODE:-0}" -eq 0 ]; then
          $BD_CMD close "$ID" --reason="verified" >/dev/null 2>&1 || true
          echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] closed bead=$ID (verify_task passed despite failed gates)"
        else
          $BD_CMD update "$ID" --set-metadata="conductor_status=work_verification_failed:rc=${AGENT_RC:-unknown}:changed=${WORKTREE_CHANGES:-unknown}" >/dev/null 2>&1 || true
          echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] bead=$ID work not verified, not closing"
        fi
      elif [ "$AGENT_STATUS" = "timed_out" ]; then
        $BD_CMD update "$ID" --set-metadata="conductor_status=agent_timed_out" >/dev/null 2>&1 || true
        echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] bead=$ID agent timed out, not closing"
      elif [ "$AGENT_STATUS" = "manual_launch_required" ]; then
        $BD_CMD update "$ID" --set-metadata="conductor_status=manual_launch_required" >/dev/null 2>&1 || true
        echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] bead=$ID manual launch required, not closing"
      else
        $BD_CMD update "$ID" --set-metadata="conductor_status=${AGENT_STATUS}" >/dev/null 2>&1 || true
        echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] bead=$ID agent_status=${AGENT_STATUS}, not closing"
      fi

      # --- Write trace ---
      WORKSPACE_URL=""
      if git -C "$WT_PATH" remote get-url origin >/dev/null 2>&1; then
        WORKSPACE_URL="$(git -C "$WT_PATH" remote get-url origin)"
      else
        WORKSPACE_URL="local:$WT_PATH"
      fi
      trap - EXIT
      write_trace "$ID" "$TITLE" "$TASK_ID" "$WT_PATH" "$HERMES_TERMINAL" "$WORKSPACE_URL" "$BOOTSTRAP_EXIT_CODE" "$VERIFY_EXIT_CODE" "$AGENT_STATUS" "$AGENT_RC"
      if [ "$CONDUCTOR_WORK_VERIFIED" != "1" ] && [ "${VERIFY_EXIT_CODE:-0}" -ne 0 ]; then
        exit 1
      fi
      exit 0
    )
    DISPATCH_RC=$?
    set -e
    if [ "$DISPATCH_RC" -ne 0 ]; then
      exit "$DISPATCH_RC"
    fi
    exit 0
  fi
  polls=$((polls + 1))
  sleep "$SLEEP_SEC"
done

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] no ready bead after ${polls} polls"
exit 0
