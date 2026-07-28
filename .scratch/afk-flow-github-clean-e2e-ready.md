# AFK Agent Flow → Pipeline (goal: GitHub clean, E2E ready)

Date: 2026-07-15 | Author: Sisyphus | Repo: branben/sound-royale-ny

## 0. The Matt Pocock flow (installed, verified on disk)
Skills present at ~/.hermes/skills/{triage,to-spec,to-tickets,setup-matt-pocock-skills}
(openclaw-imports/ mirror also present). Disabled in runtime but readable:
- `triage`        → state machine: bug|enhancement × needs-triage|needs-info|ready-for-agent|ready-for-human|wontfix. A `ready-for-agent` issue carries an AGENT-BRIEF.
- `to-spec`       → synthesize conversation → spec, publish with `ready-for-agent` label (no interview).
- `to-tickets`    → break spec into TRACER-BULLET vertical slices, each with BLOCKED-BY edges, publish one issue per ticket (GitHub native blocking links), all `ready-for-agent`.
- `implement`     → work the frontier (tickets whose blockers are done), clearing context between tickets.

Chain: triage → to-spec → to-tickets → implement. Each ticket is agent-grabbable by construction.

## 1. The ACTUAL AFK execution layer (what is live)
TWO dispatch surfaces exist; only ONE is currently running, and it is BROKEN:

A) School Issue Bridge (LIVE but DEAD)
   - launchd job com.school.activity-server runs /Users/brandonbennett/.omniroute/school_bridge.sh every 300s
   - bridge_issues() → github_fetcher.fetch_issues() → classify_issue() keeps only state=='ready-for-agent'
   - → director.run_task() spawns a Director sub-agent, adversarial review, verification
   - ROOT CAUSE OF DEATH: launchd PATH = /usr/bin:/bin:/usr/sbin:/sbin (no /opt/homebrew/bin).
     _gh_command() calls bare `gh` → FileNotFoundError → returns None → "No actionable issues found."
     cron.log literally shows "No actionable issues found." while 6 ready-for-agent issues are OPEN.
   - Confirmed: same gh query in a normal shell returns [249,231,205,204,203,202].

B) agent-school-core conductor (PATCHABLE, not currently cron-scheduled here)
   - ~/.hermes/skills/agent-school-core (config-driven Principal loop: bd ready → bead_to_orca → CTO+COO judges → reconcile → bookbag).
   - The old cron 7efd49f400b1 pointed at the locked agent-school-conductor; must be repointed to agent-school-core if we want the Orca/bead path.
   - orca-hermes-student-dispatch documents the RELIABLE pattern (launcher script, verify-on-disk, NOT worker_done/bookbag signals).

## 2. Flow into pipeline (how a Matt Pocock ticket reaches an AFK student)
            ┌──────────────┐
            │  /triage     │  label issues (bug|enhancement × ready-for-agent)
            └──────┬───────┘
                   ▼
            ┌──────────────┐
            │  /to-spec    │  synthesize goal → spec issue (#ready-for-agent)
            └──────┬───────┘
                   ▼
            ┌──────────────┐
            │  /to-tickets │  spec → N tracer-bullet tickets, each BLOCKED-BY
            │              │  published as GitHub issues, all #ready-for-agent
            └──────┬───────┘
                   ▼
   ┌───────────────────────────────────────────────┐
   │  DISPATCH (pick ONE, fix the dead one)         │
   │   A) School bridge (launchd, 300s) — BROKEN     │
   │       fix: add /opt/homebrew/bin to launchd PATH│
   │       + `gh` abs path in _gh_command            │
   │   B) agent-school-core conductor — repoint cron │
   └───────────────────────┬───────────────────────┘
                           ▼
            ┌──────────────────────┐
            │  AFK Student agent    │  isolated worktree, implements ticket
            │  (Director / Hermes)  │  per orca-hermes-student-dispatch
            └──────────┬───────────┘
                       ▼
            ┌──────────────────────┐
            │  ADVERSARIAL + VERIFY │  CTO+COO judges; G0–G5 green gates
            │  (verify DON'T trust) │  git diff + run suite on disk
            └──────────┬───────────┘
                       ▼
            ┌──────────────────────┐
            │  PARENT session       │  commit / push / open PR (auth-only)
            │  (human-gated merge)  │  pr-merge-readiness + pr-ci-truth-check
            └──────────────────────┘

## 3. Goal: "GitHub clean, E2E ready" → ticket shape
GitHub clean  = 0 open bot/dependabot clutter, stale triage issues closed, source-kill verified.
E2E ready     = E2E Full Suite green (currently 82/143; ~60 test-debt failures tracked in #249/#169).

Tracer-bullet tickets (blocking edges top→bottom):
  01  Fix School bridge PATH (launchd) so ready-for-agent issues actually dispatch   — blocks all AFK work
  02  Close stale triage issues #202/#203/#204/#205/#231 (acceptance already met)     — None
  03  Verify TestDriver source-kill (testdriver.yml already workflow_dispatch-only)   — None
  04  Triage #249 E2E test-debt → sub-tickets (e2e, per-flow) via /to-tickets         — blocked by 01
  05  Fix empty-DB seed + VITE_API_BASE_URL in CI (root-cause of 91 "element not found") — None (parallel w/ 04)
  06  Per-flow e2e spec fixes (lobby/board/voting) — each its own ticket              — blocked by 04,05
  07  Merge 3 dependabot PRs (#128/#129/#160) after env-vs-code CI check             — None (parent-gated)
  08  E5 (#137) final CI-green verification on main                                  — blocked by 04-07

## 4. Confirmation at each step (the truth-checks)
- Triage: state==ready-for-agent AND AGENT-BRIEF present with file:line root cause (G0).
- to-tickets: BLOCKED-BY edges verified on disk (`gh issue view --json blockedBy`) — not stdout.
- Dispatch: bridge actually picks up issue (cron.log shows issue number, not "No actionable issues").
- Student done: `git -C <worktree> diff --stat` non-empty; new test exercises fix (G3/G4).
- Test ran: in-worktree `bun run test` + `npm run verify:types` green (G4).
- PR ready: `gh pr checks <N>` — any fail/error = BLOCKING, name the check (G5).
- Post-merge: `gh run list --branch main --json conclusion` (push-gated E2E-Full only runs on main).
- Merge: parent-session-only, human-gated (repo convention: merge/prod = human-only).

## 5. Blocker (must fix before any AFK flow works)
School bridge was DEAD because cron/launchd PATH lacked /opt/homebrew/bin (gh lives at
/opt/homebrew/bin/gh; git is at /usr/bin which was fine). _gh_command raised FileNotFoundError
silently → "No actionable issues found."

STATUS: FIXED 2026-07-15 (reversible, local-only, no git/gh writes).
  - school_bridge.sh: `export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"`
  - github_fetcher.py _gh_command: `gh_bin = shutil.which("gh") or "/opt/homebrew/bin/gh"`
PROOF: in env PATH=/usr/bin:/bin (broken cron env), fetch_issues('branben/sound-royale-ny')
  returned 0 BEFORE, returns 6 AFTER (#249,#231,#205,#204,#203,#202). Bridge now dispatches.

## 5b. SECONDARY blocker — RESOLVED (was misdiagnosed)
Earlier I flagged an OmniRoute 503 ALL_ACCOUNTS_INACTIVE as a hard blocker. Wrong on
both counts: (1) the 503 was a STALE log line; the local OmniRoute proxy (localhost:20128)
is UP (HTTP 200). (2) The live error was HTTP 404/503 on the `free-stack` combo, because
`gemini-2.0-flash` is no longer a valid upstream model and its `free-stack` mapping points
at a dead upstream (nvidia/llama-3.3-70b-instruct).

FIX (2026-07-15, reversible, School scheduler only — NOT sound-royale-ny):
  - executor.py COMBO_MAP: `"gemini-2.0-flash": "free-stack"` → `"auto/best-free"`
    (auto/best-free returns HTTP 200; free-stack flaps 404/503). This fixes EVERY
    gemini-2.0-flash call site (verifier, director, leaderboard, scoring) in one edit.
  - issue_bridge.py reverted to call `gemini-2.0-flash` (map is the single source of truth).
PROOF: verify_task_output() now reaches the model and returns a real verdict+score (not a
transport error). The bridge is now fully live: fetch (PATH fix) + verify (model fix) both work.

## 6. Recommended next step (single best action)
PATH fix DONE + model fix DONE. The bridge is fully live (fetch + verify both work). Next:
publish the to-tickets breakdown (A1–A6 e2e tickets as ready-for-agent; P1–P3 I run in
parent session) so the AFK flow actually executes the GitHub-clean + E2E-ready work.
