# Plan: Harness-Ready Repo (Orca auto-digest loop)

**Date:** 2026-07-08
**Method:** Compound Engineering loop (brainstorm → plan → work → simplify → review → compound)
**Goal:** Make `sound-royale-ny` digestible by an Orca pipeline that spins multiple
issues (Lilian Weng harness pattern) and auto-cleans/maintains the repo.

---

## Brainstorm — current state (post-cleanup baseline)

**Green and pushed (main `37e507c`):**
- ESLint 0 errors (`no-explicit-any` = `error`)
- tsc exit 0, vitest 241 passed, backend 25 passed
- Phantom GAIA gate removed from `main` ruleset (was blocking every PR)
- 18 `any` sites → 0; spec artifacts versioned in `docs/specs/`
- GAIA marked archived (`backend/gaia/README.md`)
- Local branches pruned 25 → 16; unique work preserved in `archive/pre-merge-unique-work`

**Open debt the harness must not trip on:**
1. Agent scratch dirs untracked and ambiguous: `.agents/`, `.claude/`, `.codex/`,
   `.ce-loop/`, `scripts/`, `data/`, `guardrails/`, `docs/` subdirs.
   Not gitignored → noise in every `git status`, confuses triage.
2. No CI gate loads `docs/specs/success-criteria.json` → "definition of done" is
   documented but not machine-checked. The 3 gaps are invisible to the pipeline.
3. `docs/specs/success-criteria.json` has 3 gaps the harness should consume as
   issues: `casual-no-voting`, `casual-no-elo`, `ranked-voting-gate`.

**Directions:**
- A: gitignore the agent scratch surfaces (local-only) OR commit them (shared).
- B: wire CI to load `success-criteria.json`, fail if `gaps.length !== 0`.
- C: seed the 3 gaps as Orca-digestible beads so the pipeline has first targets.

---

## Plan — phased, with verification gates

### Phase 1 — Resolve scratch-dir ambiguity (decision gate)
- **A1.** Decide per-dir intent:
  - `scripts/`, `data/`, `.ce-loop/` → local-only → add to `.gitignore`
  - `.agents/` → beads export is tracking layer; keep `.agents/beads` tracked,
    gitignore the rest (or commit if shared intent)
  - `.claude/`, `.codex/` → local agent config → gitignore
  - `guardrails/`, `docs/` → if harness-owned, commit; if scratch, gitignore
- **A2.** Apply `.gitignore` edits; `git status` should show only intended changes.
- **Verify:** `git status --short` clean except planned artifacts.

### Phase 2 — Close the "done" loop (CI gate)
- **B1.** Add `scripts/check-success-criteria.py` (or reuse gate runner):
  load `docs/specs/success-criteria.json`, assert every criterion
  `status === 'covered'` and `gaps.length === 0`; exit non-zero otherwise.
- **B2.** Wire into `.github/workflows/gaia-guards-ci.yml` (the real "Sound Royale CI")
  as a `definition-of-done` job, OR into `scripts/gaia-gate.sh` Gate 5.
- **Verify:** run script locally against current JSON → exits non-zero (3 gaps);
  after gaps closed → exits 0. Gate红灯 until green.

### Phase 3 — Seed harness issues (Orca digest targets)
- **C1.** For each gap in `success-criteria.json`, create a bead/issue with:
  - title, acceptance = the criterion's `tests` list, source = spec JSON path
  - label `ship`/`scout` per beads convention
- **C2.** Confirm `bd ready` returns them as dispatchable work.
- **Verify:** `bd ready` lists the 3 gaps; `bd show <id>` renders acceptance from spec.

### Phase 4 — Harness operation loop (the Orca pipeline)
Per issue, Orca runs the CE loop:
1. `/ce-brainstorm` → scope from spec criterion
2. `/ce-plan` → tiny plan, verification gate named up front
3. `/ce-work` → implement on a worktree branch
4. `/ce-simplify-code` → KISS/DRY pass
5. `/ce-code-review` → against `docs/specs/` guardrails
6. `/ce-compound` → write learning to `docs/solutions/`
- **Verify (CE discipline):** scoped tests/lint on changed paths first; baseline
  discrimination before broadening; never rerun same failing command blindly.

---

## Risks / pitfalls (from CE skill)
- Scope creep: Phase 2 should not "make whole suite green" — only the success-criteria
  gate. Baseline-discriminate any pre-existing failure.
- GAIA trap: do NOT re-add GAIA checks to the ruleset. Dead by decision.
- Scratch dirs: gitignoring wrong dir (e.g. `.agents/beads`) breaks bead tracking.
- Verify against `main` baseline before attributing failures to a change set.

## Definition of done for THIS plan
- [ ] `.gitignore` resolves all scratch-dir ambiguity (Phase 1)
- [ ] CI fails merge when `success-criteria.json` gaps exist (Phase 2)
- [ ] 3 gaps seeded as Orca-digestible beads (Phase 3)
- [ ] Harness loop documented as the standing operation mode (Phase 4)
