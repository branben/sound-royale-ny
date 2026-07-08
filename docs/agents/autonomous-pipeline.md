# Autonomous Issue → Green Pipeline (Sound Royale)

This document defines the end-to-end pipeline from a triaged GitHub issue to a
verified, merged fix — with explicit **green gates** at every stage. It is the
operating spec for issue **#112** (WebSocket reconnect hang) but generalizes to
any `ready-for-agent` issue.

---

## Stage 0 — Issue raised & labeled (human or agent)

**Trigger:** A bug is identified (user report, code audit, guardrail violation).

**Action:**
- `gh issue create --title "..." --body "..." --label "bug,critical,production-readiness,ready-for-agent"`
- Body MUST include: symptom, root-cause location (file:line), expected behavior,
  acceptance criteria, and the guardrail ID it violates.

**Green gate (G0):** Issue exists with `ready-for-agent` label and a reproducible
root cause + acceptance criteria. → `gh issue view <n>` confirms.

---

## Stage 1 — Orca ingests issue → creates bead

**Action (orchestrator / agent):**
```bash
# Orca pulls the issue context
orca <issue-ingest> 112          # implementation-specific; or manual:
gh issue view 112 --comments
```
Orca creates a **bead** (a tracked unit of agent work) linked to issue #112.
The bead carries: issue number, acceptance criteria, guardrail refs, target repo.

**Green gate (G1):** A bead exists, linked to issue #112, with the 5 acceptance
criteria from the issue body copied into the bead's task definition.

---

## Stage 2 — Real Orca worktree (dispatch.sh `create_orca_worktree`)

**Action:** The conductor calls dispatch.sh, which now creates a **genuine git
worktree** via `orca worktree create` (fix shipped this session):

```bash
bash scripts/conductor/dispatch.sh orchestrate 112-websocket-reconnect \
  /path/to/issue-112-task.md
```

This:
1. Creates `/Users/brandonbennett/orca/workspaces/sound-royale-ny/112-websocket-reconnect`
   (real `git worktree` — verified by `.git` file + `git worktree list`).
2. Copies the task file in as `.conductor-task.md`.
3. Runs CTO decomposition → `.sub-tasks.json`.
4. Executes sub-agents inside the isolated worktree.

**Green gate (G2):** `git worktree list` shows the new worktree with its own
branch `branben/112-websocket-reconnect`, and `.conductor-task.md` + `.sub-tasks.json`
exist inside it. Sub-agents CANNOT touch the main checkout.

---

## Stage 3 — Agents spawned & implement

**Sub-agents (from `.sub-tasks.json`):**

| id | profile | task |
|----|---------|------|
| sub-task-1 | coder | Implement `onConnect` re-fetch in `GameContext.tsx`: call `roomApi.getRoom(roomCode)`, **replace** `gameState` (not merge) |
| sub-task-2 | coder | Wire `ReconnectingBanner` visibility to disconnect/reconnect lifecycle in `gameSocket.ts` + `GameContext.tsx` |
| sub-task-3 | coder | Add vitest case in `GameContext.reconnect.test.tsx` asserting `getRoom` called on `onConnect` + state replaced |

**Guardrails enforced during implementation:**
- No `as any` / `@ts-ignore` (CI-enforced)
- No empty catch / bare `except` (guardrail #102)
- Follow existing `roomApi.getRoom` + `ReconnectingBanner` patterns

**Green gate (G3):** All three sub-agent logs non-empty AND code changes present
in the worktree (`git diff --stat` shows edits to the 3 target files).

---

## Stage 4 — Verification (the real green)

**Run inside the worktree:**
```bash
cd /Users/brandonbennett/orca/workspaces/sound-royale-ny/112-websocket-reconnect
npm run verify:types          # tsc --noEmit
npm run test                  # vitest — MUST include new reconnect test passing
npm run lint                  # eslint
```

**Green gate (G4) — the decisive one:**
- `npm run test` passes, specifically the new reconnect test proves
  `roomApi.getRoom` is invoked on `onConnect` and `gameState` is **replaced**.
- `npm run verify:types` clean.
- No console-error-only error handling introduced.

> Note: the health-endpoint episode taught us that "agent produced a log" ≠
> "work is correct." G4 is verified by **running the test suite**, not by
> reading sub-agent output.

---

## Stage 5 — PR opened & merged

**Action:**
```bash
gh pr create --title "fix(#112): re-fetch full game state on WS reconnect" \
  --body "Closes #112" --base main
```
CI must pass. Reviewer (human or `ce-code-review`) confirms G4 evidence.

**Green gate (G5):** PR open, CI green, linked to #112, issue auto-closed on merge.

---

## Global Green Definition (all stages must hold)

| Gate | What proves it |
|------|----------------|
| G0 | Issue #112 labeled `ready-for-agent`, has root cause + acceptance criteria |
| G1 | Bead linked to #112 with copied acceptance criteria |
| G2 | Real git worktree exists (isolated), task files present |
| G3 | Sub-agent logs non-empty + diff shows target-file edits |
| G4 | **Test suite passes** including new reconnect test; types clean |
| G5 | PR open + CI green + issue closed |

**The pipeline is GREEN only when G0–G5 all pass.** Anything less is YELLOW
(in-progress) or RED (blocked — e.g., test fails, guardrail violated).

---

## Anti-pattern this spec prevents
Prior session claimed "hermes created the health endpoint" but never ran the
tests. This pipeline makes **G4 (running tests) mandatory and non-skippable** —
agent output is evidence of attempt, not of success.
