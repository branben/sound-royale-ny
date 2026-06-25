---
title: "quality: Production Churn Guardrails — Pre-commit, CI Semantic Scan, Serena Memory, AGENTS.md Rules"
type: quality
date: 2026-06-25
issues: "#101-105"
status: active
---

# Quality: Production Churn Guardrails

## Problem

The churn audit (issues #101-105) identified 5 systemic failure modes that will drive user churn at production scale. Fixing the individual issues is necessary but insufficient — without structural guardrails, the same anti-patterns will re-emerge in future work due to context rot across agent sessions.

CI currently verifies only **syntactic correctness** (types, lint, format, tests). It has no memory of *why* decisions were made and cannot detect the *semantic* re-emergence of known anti-patterns (empty catches, missing transactions, secrets in URLs). A new agent starting fresh will grep for what it knows to look for — not for what was already decided to be wrong.

This plan installs 4 guardrail layers that close the gap between "CI passes" and "production doesn't churn."

---

## Scope

**In scope:**
- Pre-commit hooks that block the 5 known anti-patterns at commit time
- CI step that scans for semantic regression of eliminated patterns
- Serena persistent memory for project guardrails (cross-session constitution)
- AGENTS.md active guardrails section (living rules tied to open issues)

**Out of scope:**
- Fixing the actual churn issues themselves (covered by #101-105)
- Rewriting CI from scratch (extends existing workflow)
- External tooling beyond what's already integrated (cocoindex, serena, engaman)
- New dependencies beyond husky (already referenced in package.json `prepare` script)

---

## Key Analysis

### Tool-to-Guardrail Mapping

| Tool | Role in this plan | Why it fits |
|------|-------------------|-------------|
| **cocoindex** | Semantic regression scan in CI | Finds by meaning, not text — catches variations of anti-patterns (e.g., `catch {}`, `catch (e) {}`, `/* TODO */` all map to "silent error") |
| **serena memory** | Persistent guardrail storage | Survives compaction and session restarts; serves as the project "constitution" that every future agent reads on session start |
| **husky** | Pre-commit hook runner | Already referenced in package.json `prepare` script but `.husky/` directory doesn't exist — needs initialization |
| **ESLint** | Static pattern blocking in hooks | Already configured; can add rules for empty catch, console-only error handling |
| **AGENTS.md** | Living guardrail section | Already the session-start canon; adding active rules ties code patterns to open issues |

### Existing Infrastructure (confirmed)

- **CI:** `.github/workflows/gaia-guards-ci.yml` — 5 jobs (django-tests, frontend-checks, e2e-smoke, e2e-full, repo-hygiene)
- **package.json:** `"prepare": "husky"` present but `.husky/` directory missing
- **ESLint:** `eslint.config.js` — minimal config, uses typescript-eslint, no custom rules yet
- **Python linting:** No `.flake8`, `pyproject.toml`, or `setup.cfg` — no Python linting exists
- **Serena:** Zero memories created yet
- **AGENTS.md:** Exists at repo root, has conventions/anti-patterns sections, no "Active Guardrails" section
- **cocoindex:** Integrated and available for semantic search
- **engram:** Integrated for session-level memory

### Anti-Patterns to Guard (from audit)

1. Empty catch blocks (`} catch {}`, `catch (e) {}` with no body)
2. Bare except (`except: pass`, `except Exception: pass`)
3. DB mutations without `@transaction.atomic`
4. `select_for_update` missing on contested rows
5. `player_secret` in URL query strings
6. WebSocket reconnect without state re-fetch
7. Audio upload without progress/validation

---

## Implementation Units

### U1. Pre-Commit Hooks — Block Known Anti-Patterns

**Goal:** Install husky pre-commit hooks that reject commits containing the silent-failure anti-patterns identified in the audit. This is the **first** layer — prevents bad code from entering the repo.

**Dependencies:** None — runs first

**Files:**
- `.husky/pre-commit` — hook entry point
- `.husky/commit-msg` — (future, defer) commit message convention check
- `scripts/check-empty-catches.sh` — shell script that greps for empty catch/except patterns
- `package.json` — already has `"prepare": "husky"`, verify it works

**Approach:**

1. Initialize husky (`npx husky init` creates `.husky/` with sample hook)
2. Create `scripts/check-empty-catches.sh` that scans staged `.ts/.tsx/.py` files for:
   - `^\s*catch\s*\(\s*\w*\s*\)\s*\{\s*\}` — empty TypeScript catch
   - `^\s*catch\s*\{\s*\}` — empty TypeScript catch (no param)
   - `^\s*except\s+(\w+\s+)?:\s*pass` — bare except pass in Python
   - `^\s*except\s+(\w+\s+)?:\s*$` — bare except with only newline
   - `console\.error\([^)]*\);\s*$` followed by no re-throw or return (heuristic)
3. Wire into `.husky/pre-commit`: run the script, fail with clear message on match
4. Add ESLint rule `"no-empty": "error"` to `eslint.config.js` (catches empty catch blocks statically)
5. Add ESLint rule `"no-console": "warn"` (console.error alone without propagation is a smell)

**Why shell script + ESLint, not just ESLint?** ESLint handles TypeScript. Python has no linter configured yet. The shell script covers both languages uniformly. Adding Python linting (ruff/flake8) is deferred — the shell script is sufficient for the 4 patterns we're guarding.

**Patterns to follow:**
- Existing `"prepare": "husky"` script in `package.json:19`
- Existing shell script pattern: `scripts/e2e-guard.sh`
- Existing CI hygiene checks in `gaia-guards-ci.yml:180-209`

**Test scenarios:**
- **Happy path:** Developer commits a file with proper error handling → hook passes
- **Edge case:** Developer commits a file with `} catch {}` → hook fails with message pointing to the line
- **Edge case:** Developer commits a Python file with `except Exception: pass` → hook fails
- **Edge case:** Developer commits a file with `console.error("msg")` as the only error handling → ESLint warns (not blocks — warning for now)
- **Error path:** Script not found → pre-commit exits 1 with informative message
- **Integration:** Developer uses `git commit -n` (no-verify) → hook is bypassed (document this escape hatch)

**Verification:** Run `npx husky` and `git commit` with a test file containing an empty catch → commit is blocked. Remove the empty catch → commit succeeds.

---

### U2. CI Semantic Regression Scan — cocoindex Churn-Driver Detection

**Goal:** Add a CI job that uses cocoindex to detect semantic re-emergence of the 5 churn-driver patterns. Unlike pre-commit hooks (which block known text patterns), this layer catches *semantic* variations — e.g., a new agent writing `catch (err) { /* TODO: handle */ }` which doesn't match a literal `catch {}` grep but is still a silent failure.

**Dependencies:** U1 (hooks catch the obvious; CI catches the clever)

**Files:**
- `.github/workflows/gaia-guards-ci.yml` — add new job `semantic-guardrails`
- `scripts/semantic-scan.sh` — wrapper that runs cocoindex queries and fails on matches

**Approach:**

1. Add a new job `semantic-guardrails` to the CI workflow that runs on pull requests
2. The job runs cocoindex search queries for each anti-pattern:
   - `"empty catch block silent error handling"` (TS)
   - `"bare except pass python"` (Py)
   - `"database save update without transaction atomic"` (Py)
   - `"websocket reconnect without state refresh"` (TS)
   - `"secret token password in url query parameter"` (TS)
3. If any query returns results, CI fails with the matching file paths
4. Threshold: 0 tolerance for the 5 critical patterns, configurable for future additions
5. Run after `frontend-checks` and `django-tests` — it's a quality gate, not a prerequisite

**Why cocoindex and not just grep?** cocoindex understands semantic similarity. A developer writing `} catch (e) { /* noop */ }` or `except Exception as e: logging.debug(e)` will be caught by semantic search but missed by literal grep patterns. This is the "clever agent" defense — when someone finds a way around the pre-commit hook, CI catches the intent.

**Patterns to follow:**
- Existing CI job structure in `gaia-guards-ci.yml:14-76`
- Existing repo-hygiene job pattern (step-based, shell commands, exit codes)
- Existing test verification pattern (grep for "collected N items")

**Test scenarios:**
- **Happy path:** PR with no anti-patterns → cocoindex returns 0 results → CI passes
- **Edge case:** PR adds `catch (err) { /* TODO */ }` → cocoindex semantic match → CI fails
- **Edge case:** PR adds `except Exception: logging.debug(e)` (technically not empty, but semantically similar) → cocoindex may flag → CI fails (good false positive)
- **Error path:** cocoindex unavailable in CI runner → job fails with informative message (not silent pass)
- **Integration:** Full PR pipeline → django-tests pass, frontend-checks pass, semantic-guardrails pass → green PR

**Verification:** Open a PR with a intentionally bad empty catch → CI semantic-guardrails job fails. Remove the catch → CI passes.

---

### U3. Serena Persistent Memory — Project Guardrails Constitution

**Goal:** Write cross-session persistent memories to serena that encode the 5 guardrail rules. These survive compaction and session restarts, serving as the "constitution" that every future agent reads before making changes. Unlike engram (session-level), serena memories are project-level and persist indefinitely until deliberately updated.

**Dependencies:** None — can run in parallel with U1/U2

**Approach:**

1. Create serena memory entries for each guardrail area using `serena write_memory`:
   - `guardrails/websocket` — "WebSocket reconnect MUST re-fetch full game state via REST API. Never rely solely on incremental updates. See issue #101."
   - `guardrails/error-handling` — "NEVER use empty catch blocks. All errors must be logged AND surfaced to the user via toast/banner. See issue #102."
   - `guardrails/database` — "All state-mutating endpoints MUST use @transaction.atomic. Contested rows (tiles, votes) MUST use select_for_update. See issue #103."
   - `guardrails/audio-upload` — "Audio uploads MUST show progress, validate file size/format client-side, support cancel/retry, and surface specific errors. See issue #104."
   - `guardrails/secrets` — "Player secrets MUST be hashed before storage. NEVER sent in URL query strings. Use Sec-WebSocket-Protocol header or post-handshake auth. See issue #105."
2. Create a `guardrails/README` memory that indexes all 5 guardrails and links to their issues
3. Future sessions will `serena read_memory("guardrails/")` on start to load all rules

**Why serena and not just AGENTS.md?** AGENTS.md is read once at session start. Serena memories are queryable mid-session ("what are the guardrails for database operations?"). They also survive across all Claude surfaces (Claude Code, Codex, Cursor) that use serena — not just this specific agent setup.

**Patterns to follow:**
- AGENTS.md existing anti-patterns section format
- Issue acceptance criteria format (specific, verifiable)

**Test scenarios:**
- **Happy path:** Agent starts new session → reads `serena read_memory("guardrails/")` → gets all 5 rules
- **Edge case:** Agent about to write empty catch → queries serena for error-handling guardrail → gets blocked
- **Edge case:** Serena unavailable → agent falls back to AGENTS.md guardrails section (U4)
- **Integration:** After U4 is written, serena memories and AGENTS.md guardrails are consistent

**Verification:** Run `serena list_memories` → see 6 entries (5 guardrails + README). Run `serena read_memory("guardrails/websocket")` → get the WebSocket rule.

---

### U4. AGENTS.md Active Guardrails Section — Living Rules Tied to Issues

**Goal:** Add an "Active Guardrails" section to AGENTS.md that encodes the 5 rules as MUST/MUST NOT directives linked to their GitHub issues. This is the **session-start** layer — the first thing any agent reads when onboarding to the repo.

**Dependencies:** U3 (serena memories should exist so AGENTS.md and serena are consistent)

**Files:**
- `AGENTS.md` — add new top-level section after "Anti-Patterns"

**Approach:**

1. Add a new `## Active Guardrails` section after the existing `## Anti-Patterns` section
2. Format each guardrail as:
   ```markdown
   ### WebSocket (issue #101)
   - MUST re-fetch full game state on WebSocket reconnect via `roomApi.getRoom()`
   - MUST NOT rely solely on incremental `game_state_update` events after reconnect
   - MUST display a "Reconnecting…" banner during reconnection window
   ```
3. Include all 5 guardrail areas with MUST/MUST NOT directives
4. Add a note: "These guardrails are living — remove when the corresponding issue closes. Serena memories at `guardrails/` contain the canonical version."
5. Add a `## Session-Start Protocol` subsection that instructs agents to:
   - Read `serena read_memory("guardrails/")` before making any code changes
   - Run `codegraph explore` on any symbol before editing it
   - Run `lsp_diagnostics` on every changed file before reporting done

**Why AGENTS.md and not just serena?** AGENTS.md is the universal entry point — every agent (even those without serena) reads it. It's the lowest common denominator. Serena is the queryable supplement.

**Patterns to follow:**
- Existing AGENTS.md `## Anti-Patterns` section format (MUST NOT directives)
- Existing AGENTS.md `## Conventions` section format (MUST directives)
- Issue reference format from existing AGENTS.md (e.g., `[#67c]`)

**Test scenarios:**
- **Happy path:** Agent reads AGENTS.md on session start → sees all 5 guardrails with issue links
- **Edge case:** Issue #101 is closed → agent removes the WebSocket guardrail from AGENTS.md
- **Edge case:** New agent without serena access → still gets guardrails from AGENTS.md
- **Integration:** Serena memories (U3) and AGENTS.md guardrails (U4) are consistent — no contradictions

**Verification:** Open AGENTS.md → find `## Active Guardrails` section → verify all 5 issues represented with MUST/MUST NOT directives.

---

## Guardrail Layer Model

```
Layer 1: Pre-commit hooks (U1)       — blocks known text patterns at commit time
Layer 2: AGENTS.md guardrails (U4)   — session-start rules every agent reads
Layer 3: Serena memory (U3)          — queryable mid-session constitution
Layer 4: CI semantic scan (U2)       — catches semantic variations hooks miss
Layer 5: CI traditional (existing)   — types, lint, tests, format
Layer 6: Post-merge monitoring       — Sentry, churn metrics (future)
```

Each layer is a safety net for the layer above. If a clever agent finds a way around U1 (pre-commit), U4 (AGENTS.md) catches it at session start. If the agent doesn't read AGENTS.md, U3 (serena) is queryable mid-session. If all three fail, U2 (CI semantic scan) catches it before merge.

---

## Deferred to Follow-Up Work

- **Python linting setup (ruff/flake8):** The shell script in U1 covers Python anti-patterns for now. A proper Python linter with `B001` (bare except) and `S608` (SQL injection) rules would be more robust but requires new dependency installation and CI setup.
- **Commit message convention hook:** Could enforce `type(scope): message` format and require issue references. Not blocking for churn prevention.
- **Post-merge Sentry alerts for churn patterns:** If error rates spike on specific endpoints, alert. Requires Sentry alert configuration.
- **Engram session-end protocol automation:** Currently manual. Could be automated with a hook but requires infrastructure.
- **cocoindex threshold tuning:** Start with 0 tolerance. May need adjustment for false positives after initial deployment.

---

## Verification (End-to-End)

After all 4 units are implemented:

1. **Pre-commit test:** `git commit` with empty catch → blocked ✓
2. **CI test:** PR with semantic anti-pattern → CI fails ✓
3. **Serena test:** `serena list_memories` → 6 guardrail entries ✓
4. **AGENTS.md test:** Open file → `## Active Guardrails` section present with all 5 issues ✓
5. **Full pipeline:** Clean PR → all CI jobs green ✓
6. **Session start test:** New agent session → reads AGENTS.md + serena memories → has full guardrail context ✓
