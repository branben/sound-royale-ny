# Conductor Guardrails / Triage

This file governs how bounded dispatches are routed from beads to execution. It is subordinate to explicit user, repository, and orchestrator instructions.

## State Machine

Every dispatch MUST advance through these states only:
- `ready` → `dispatched` → `verified` → `closed`

Never re-dispatch the same failed delegation. Investigate locally or change scope.

## Triage Labels

Use labels to route execution path.

### parent_only (do NOT delegate)
- `auth/security`
- `performance`
- `ci/pipeline`
- `blocked`
- `unknown`

Execute directly in parent session. Report changed files, validation, proposed commands.

### delegatable
- `bug/regression`
- `refactor`
- `feature`
- `docs`
- `dependencies`

May be delegated to subagent or Orca crewmate with bounded scope.

## Pre-flight Dispatch Checklist

1. Does this task require local file reads or Serena work?
   → If yes, do NOT delegate; execute directly.
2. Does it need networked API mutations or GitHub writes?
   → If yes, parent-only; execute in this session.
3. Is there a verified subagent auth path for this operation?
   → If no, faculty executes directly.

If any check is yes and answer is no, skip delegation and continue parent execution.

## Handoff Contract

- Handoff JSON: `.agents/orchestration/handoffs/<YYYY-MM-DD>-<project>-<issue>.json`
- Trace MD: `.agents/orchestration/traces/<YYYY-MM-DD>-<project>-<issue>.md`
- Failure Registry: `.agents/orchestration/failure-registry/INDEX.md` append on failure.

## EFC Gate Thresholds

- Informativeness ≥ 0.70
- Validity ≥ 0.90
- Retention ≥ 0.80

Gate = `pass` only if all thresholds are met with real sourced evidence. Otherwise = `fail`.

## Verification Contract

- Create temp script under `/var/folders/fq/6lkw8rws7gq144cbtzfybvpm0000gn/T/` with prefix `hermes-verify-`
- Run it; do not claim full suite green from a subset.
- Label result as `ad-hoc verification`.
- If identical script yields identical result twice, state concrete blocker instead of rerunning.

## Skill/Process Discipline

- Class-level umbrella skills with `references/` for session detail.
- Strip local-only context before sharing with subagents; pass paths, not file contents.
- Surface contradictions between vault guidance and output in the trace.
- Update `.agents/orchestration/failure-registry/INDEX.md` when new failure signatures recur.

## Conductor-Specific Rules

- Supervisor MUST NOT claim a bead without actually spawning an Orca worktree.
- Supervisor MUST write `.conductor-task.json` to the worktree root before execution.
- Outcome MUST be recorded in bead metadata after execution.
- Beads are ephemeral for routine ops; ship/scout beads MUST persist until closed.
- CI+auto-review gate MUST pass before closing `ship` beads.
- Sourcery exclusions in `sourcery.yaml` apply; do not auto-review excluded paths.
