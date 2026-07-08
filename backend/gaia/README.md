# GAIA — ARCHIVED / REFERENCE ONLY

**Status: NOT ACTIVE.** This module is retained as a historical reference for the
early orchestration attempt (GAIA, built in Orca "gas town" per the agent-harness
pattern). It is **not** wired into any CI workflow, required status check, or app
code path.

## Why archived
- The `main` branch ruleset previously required `GAIA Integrity & Signing Check`
  and `Run GAIA guard unit tests` (integration 15368). Those checks had **no
  workflow producer**, so they blocked every PR as a phantom gate. The ruleset
  requirement was removed on 2026-07-08.
- GAIA's value was superseded by: Sourcery (code quality), Qodo (PR review),
  TestDriver (E2E), and Orca+beads (orchestration extracted from the gastown
  workflow). The `integrity_scanner.py` logic also had false positives
  (flagged any `playerSecret` mention, including dependency-array lines).

## Do not
- Do not add GAIA checks back to the `main` ruleset.
- Do not import `backend/gaia` from app or CI code.
- Do not treat `tests/gaia/` as a live gate.

## If reviving
The orchestration concept now lives in Orca + beads. Wire any eval/harness
discipline there, not as a GitHub required-status-check.
