---
title: Two-Repo Boundary Map and Fix Plan
project: knowledge-core
type: plan
status: active
tags: [plan, school-core, sound-royale-ny, worst-day-ever, boundaries, b10, reconciliation]
ai-first: true
anchor: plan-two-repo-boundary-map
updated: 2026-08-21
---

# Two-Repo Boundary Map & Fix Plan

> **For Hermes:** execute task-by-task, TDD, one commit per task.
> Canonical home is this note. Pointer copies live in each repo's `.hermes/plans/`.
> **Context lives elsewhere — reference, do not repeat:**
> false-absence shapes → `anchor: evidence-discipline-reference`;
> the 16 bugs + root causes → `anchor: compound-school-core-pipeline-repair`;
> B8 ordering → `anchor: b8-phase2-decision`.

## The Map (worst-day-ever node table)

Schema: dimension · invariant · node · guard · **status** (`TESTED_CLEAN` / `FINDING` / `UNTESTED`). A node is never green merely because it exists; `UNTESTED` renders grey, not green.

| Node | Invariant | Guard | Status |
|---|---|---|---|
| N1.x | judge output parses ⇒ verdict may be PASS | `parse_failed` gate (`ca400aa`) | TESTED_CLEAN |
| N1.y | every float score maps to exactly one role lane | role-gate clamp (`813a838`) | TESTED_CLEAN |
| N2.1 | processed issues survive cancellation | `mark_processed` (`83deae8`) | FINDING — failure paths still never enter the set |
| N2.new | `already_satisfied` is a representable terminal outcome | **B10 — this plan** | UNTESTED |
| N3.x | silent crew bounded at 120s, not 900s | `spawn_silent` (`ecb9678`) | TESTED_CLEAN |
| N5.3 | cited commit resolves in its repo | `commit_is_reachable` (`68d7290`) | FINDING — historical commits orphaned |
| N5.4 | terminal crew statuses all recorded | `crew_ledger_reconcile.py` (`a563bb7`; alias "N10") | **FINDING — live: 93/99 unreconciled** |
| N5.5 | crew diff preserved before teardown | `capture_crew_patch` (`aae469e`) | TESTED_CLEAN |
| N6.4 | terminals/worktrees bounded per role | `worktree_bloat_guard.py` (`db83c9f`; alias "N9") | TESTED_CLEAN |
| N7.4 | gateway reachable before cycle | `gateway_preflight.py` (`75ac20c`) | TESTED_CLEAN |
| D4 AuthN/Z | *untested* | none | **UNTESTED** |
| D8 Brownfield | *untested* | none | **UNTESTED** |

Naming rule: within this doc use `N<dim>.<n>`; across repos name by invariant
(`data-integrity-crew-ledger-reconciles-with-status-files`). "N9"/"N10" are
historical aliases, carried here rather than rewritten in code (bead `school-core-1u9` cites N10).

## The Loop Being Fixed (all verified tonight)

#342 re-dispatched ~51× over 3 days. **Three independent gates fail** — fixing any one stops the waste; this plan fixes all three:

- **G1** `triage_classifier.py:37-70` has no skip rule for `school-*` labels; `fetch_issues` selects `--state open --label ready-for-agent`, so a labelled-but-open issue re-qualifies forever. *(whymage, confirmed: #342 is `OPEN` w/ `school-failed`,`ready-for-agent`)*
- **G2** the bridge's only re-dispatch guard is the processed set; failure paths never add to it, and cancelled cycles reset the runner to `board-publish`. *(whymage; `issue_bridge.py:1130/1169`)*
- **G3** "work already done" is unrepresentable — no terminal status, no label, no close. 24 crews correctly reported pre-existence with file:line evidence; nothing could consume it.

---

## TASKS

### Task 1 — G1: classifier skips school-labelled issues [school-core]
**Files:** `triage_classifier.py:37-70`; test `tests/test_triage_classifier.py`
- TDD: RED — issue labelled `school-done`/`school-failed` classifies as `ready-for-agent`.
- GREEN — Layer-1 rule: any `school-*` label ⇒ `skip-school-processed`, before all heuristics.
- Verify: `.venv/bin/python -m pytest tests/test_triage_classifier.py -q` → pass.
- Commit: `fix(triage): school-* labels remove an issue from the agent fetch set`

### Task 2 — G3: `already_satisfied` vocabulary [school-core, bead school-core-q4t]
**Files:** `crew_dispatch.py` (_poll + fallback_reason), `issue_bridge.py` (~1506 rejection block), `tests/test_crew_dispatch.py`
- Evidence rule (**phymora's correction**): accept ONLY when the crew's report verifies the NEGATIVE — the literals/artifacts the task existed to remove are absent from the base ref (e.g. `git show <base>:src/components/game/MultiRoundConfig.tsx` contains no `>= 1 && <= 10`). Positive existence (`MIN_ROUNDS` present) is insufficient — #342 is exactly that gameable shape.
- Unsupported claim ⇒ fail closed (`fallback_reason="already_satisfied_unverified"`).
- Outcome writes label `school-already-satisfied`, marks processed, leaves issue OPEN (human gate). **Skip wiring is part of this task** — a label nothing reads resurrects the loop.
- Interacts with N10: extend `TERMINAL_VERBS` to `("done","failed","already_satisfied")` and `_TERMINAL_RE` to match, plus audit test.
- Commit: `feat(crew): already_satisfied terminal outcome with negative-evidence gate`

### Task 3 — G2: persist processed on ALL exit paths [school-core]
**Files:** `issue_bridge.py` (failure/timeout/rejection paths near :1506, :1690), test `tests/test_issue_bridge.py`
- Every path that will not retry-this-cycle calls `mark_processed(num)` (or a dedicated `mark_failed_permanently`).
- RED first: simulate crew-timeout path, assert processed set contains the issue without reaching success.
- Commit: `fix(bridge): record non-retryable outcomes immediately on every path`

### Task 4 — sound-royale backend rounds validator [sound-royale-ny]
**Files:** `backend/game_engine/models.py:89` (or serializer layer per repo convention), `backend/game_engine/tests/test_room_validation.py`
- Constraint: `1 <= total_rounds <= 10`, matching frontend clamp; Django `CheckConstraint` + clean() validation.
- TDD: RED — `Room(total_rounds=9999)` raises ValidationError / DB rejects.
- Commit in sound-royale-ny: `fix(game): enforce round bounds server-side`
- NOTE: phymora ratified the *shape*, explicitly not the line numbers — implementer must open models.py first.

### Task 5 — B8 phase 2: pr_creator applies the captured patch [school-core]
**Files:** `pr_creator.py` (:437-451 content selection; :453-457 emptiness guard), `tests/test_pr_creator.py`
- If `task_result["patch_path"]` exists: apply patch server-side via Git data API (blobs per patched file), NOT response text.
- Empty-tree guard FIRST (phymora's hazard): zero-entry tree ⇒ abort, never open PR.
- Ordering per `b8-phase2-decision`. Commit: `feat(pr): PR content from the crew's captured diff`

### Task 6 — docs: node table into `docs/school-core-worst-day-ever.md` [school-core]
- Insert the map above; carry aliases ("N9 → N6.4"); do NOT rewrite code comments (bead 1u9 cites N10).
- Commit: `docs(wde): node table with tri-state coverage; aliases for N9/N10`

### Parked
- **B11** supervisor-did-not-close-crew — investigate ownership before scheduling (string absent from school-core).
- Preset array `[1,3,5,7,10]` at `MultiRoundConfig.tsx:64` — report-level follow-up (verified on origin/main; two sources agree).
- Dispatch-contract fix: briefs reference `scripts/gaia-gate.sh`, which exists locally but is **not on origin/main** — pin verify scripts to the base ref in the brief template.

## Validation
- school-core: `.venv/bin/python -m pytest tests/ -q` — baseline 2 pre-existing `TestCrewDispatchPath` failures; zero NEW failures.
- sound-royale: `npm run verify:types && npm run test:backend`.
- Live proof for Task 1–3: next School Loop cycle processes #342 exactly once, then skips.

## Risks / open questions
- Task 2 negative-evidence check needs a per-task notion of "what should be absent" — sourced from the issue body/plan; unsolvable for vague issues ⇒ falls back to fail-closed (correct behaviour).
- Classifier skip rule could suppress genuinely-reopened work ⇒ skip applies only while label present; removing the label re-admits the issue.
