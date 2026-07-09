# Triage Labels — sound-royale-ny

The repo does NOT use the canonical 5-role label strings. The `triage` skill's state machine
(needs-evaluation → waiting-on-reporter → ready-for-agent → ready-for-human → wontfix) maps onto
the real GitHub labels as follows.

| Canonical role        | Real label(s) in this repo                         | Meaning                                  |
|----------------------|--------------------------------------------------|------------------------------------------|
| `needs-triage`       | `GAIA`, `production-readiness`                   | Maintainer needs to evaluate              |
| `needs-info`         | `question`                                       | Waiting on reporter                      |
| `ready-for-agent`    | `auto-reviewed`, `cto-repo-orchestrator`        | Fully specified, AFK-ready               |
| `ready-for-human`    | `needs-human-review`                              | Needs human implementation/review         |
| `wontfix`           | `wontfix`                                        | Will not be actioned                    |

## Additional labels in use (context, not role-mapped)
- `bug`, `enhancement`, `documentation`, `duplicate`, `invalid`, `help wanted`, `good first issue`
- `critical`, `security`, `infrastructure`, `quality` — severity/domain tags
- `auto-reviewed` / `needs-human-review` — output of the Sourcery auto-review CI
- `cto-github-ops` / `cto-repo-orchestrator` — owned by CTO automation agents
- `Review effort [1-5]` / `size/XL` — estimation hints
- `Failed compliance check` / `Possible security concern` — CI guardrail signals

## Rule
When the `triage` skill would apply a canonical role label, apply the mapped real label
instead of creating a duplicate. Do NOT create `needs-triage` etc. — they don't exist here.
