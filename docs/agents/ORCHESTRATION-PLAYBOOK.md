# Orchestration Playbook — naulis portable toolkit + Hermes agent network

> Master reference for how this repo works, the "dream" target, the mechanical
> edges we hunt, and how Hermes fans out trading-research work across a fleet of
> kilo/opencode agents via `acpx`. Written 2026-07-07. One source of truth; if
> it drifts from reality, trust the disk and update this file.

---

## 0. TL;DR

- Repo: `sound-royale-ny` (Django 4.2 + React 18 + WebSockets). Toolkit lives
  under `strategies/`, `core/`, `scripts/conductor/`, `data/`.
- The DREAM: ONE strategy, WR 70-75%, RR 1:1, London+NY session, 3-7 trades/session,
  prop-account ready (paper-trade first).
- The autonomous LOOP: GitHub issue → Orca "Triage" → CTO decompose → coder sub-agent
  → QA gate (pytest/vitest) → PR. Hermes supervises; never blind-trusts a sub-agent.
- The NETWORK: Hermes (orchestrator) drives kilo + opencode headlessly via `acpx`
  (Agent Client Protocol). Persistent sessions, crash-reload, one prompt queue per
  workstream.
- The IRON RULE: verify on disk, not from process exit or sub-agent prose. A sub-agent
  claiming "done" is not evidence — its exact CLI/pytest output is.

---

## 1. The Repository

### 1.1 Layout (what matters)

```
sound-royale-ny/
  strategies/        # one file per strategy; run_<name>(df, **params) entry point
  core/              # shared signal generators + replay engine (THE good pattern)
    generate_signals(df, **kwargs) -> list[SignalIntent]   # pure, causal
    canonical_replay_v2.execute_signals(...)               # replays through engine
    mentfx_structure.py  # detect_structure(): BOS / zone / bias
    causal_barrier.py    # FAIL-CLOSED lookahead guard (raises if violated)
    structural_flip.py   # post-hoc side-inversion diagnostic
    signal_intent.py     # SignalIntent dataclass
  scripts/conductor/  # orchestration shell (dispatch.sh, supervise.sh) — GITIGNORED
  data/               # runtime artifacts (cycle_verifier.jsonl, etc.)
  docs/agents/        # this file + pipeline status reports
  .gitignore          # line 72 `scripts/` — conductor tooling is intentionally ignored
```

### 1.2 The golden code pattern (copy this for new strategies)

```python
# core/<name>.py
def generate_signals(df, *, rr=1.0, **extra) -> list[SignalIntent]:
    # read ONLY bars <= signal_bar (no future). ATR via causal_atr_fill.
    # return list[SignalIntent(...)]
    ...

# strategies/<name>_native.py
def run_<name>(df, **params):
    signals = generate_signals(df, **params)
    if not signals:
        return build_nt8_scs_engine(...), {}   # empty engine, no crash
    O,H,L,C,hm,date = unpack(df)
    eng, sanity = execute_signals(O,H,L,C,hm,date, signals,
        profile="scs", session="full", com=2.0, slip_ticks=1,
        reportable=True, generate_fn=generate_signals, df=df,
        generate_kwargs=params)
    return eng, sanity
```

Registration: `registry/active.py` `_reg("name", "mod_path", "run_fn", status=...,
family=..., execution_contract="signal_intent_v2")`. Filter params by signature so
callers can pass free kwargs.

### 1.3 HGFS I/O rules — READ THIS or you will silently lose work

The worktree lives on an Orca-managed path (`/Users/brandonbennett/orca/workspaces/...`).
The share has quirks that bite agents:

| Operation | WRONG (fails silently) | RIGHT |
|---|---|---|
| Write a file | `write_file`/`echo >` via tools; `patch` on some paths | `python3 -c` with `open(...,'w')` OR Hermes `write_file` (works); for shell edits prefer `patch` tool |
| Delete a file | `python os.remove` / `bash rm` (sometimes no-op) | `mv <f> <f>.deleted && rm <f>.deleted` — rename THEN rm |
| Commit | `git add scripts/conductor/dispatch.sh` | `git add -f` (dir is gitignored at line 72) or carve `!scripts/conductor/dispatch.sh` exception |
| chmod/branch protection | assume it worked | PARTIAL: `.env`/`auth.json` sometimes resist; verify with `ls -l` |
| Path in Windows-host Python | `/z/share/...` (MSYS form) | `Z:/share/...` (drive-letter form) — MSYS→Win path translation |

The conductor `dispatch.sh` is gitignored by design. To version it, either `git add -f`
(ugly) or add to `.gitignore`:
```
scripts/
!scripts/
!scripts/conductor/
scripts/conductor/*
!scripts/conductor/dispatch.sh
```
(a bare `!scripts/conductor/dispatch.sh` after `scripts/` does NOT work — git won't
re-descend into an ignored dir; you must un-ignore the dir first).

---

## 2. The Dream (мечта)

Exact target, stated once, cited often:

> A SINGLE autonomous strategy that, on a London+NY session, places 3-7 trades,
> wins 70-75% of them (WR), at reward:risk = 1:1 (RR 1:1), survives prop-account
> evaluation, and is paper-traded before any funded capital.

Why these numbers:
- WR 70-75% @ RR 1:1 → positive expectancy even with slippage/com. Below ~60% at
  1:1 it bleeds.
- 3-7 trades/session → enough sample to be statistically meaningful per day, few
  enough to be high-conviction (not over-trading).
- London+NY → overlaps the liquid window; avoids Asia thin-flow.
- Paper-first → user is risk-averse; validate, then fund.

Current closest attempts (verified, not assumed):
- `cisd_mentfx_structural` — WR 59%, PF 2.3, TPD ~1. Strong but low trade count.
- `cisd_neo` rr=0.5 — WR 64%, but PF ~1.0 (RR too low to profit at that WR).
- `scs_sweep_v2_best` rr=4 — GO in status, high RR, but low WR.
- Oracle verdict: a single 1:1 strategy hitting 70-75% WR is NOT yet found. The
  gap is trade frequency + WR simultaneously, not either alone.

---

## 3. Mechanical Ideas — inventory & how to hunt

### 3.1 What's proven (keep, extend)

- **CISD + structural SL**: re-fetch full state on reconnect / on structure break.
  Works because it removes merge-state bugs. `cisd_mentfx_structural` is the template.
- **BOS continuation (unretested)**: `detect_structure` shows BOS-without-retest →
  70-71% WR momentum continuation; BOS-with-retest → 22-27% (fade loses). Trade ONLY
  continuation. This asymmetry is a real, reusable edge.
- **SCS (sweep of protected level)**: counter-trend entry on sweep+close-back. Edge
  lives in the "protected" qualifier — random sweeps are coinflips.
- **ReconnectingBanner / state-replace**: UI correctness, not alpha, but required for
  the live loop to not hang.

### 3.2 The oracle/diagnostic tools (use these BEFORE coding)

These live in `cli.py` and tell you if an edge exists WITHOUT writing new code:

- `python3 cli.py thought-experiment <name> --target-r N`
  Post-hoc: "what if TP was N R instead of current?" Replays each trade's MFE. Finds
  the optimal RR. If WR is fine but PF is ~1, this tells you the RR to target.
- `python3 cli.py structural-flip <name>`
  Post-hoc side inversion of completed trades. If flipped PF > baseline PF AND
  WR_base + WR_flip ≈ 100%, the signal is symmetric noise (no edge). If flipped loses,
  direction matters (real edge). Profitable flip = "build a confirmation layer", not
  "flip in place".
- `python3 cli.py analyze <name>` / `scan` — distribution/regime checks.

### 3.3 Where edges actually hide (the user's standing hypothesis)

> "Просто так альфы не существует — это комбинации сделок, а не одиночный сигнал."
> (Alpha is combinations of trades, not a single signal.)

Search strategy:
1. **Compose, don't invent.** Stack a structure gate (BOS continuation) + a timing gate
   (session window) + a volatility gate (ATR band). Each filter removes losers; the
   stack is the edge.
2. **Market structure first.** mentfx BOS, sweep-of-protected-level, thestrat sequences
   (1-2-3, 1-4, etc.) are the raw material. The strategy is the *rule for acting on*
   structure, not the structure itself.
3. **Session/regime conditioning.** The same pattern wins in London+NY, loses in Asia.
   Condition on `hm` window; don't global-fit.
4. **RR is a knob, not fate.** Use `thought-experiment` to pick RR per pattern. 1:1 is
   the dream but some patterns only work at 2:1 or 4:1 — that's fine, it's a different
   strategy, not a failure.
5. **Frequency vs WR trade-off is the whole game.** To hit 3-7 trades/session at 70% WR,
   you need MANY candidate signals filtered to high-conviction. Build the candidate
   generator wide, the filters strict.

### 3.4 How to SEARCH the codebase for prior art

```bash
# signal generators
grep -rl "generate_signals" core/
# every strategy's entry
grep -rn "def run_" strategies/
# what's been tried for a pattern
grep -rni "bos\|sweep\|cisd\|thestrat" core/ strategies/
# the oracle verdicts
ls data/cycle_verifier.jsonl   # append-only per-cycle verification records
```

---

## 4. The Orchestration Network (Hermes → acpx → kilo/opencode)

### 4.1 Why acpx (not bare `kilo run`)

`acpx` (Agent Client Protocol client) gives: persistent sessions (survive the 40-60 min
hy3 timeout that kills a single interactive session), automatic crash-reload, a prompt
queue, and multi-step flows with checkpoints. The older `kilo run`/`opencode run` is
one-shot and loses context on hang. For a durable fleet, use acpx.

### 4.2 Install + PATH

```bash
npm i -g acpx
export PATH="$HOME/.hermes/node/bin:$HOME/.kilo/bin:$HOME/.opencode/bin:$PATH"
acpx --version   # e.g. 0.12.0
```
The binary lands in the npm prefix bin (`~/.hermes/node/bin`), NOT default PATH.

### 4.3 Model formats (verified 2026-07-07)

`--model` is GLOBAL (before the subcommand). Must match the agent's advertised list.

- Kilo:   `kilo/cohere/north-mini-code:free`, `kilo/z-ai/glm-5.1`, `kilo/z-ai/glm-5.2`,
           `kilo/qwen3.6-35b-a3b`, `kilo/tencent/hy3`, `kilo/anthropic/claude-opus-4.8`
- OpenCode:`opencode-go/glm-5.1`, `opencode-go/glm-5.2`, `opencode-go/kimi-k2.7`,
           `opencode-go/deepseek-v4-flash`, `opencode/hy3-free`, `opencode/nemotron-3-ultra-free`

Kilo paid models are credit-gated (balance 0 → "Credits Required"). Free kilo works;
for serious research prefer opencode (glm-5.1/5.2 free via gateway).

### 4.4 Fan-out recipe (the network)

```bash
# one-shot probe
acpx --model "opencode-go/glm-5.1" --timeout 110 opencode exec "reply with exactly PONG"

# persistent named workstream (survives invocations, scoped per repo)
acpx --model "opencode-go/glm-5.1" -s cisd-audit opencode prompt "audit cisd_mentfx_structural for lookahead"
acpx --model "kilo/tencent/hy3"   -s scs-sweep  kilocode prompt "extend scs sweep with ATR volatility gate"

# queue without waiting
acpx --no-wait opencode prompt "next task"

# structured output for automation
acpx --format json opencode exec "review changed files" | jq -r 'select(.type=="tool_call")'
```

Spin up N workstreams (`-s <name>`) — one per strategy/idea. Each is a persistent
session. Hermes polls results, then aggregates.

### 4.5 The VERIFICATION GATE (non-negotiable)

A sub-agent is done ONLY when it returns:
- the exact CLI/pytest command it ran, and
- the exact PASS/FAIL stdout (counts, not "it works").

Hermes re-verifies on disk (re-run or `ls`/`git`) before marking the unit complete.
Do NOT advance from unit N to N+1 without the prior unit's green evidence. A sub-agent
prose claim of "uploaded successfully" is not evidence — fetch the URL / stat the file.

### 4.6 Crash resilience + watchdog

acpx reloads dead agent processes automatically. But acpx itself is a Node process — if
it dies, orchestration stops. Wrap long runs in a watchdog (launchd / hermes cron) that
restarts the flow if it hasn't checked in for N minutes. Flows persist under
`~/.acpx/flows/runs/`.

### 4.7 Lessons from THIS session (so we don't repeat)

- **"Падать" was mostly reporting bugs, not real failures.** `scs_sweep_v2_best` looked
  like it "did nothing" because my GREP FILTER ate the output (`grep '.name'` on plain
  text → error, and the loop's `grep` dropped the summary). The code was fine; my
  observation was broken. Fix: print full output, don't pipe through lossy greps.
- **Phantom docstring hook.** The "COMMENT/DOCSTRING DETECTED" banners came from Orca's
  "Triage GitHub Issues" automation (agentId `codex`) run-6, which FAILED (no provider
  configured) and never edited anything. I obeyed a hook from a dead process. Lesson:
  confirm the source of a guardrail before complying; a failed agent emits template
  noise.
- **Sub-agents lack parent auth.** `gh`/HTTP API calls from a delegated agent return
  401 (no inherited session env). Run authenticated GitHub/API work in the PARENT
  (Hermes) session, not in acpx children.
- **Never trust process exit alone.** Inspect stdout/stderr AND artifacts on disk.

---

## 5. Operating Rules

DO:
- Verify on disk. Re-run, `ls`, `git status` — trust the filesystem over prose.
- Use `generate_signals` + `execute_signals` (causal, fail-closed). Never `build_engine`
  + direct `place_order` (trips the ARCHITECTURE GUARD; the run is killed).
- Run `thought-experiment` / `structural-flip` BEFORE writing new strategy code.
- Fan out independent ideas as separate acpx workstreams; aggregate in Hermes.
- Keep `dispatch.sh`/conductor tooling local or `git add -f`; it's gitignored on purpose.

DON'T:
- Don't global-fit a pattern across sessions — condition on London+NY.
- Don't chase a single signal; compose structure + timing + volatility gates.
- Don't trust a sub-agent's "done" without its exact CLI output.
- Don't run authenticated `gh`/API calls inside acpx children.
- Don't `--admin`/force-merge against branch protection without explicit user go.

---

## 6. Open threads (as of 2026-07-07)

1. **PR #113** (fix #112 WebSocket reconnect) — OPEN, MERGEABLE, CI green. User merges
   on GitHub (branch protection = human review). Closes #112.
2. **cisd_1m_structural hardening** — `resolve_orca_worktree` added to `dispatch.sh`
   (discovers path via `orca worktree show --json`, git fallback, legacy fallback).
   Verified; gitignored. Optional `git add -f` PR.
3. **Auto-triage automation broken** — "Triage GitHub Issues" (id 6e0c0c59, agentId
   `codex`) run-6 died (no provider). Fix: give it a working provider, or switch
   agentId to a configured one, then trigger run-7 to prove ingestion works.
4. **The dream gap** — no single 1:1 strategy at 70-75% WR / 3-7 trades/session yet.
   Next hunt: compose BOS-continuation + session-window + ATR-volatility gate; use
   `thought-experiment` to set RR per pattern; measure frequency vs WR trade-off.

---

## 7. Quick-start for a future session

```bash
cd /Users/brandonbennett/sound-royale-ny
export PATH="$HOME/.hermes/node/bin:$HOME/.kilo/bin:$HOME/.opencode/bin:$PATH"

# 1. see what's alive
gh pr view 113 --json number,state,mergeable
orca automations list --json | jq '.result.automations[].name'

# 2. probe an edge without coding
python3 cli.py thought-experiment cisd_mentfx_structural --target-r 1.0
python3 cli.py structural-flip cisd_mentfx_structural

# 3. fan out the hunt
acpx --model "opencode-go/glm-5.1" -s bos-vol kilocode prompt "..."
acpx --model "kilo/tencent/hy3"     -s sess-window kilocode prompt "..."

# 4. verify before you believe
bash -n scripts/conductor/dispatch.sh && echo OK
git status --short
```
