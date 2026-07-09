# Issue Tracker — sound-royale-ny

## Primary: GitHub Issues (`gh`)
- Authoritative for issues, PRs, and CI status.
- Engineering skills (`triage`, `to-issues`, `to-prd`, `qa`) read/write here via the `gh` CLI.
- PR validity is checked against GitHub state: `gh pr view <n> --json mergeable,statusCheckRollup`.

## Secondary: beads (`bd`) — agent dispatch layer
- `bd ready` is what the Orca/Hermes autonomous loop consumes to pick up work.
- A bead is an *agent work-item* derived from (or mapped to) a GitHub issue/PR. It is NOT the source of truth for the issue itself.
- Beads live in a local Dolt DB; sync via `refs/dolt/data` on the git remote. `.beads/issues.jsonl` is a passive export (gitignored — see CI `repo-hygiene` job).

## Mapping rule
- Open a GitHub issue → optionally `bd create` a linked work-item for agent pickup.
- Close a GitHub issue/PR → `bd close` the linked item.
- Never let beads drift from GitHub: if a PR merges, its bead must close.
