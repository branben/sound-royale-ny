# Conductor + Orca Verification + Hermes Loading Plan

Date: 2026-07-05

## Goal

1. Verify Orca worktrees after bootstrap instead of skipping verify.
2. Ensure Hermes agent actually loads inside Orca worktrees, not just the shell.

## Root Causes

### 1. Verification Skip
`supervise.sh` lines 56-58 actively skip `verify_task.sh` when `ORCA_WT_ID` is set. This was originally defensive because Orca checkouts were bare, but now `orca-bootstrap.sh` provisions toolchain. The guard is obsolete and hides real signal.

### 2. Hermes Agent Not Loading
Orca `worktree create` only creates a git checkout. It does not automatically inject the Hermes runtime into the worktree. The result is a terminal with shell access but no active agent session. This is a Orca runtime/agent provisioning gap, not a repo toolchain gap.

## Implementation Plan

### U1: Remove Orca verify skip
- File: `sound-royale-ny/scripts/conductor/supervise.sh`
- Change: remove the `if [ -n "$ORCA_WT_ID" ]; then echo "skip verify..."` branch
- Behavior: always run `verify_task.sh` after bootstrap, regardless of worktree owner
- Capture both exit codes separately: bootstrap exit + verify exit
- Log both to stdout and to `/tmp/verify-${TASK_ID}.out` and `/tmp/bootstrap-${TASK_ID}.out`
- If bootstrap fails but verify is forced, surface bootstrap failure first and mark bead `in_flight` with metadata `bootstrap_exit_code`

### U2: Add Hermes agent provisioning step
- File: `sound-royale-ny/scripts/conductor/orca-bootstrap.sh`
- Add after npm/python steps:
  - detect Hermes binary: `command -v hermes >/dev/null 2>&1`
  - if present, log `hermes found, agent runtime available`
  - if not present, log `hermes missing, agent runtime not provisioned`
- File: `sound-royale-ny/scripts/conductor/supervise.sh`
- After bootstrap, add optional agent injection if `orca` supports it:
  - try `orca terminal create --worktree "$ORCA_WT_ID" --command "hermes" --json`
  - fallback: log `manual agent launch required in worktree=$WT_PATH`
- This is bounded: does not block dispatch if agent launch fails

### U3: Bounded verification contract
- `verify_task.sh` stays as-is: bounded per-file checks, JSON report, nonzero on failure
- `supervise.sh` runs verify with explicit timeout: `timeout 90s bash verify_task.sh ...`
- Add explicit timeout to prevent the 120-210s hangs seen earlier

### U4: Outcome capture
- Update bead metadata with:
  - `bootstrap_exit_code`
  - `verify_exit_code`
  - `orca_terminal_id` if created
  - `workspace_url` if orca-ui available via `orca worktree show`
- Append result to `.agents/orchestration/traces/<date>-<project>-<issue>.md`

## Files Changed

1. `sound-royale-ny/scripts/conductor/supervise.sh`
2. `sound-royale-ny/scripts/conductor/orca-bootstrap.sh`

## Verification

1. Syntax check both scripts: `bash -n`
2. Ad-hoc verifier: syntax, wiring, green-path smoke
3. End-to-end: `CONDUCTOR_VERIFY=1 bash scripts/conductor/supervise.sh` with real ready bead
4. Inspect Orca worktree state: `orca worktree show --worktree name:<task> --json`
5. Verify Hermes agent session exists in Orca terminal list: `orca terminal list --worktree <selector> --json`

## Rollback

- Re-add the `skip verify for orca worktree` branch
- Remove hermesspecific provisioning step from bootstrap
