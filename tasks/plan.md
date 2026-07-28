# Implementation Plan: Fix Gaia-Gate Vitest failure (item 2) + Hermes Student capture (item 3)

## Context

`entireio/cli` (Entire) was wired into this repo as a Principal-level provenance
layer (session capture on the `entire/checkpoints/v1` branch). The gaia-gate
pre-push hook currently FAILS on branch `fix/stale-security-tests` at **Gate 3
(Vitest)** — 3 tests red, 237 pass. This blocks the pre-push gate (and therefore
Entire's snippet, which only runs after the gate passes) until resolved.

Two items were requested:
- **Item 2**: Fix the Vitest Gate 3 failures.
- **Item 3**: Capture delegated Hermes `delegate_task` Students in Entire too.

## Investigation findings (already done, read-only)

### Item 2 — Gate 3 root cause: SECURITY REGRESSION in the branch, not a harness bug

- Env checked: NO `NODE_ENV` leak in this session; `react/jsx-dev-runtime.jsxDEV`
  resolves to `function`. So this is a REAL failure, NOT the Hermes TUI
  `jsxDEV` false-positive documented in `node-typescript-test-harness`.
- 3 failing tests, all in `src/services/__tests__/api.test.ts` > `discordApi`:
  - `getAccountStatus > sends player_id and player_secret as query params`
  - `getAccountStatus > returns is_linked: false when not linked`
  - `getAccountStatusBySession > sends discord_user_id and session secret as query params`
- Source `src/services/api.ts` (lines 463, 483) does the **correct** thing:
  `api.post('/auth/discord/status/', { player_id, player_secret })` — secret in
  POST **body**.
- The branch `fix/stale-security-tests` **reverted** these 3 tests from the
  `origin/main` form (`asserts POST body, NOT URL`) back to the INSECURE form
  (`GET` with `player_secret` in the URL query string).
- This directly violates **guardrail #105** (No secrets in URL query strings;
  must use post-handshake/auth body). The branch title claims it "Fixes stale
  tests asserting pre-hardening insecure behavior" but for these 3 it did the
  OPPOSITE — it re-introduced the insecure assertion and broke the test that
  was locking the security contract.
- Same root cause family as the documented auth-contract test rot in MEMORY
  (gameSocket/discord secret moved out of URL). The SEC-1 static gate
  (`tests/testdriver/sec1-*.test.mjs`) was DELETED by this branch (see diff:
  `81 -----` / `363 ---------------------`), so the static backstop is gone too.

**Conclusion for item 2:** the correct fix is to REVERT the 3 discord tests to
the `origin/main` POST-body assertion (or re-author them to match the secure
source). Do NOT change `api.ts` (it is already correct). This restores both the
green gate AND the security guarantee.

### Item 3 — Hermes Student capture: INFEASIBLE as framed

- Entire captures sessions ONLY via the agent's own git/native hook during an
  INTERACTIVE agent session (claude-code, codex, gemini, opencode, cursor,
  copilot-cli, factoryai-droid, pi). There is NO Hermes hook and NO
  `import`/`write`/`record` CLI subcommand (`entire session --help` /
  `entire checkpoint --help` confirm only live capture + view).
- `delegate_task` Students run in isolated sessions whose transcript lives in
  the parent process, never in a shell the git hook can observe. Entire cannot
  see them.
- The checkpoint branch schema is undocumented (empty branch, no capture yet),
  so emulating the format to hand-inject Student sessions is not a supported
  path and would be reverse-engineering an unstable format.

**Conclusion for item 3:** A "Hermes hook shim" cannot feed Students into
Entire. Realistic alternatives (see Risks/Open Questions): (a) accept
Principal-level capture only; (b) build a SEPARATE, non-Entire provenance
record for Students (e.g. AgentMail thread + a JSONL log written by the
conductor after each delegation) — this does NOT integrate with `entire blame`;
(c) request an import API upstream from Entire.

## Architecture decisions

- Item 2: Treat `api.ts` as ground truth (secure). Repair the tests to match it.
  One isolated, reviewable commit (per user's separated-commit preference).
- Item 3: Scope down to a decision, not an implementation. No repo changes
  until the user picks an alternative.

## Task list (item 2 only — item 3 is a decision gate)

### Task 1: Revert getAccountStatus test to POST-body assertion
**Description:** Restore the `origin/main` form of the `getAccountStatus` test:
`http.post(...)` with `request.method === 'POST'` and `body.player_secret` /
`body.player_id` assertions (not URL query params).
**Acceptance criteria:**
- [ ] Test asserts `request.method` is `POST`.
- [ ] Test asserts `player_secret`/`player_id` present in parsed JSON body, NOT in URL.
- [ ] Test name reflects "POST body (not URL)".
**Verification:** `npx vitest run src/services/__tests__/api.test.ts` → that test green.
**Dependencies:** None
**Files:** `src/services/__tests__/api.test.ts`
**Scope:** XS (1 test block)

### Task 2: Revert getAccountStatusBySession test to POST-body assertion
**Description:** Same as Task 1 for `getAccountStatusBySession` (`discord_user_id`
+ `discord_session_secret` in POST body).
**Acceptance criteria:**
- [ ] Asserts POST + body fields, not URL query params.
**Verification:** vitest → green.
**Dependencies:** Task 1 (parallel-safe, different blocks)
**Files:** `src/services/__tests__/api.test.ts`
**Scope:** XS

### Task 3: Run full Vitest suite + gaia-gate to confirm Gate 3 green
**Description:** Execute the full frontend unit suite and the gaia-gate Gate 3
path to confirm 0 failures and no collateral breakage from the test edits.
**Acceptance criteria:**
- [ ] `npx vitest run` → 0 failed (240 passed expected).
- [ ] `bash ./scripts/gaia-gate.sh --push-ref <HEAD>` → Gate 3 passes
      (tsc + eslint + secret-scan already green; this confirms the formerly-red gate is now green).
**Verification:** gate exit 0.
**Dependencies:** Task 1, Task 2
**Files:** none (verification only)
**Scope:** S

### Checkpoint after Task 3
- [ ] All 240 unit tests pass.
- [ ] gaia-gate Gate 3 green → pre-push gate no longer blocks.
- [ ] `entire` snippet now runs on a real push (Principal sessions captured).
- [ ] Human reviews the diff (test-only change) before commit.

## Item 3 decision gate (no code until chosen)

Options to surface to user:
- **A (recommended):** Accept Principal-only capture. Students tracked via
  AgentMail threads (already the immutable bus). No Entire change.
- **B:** Add a non-Entire Student provenance log: conductor writes a JSONL
  record (bead id, student goal, summary, result, timestamp) to the repo after
  each `delegate_task` returns. Searchable, but NOT `entire blame`-linked.
- **C:** Request an `entire session import` API upstream; defer until available.

## STATUS (updated 2026-07-14)

### Item 2 — DONE, committed (unpushed), gate green
- Fixed 3 discord tests in `src/services/__tests__/api.test.ts` → secure POST-body
  assertions (reverted the branch's insecure URL-query-secret form). Committed as
  `f03889b` (test-only, isolated). `git status` shows it staged separately from the
  Entire wiring (`.husky/pre-push`) and untracked `.entire/`, `tasks/`.
- `npx vitest run` → 240 passed / 0 failed.
- `bash ./scripts/gaia-gate.sh --push-ref f03889b` → **ALL GATES PASSED** (exit 0).
  Gate 3 (Vitest) green; pre-push no longer blocks; Entire snippet now runs on push.
- NOT pushed (origin diverged; conservative profile — push needs your say).

### Item 3 — Student capture: option A chosen + HTML aggregator requested
- A: Principal-only Entire capture; Students tracked via AgentMail threads (immutable
  bus) + bookbags (JSON on disk). No Entire change.
- NEW requirement: an organized HTML view that joins each Student's **AgentMail
  thread(s)** with their **bookbag** in one place.

## Item 3 scope: `agentmail_bookbag_dashboard` (HTML aggregator)

### Investigation (read-only, done)
- Bookbags on disk: `/Users/brandonbennett/.hermes/bookbag/<bead>.json` (18 files).
  Schema per `bookbag_to_html.py`: `{bead, task, pr, github_issue, lens, ac_met[],
  files_changed[], verification, summary, blockers[]}`. Some beads are Orca-repo
  (`sawfish-reconnect-*`) or a dispatch log (`cto-dispatch-*`) — must filter to
  sound-royale-ny.
- AgentMail: MCP enabled (`AGENTMAIL_API_KEY` set). 3 inboxes:
  `luna-cto@` (13 threads), `vault-synthesis@` (1), `vault-security@` (2).
- **Join key confirmed (deterministic, no guessing):**
  - Review threads: subject `review/sound-royale-ny-<bead>` ↔ bookbag `<bead>.json`
    (matches 2wg, 1s3, mzb).
  - Handoff threads: subject `[HANDOFF] #<github_issue>` ↔ bookbag `github_issue`.
  - PR linkage: bookbag `pr` (#152/#176/#138/#139) ↔ review thread referencing that PR.
  - Unmatched threads (TEST-*, Hello, init messages) are noise → filter out.

### Proposed tool
Extend the existing `bookbag_to_html.py` (or add `agentmail_bookbag_html.py`) to:
1. Load all sound-royale-ny bookbags from `BOOKBAG_DIR`.
2. Pull threads from the 3 inboxes via AgentMail MCP (`list_threads` + `get_thread`).
3. For each bookbag, link its thread(s) by bead id / github_issue / pr.
4. Render ONE HTML dashboard: per-student card showing bookbag fields AND the
   linked AgentMail thread(s) inline (subject, sender, verdict preview, full body).
5. Cross-link: from an AgentMail review thread → its bookbag card (and vice versa).
6. Filter controls: by lens (cto/coo), by verdict, by repo (sound-royale-ny only).

### Acceptance criteria
- [ ] Running the script produces `<BOOKBAG_DIR>/dashboard.html` with every
      sound-royale-ny student showing bookbag + linked mail.
- [ ] Join is correct: a bookbag with bead `sound-royale-ny-2wg` shows the
      `review/sound-royale-ny-2wg` thread; `#6793` handoff links to its bookbag.
- [ ] Noise filtered: `sawfish-reconnect-*`, `cto-dispatch-*`, `TEST-*`, `Hello`,
      init threads NOT in the sound-royale-ny view.
- [ ] No AgentMail writes/sends — read-only aggregation.

### Verification
- [ ] Script runs clean, writes dashboard.html.
- [ ] Open dashboard.html; spot-check 2wg (bookbag + CTO review thread) and #6793
      (handoff thread + bookbag) are correctly joined.

### Risks
- `get_thread` returns full body (possibly large markdown) — render in
  `<pre>`/escaped, don't inject as HTML.
- AgentMail rate/volume: 17 threads total, trivial. No pagination risk.
- Bookbag `github_issue` is sometimes null → fall back to bead-id / pr join.

### Open question before building
- Filename: extend `bookbag_to_html.py` (add `--with-mail`) or new standalone
  `agentmail_bookbag_html.py`? (Recommend new standalone to keep the existing
  bookbag-only renderer untouched.)

## Risks and mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Branch author intended a different contract | Med | Resolved — item 2 committed, gate green. |
| Other tests on branch also reverted to insecure | Med | Resolved — grep showed only the 3 blocks; full suite 240 green. |
| Item 3 over-scoped into reverse-engineering Entire | High | Blocked earlier; option A chosen, HTML aggregator uses AgentMail MCP (supported) not Entire. |
| AgentMail thread body HTML injection | Med | Escape all thread bodies; render in `<pre>`. |

