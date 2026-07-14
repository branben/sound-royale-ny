# Beads ↔ Orca Orchestration Bridge

Bridges the **Beads** (`bd`) issue tracker into the **Orca** `orchestration task-*`
state used by the Agent-School leader/cto/coo topology. This closes playbook Gap 2/3:
the Principal (Hermes cron) dispatches via `bd ready`, but nothing spawned those
beads into the leader/cto/coo Orca worktrees.

## Acceptance criteria satisfied

1. **A claimed bead produces a corresponding `orca orchestration` task under the
   correct lens worktree.** `syncToOrca()` claims the bead (`bd update --claim`),
   then creates the Orca task (`orca orchestration task-create`) under the
   routed lens worktree (cto-lens or coo-lens).
2. **Closing the bead updates the linked task status.** `closeSync()` closes the
   bead (`bd close`) AND updates the Orca task (`orca orchestration task-update
   --status completed`), so the two trackers never drift.

## Source of truth

Implementation: `src/orchestration/beadOrchestrationBridge.ts`
CLI: `src/orchestration/cli.ts`
Tests (proving regression): `src/orchestration/__tests__/beadOrchestrationBridge.test.ts`

The same mapping is mirrored in the Python conductor skill
`~/.hermes/skills/agent-school-conductor/scripts/bead_to_orca.py`.

## Lens routing

| Bead labels contain            | Routed to  |
|--------------------------------|------------|
| `github`, `pr`, `issue`, `triage`, `docs` | `coo-lens` (github-ops) |
| everything else (code/refactor/test/build) | `cto-lens` (repo-orchestrator) |

Override with `--lens cto-lens|coo-lens`.

## Status mapping

| Beads status  | Orca task status |
|---------------|------------------|
| `closed`      | `completed`      |
| `blocked`     | `blocked`        |
| `deferred`    | `pending`        |
| `open` / `in_progress` / unknown | `ready` |

## Usage

The module is pure + injectable for tests. The CLI runs under `tsx` (or any
TS runner). DRY-RUN by default; pass `--live` to actually exec `bd`/`orca`.

```bash
# Preview routing + current status mapping for a bead
tsx src/orchestration/cli.ts status --bead sound-royale-ny-vbv

# Claim + create the Orca task under the routed lens (live)
tsx src/orchestration/cli.ts sync --bead sound-royale-ny-vbv --live

# Close the bead AND mark the linked Orca task completed (live)
tsx src/orchestration/cli.ts close --bead sound-royale-ny-vbv --task <taskId> --live
```

## Verified constants

Repo id `87e2080c-59da-4b41-b392-5b6b0ddf49cd`; worktrees
`.../sound-royale-ny/{leader,cto-lens,coo-lens}` (Orca-managed, confirmed
2026-07-10 via `orca worktree list`). Change only if the topology is rebuilt.

## Guardrails

- Secrets (playerSecret, TD_API_KEY, SOUND_ROYALE_URL) NEVER appear in bead
  specs/comments/commits (E3, #135).
- This module only builds/updates Orca-side state; it does not push to main or
  merge. Per the conservative profile, commit/PR is parent-only.
