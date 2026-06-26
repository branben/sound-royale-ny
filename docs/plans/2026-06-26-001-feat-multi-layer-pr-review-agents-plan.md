---
title: "feat: Multi-Layer PR Review Agents — OmniRoute Upgrade, Sourcery, CodeQL, Lifecycle"
type: feat
status: active
date: 2026-06-26
---

# feat: Multi-Layer PR Review Agents — OmniRoute Upgrade, Sourcery, CodeQL, Lifecycle

## Summary

Wire 4 coordinated PR review layers into the existing `sound-royale-ny` CI: upgrade the OmniRoute auto-review workflow to trigger on `pull_request` events and add a Django/Channels-aware review agent with deep knowledge of the repo's auth, WebSocket, and churn-guardrail patterns; add Sourcery as a free-tier Python-specific inline quality reviewer; enable GitHub's native CodeQL for security scanning; and create a lightweight PR lifecycle workflow that auto-labels by size, routes reviews based on changed paths, and manages stale review state.

---

## Problem Frame

PR #106 revealed gaps in the current review stack: Qodo is paused; OmniRoute only fires on push (not on PR open/synchronize); no inline review (all feedback is a general PR comment); no Python-specific or Django/Channels-aware review; no automated security scanning beyond LLM guessing. The repo has 5 documented churn drivers (#101-105) in `AGENTS.md` Active Guardrails that no current agent checks for.

---

## Requirements

- R1. OmniRoute auto-review must trigger on `pull_request: [opened, synchronize, reopened]` events, not only push
- R2. Add a Django/Channels-specific OmniRoute reviewer agent with knowledge of: channel_layer config, WebSocket consumer auth (`X-Player-Id`/`X-Player-Secret`), churn guardrails from `AGENTS.md`, Django transaction safety, async consumer patterns
- R3. Sourcery must post inline review comments on PRs (free tier for public repos, no credit card)
- R4. CodeQL default security scanning must run on PRs with SARIF upload
- R5. PR lifecycle workflow must auto-label by size (S/M/L/XL), auto-assign code owners for critical path changes (consumers.py, auth.py, models.py, health.py), and mark stale PRs after 14 days
- R6. Sourcery and CodeQL must run in parallel with the existing CI jobs; neither should block OmniRoute's synthesized review comment
- R7. All new workflows must be free-tier / included at no additional cost

---

## Scope Boundaries

- No changes to application source code (consumers, views, models, settings)
- No changes to the semantic-scan script or churn-guardrails CI job
- No external paid services — all additions use free tiers
- No GitHub Actions minutes optimization (caching, matrix) — that's a separate plan
- No changes to branch protection rules — those are managed in GitHub UI, not automation

---

## Key Technical Decisions

1. **Django agent is a prompt library, not a new script** — the existing `scripts/ci/llm_review.py` accepts arbitrary system prompts. Adding a new agent is a new `.txt` prompt file in `scripts/ci/prompts/` + a 2-line `workflow_dispatch` in the job. This reuses the existing synthesis, status, and labeling pipeline.

2. **Sourcery is configured via `sourcery.yaml` in repo root** — their GitHub App reads this. No workflow file needed. Inline comments appear as PRs checks by the `sourcery-bot` GitHub App.

3. **CodeQL uses GitHub's default `codeql-action`** — the `github/codeql-action/init` and `github/codeql-action/analyze` actions with default queries. No custom QL packs.

4. **PR lifecycle is a separate workflow** — `pr-lifecycle.yml` using `actions/labeler` v5 and `actions/stale` v8. Keeps concerns separated from the review workflows.

5. **OmniRoute import fix** — `views.py` currently has an empty line where `AllowAny` import was (after our fix). The new django agent does not import from views, so this is fine.

---

## System-Wide Impact

- **Developers**: See inline Sourcery comments on every PR (line-level). CodeQL creates SARIF alerts visible in Security tab. OmniRoute still posts one synthesized comment (unchanged behavior).
- **CI minutes**: Sourcery runs externally (no GitHub Actions minutes). CodeQL adds ~2-3 minutes per PR (GitHub-hosted runner, included). PR lifecycle is negligible (<10s).
- **PR experience**: New labels/S`, `size`, `needs-human-review`, `critical-path`) appear within seconds of PR creation. Stale PRs auto-close after 14 days of inactivity.
- **False positive management**: Sourcery quality rate can be tuned via `sourcery.yaml` `ignore:` patterns. OmniRoute findings can be dismissed with a `false-positive` label (documented in PR template).

---

## Implementation Units

### U1. OmniRoute Trigger Upgrade

**Goal:** Existing auto-review workflow fires on every PR, not just push events.

**Requirements:** R1

**Files:**
- `.github/workflows/auto-review-v2.yml`

**Approach:** Add `pull_request` trigger with event types `[opened, synchronize, reopened]`. Keep existing `push` trigger with `branches-ignore: [main, master]`. When triggered by `pull_request`, the `pr_info` step's `gh pr list --head` call still resolves the correct PR number from the branch name. The `ref: ${{_name }}` context gives the correct PR head branch on `pull_request` events, so the existing logic works without code changes — only the `on:` block changes.

**Test scenarios:**
- Creating a PR from a feature branch triggers auto-review (verifiable in Actions tab)
- Pushing a new commit to an open PR branch re-triggers auto-review
- Pushing directly to `main` does NOT trigger auto-review (existing behavior preserved)
- Running `workflow_dispatch` with a branch name still works (existing behavior preserved)

**Verification:** Create a test PR against a scratch branch; confirm OmniRoute posts synthesized review comment within 2 minutes.

---

### U2. Django/Channels-Specific Review Agent

**Goal:** Fourth OmniRoute agent that understands the repo's specific patterns, conventions, and churn drivers.

**Requirements:** R2

**Dependencies:** U1 (trigger must exist for this agent to fire)

**Files:**
- `scripts/ci/prompts/django-reviewer-prompt.txt` (new)
- `scripts/ci/write_prompts.py` (modify — add `context` parameter for domain hints)
- `.github/workflows/auto-review-v2.yml` (modify — add 4th `llm_review.py` job + findings collection step)

**Approach:** Create `django-reviewer-prompt.txt` containing a system prompt that embeds knowledge from: `AGENTS.md` Active Guardrails (5 churn drivers, MUST DO/MUST NOT rules), auth flow summary (X-Player-Id/Secret, player hashing), Django conventions (TextChoices, UUID PKs, transaction.atomic), Async consumer patterns (group_send, channel_layer, async_to_sync), anti-patterns list from `.husky/pre-commit` and `scripts/check-anti-patterns.sh`. The prompt instructs the LLM to output findings in the same JSON schema as security/quality agents so `synthesize_review.py` can merge them.

Modify `write_prompts.py` to accept an optional `context` file parameter that prepends domain-specific information to the diff context. When provided, the django agent's prompt includes churn guardrail rules alongside the diff.

Add a 4th job in `auto-review-v2.yml` that runs `llm_review.py` with the django prompt + context. Wire the output into `synthesize_review.py`'s `all_findings` collection loop (currently iterates `["security", "quality", "architecture"]` — add `"django"`).

**Patterns to follow:** Existing `write_prompts.py` structure for prompt composition; `llm_review.py` for the review call pattern; `post_review.py` for severity-based labeling.

**Test scenarios:**
- A PR introducing a bare `except:` in a consumer triggers a high-severity django finding
- A PR with `@transaction.atomic` usage does NOT trigger a django finding
- A PR touching `consumers.py` with broken WebSocket auth is flagged
- A PR with no issues gets an empty findings array (no false positives on clean code)

**Verification:** Merge the workflow change, then open a PR with a known anti-pattern (e.g., `except Exception: pass`). Confirm OmniRoute flags it with a django-agent finding in the synthesized comment.

---

### U3. Sourcery Inline Quality Review (Free Tier)

**Goal:** Sourcery posts line-level inline comments on PRs as a GitHub check.

**Requirements:** R3, R7

**Files:**
- `sourcery.yaml` (new — repo root)
- `.github/workflows/sourcery.yml` (new — minimal workflow to satisfy required checks if needed)

**Approach:** Install the Sourcery GitHub App with read-only PR access (free tier, no credit card). Create `sourcery.yaml` at repo root with:
- `ignore:` patterns to suppress known false positives (e.g., Django-generated migrations, DRF serializer `create()`/`update()` boilerplate)
- No custom rules — default Sourcery ruleset catches quality, complexity, and bug-pattern issues
- Target: `src/` and `backend/` directories

Sourcery runs as a GitHub App, so no GitHub Actions workflow is strictly required. If branch protection requires Sourcery as a status check, a minimal `sourcery.yml` workflow can act as a pass-through that always succeeds while the App posts its own check.

**Patterns to follow:** Sourcery's default configuration (zero-config for most Python repos).

**Test scenarios:**
- Open a PR with a known code smell (e.g., list comprehension that should be a generator, unused import) — Sourcery posts an inline comment on the specific line
- PR with clean code passes with no Sourcery comments
- Sourcery ignores migration files in `backend/game_engine/migrations/`

**Verification:** Open a test PR with an obvious quality issue. Confirm Sourcery-bot posts an inline comment via the GitHub Checks tab within 30 seconds.

---

### U4. CodeQL Security Scanning

**Goal:** GitHub-native security analysis runs on every PR and push to main.

**Requirements:** R4, R6, R7

**Files:**
- `.github/workflows/codeql.yml` (new)
- `.github/codeql/codeql-config.yml` (new — optional, only if default queries need tuning)

**Approach:** Use `github/codeql-action` v3 with default CodeQL analysis for Python. Workflow triggers on: `pull_request` to `main`, `push` to `main`, and `schedule` (weekly on Monday). The action's `autobuild` step handles Django without explicit build commands (Python is interpreted). No custom QL packs — default `security-extended` and `security-and-quality` query suites.

SARIF results upload via `github/codeql-action/analyze` with `upload: true`. Alerts appear in the repo's Security tab. Branch protection can optionally require CodeQL as a status check, but this is deferred to implementation-time decision (doesn't block PR merge by default).

**Test scenarios:**
- Push a PR with a known hardcoded secret — CodeQL flags it as CWE-798
- PR with SQL string concatenation (if any in codebase) flagged as CWE-89
- Clean PR passes CodeQL with zero alerts

**Verification:** Open a PR that introduces a test vulnerability. Confirm CodeQL posts an alert in Security > CodeQL within 3 minutes.

---

### U5. PR Lifecycle Workflow

**Goal:** Auto-label PRs by size, flag critical-path changes, and manage stale PRs.

**Requirements:** R5, R6, R7

**Files:**
- `.github/workflows/pr-lifecycle.yml` (new)
- `.github/labeler.yml` (new)
- `.github/pull_request_template.md` (modify — add checklist acknowledging guardrails)

**Approach:**

**`pr-lifecycle.yml`** triggers on `pull_request` `[opened, synchronize, labeled]` and `schedule` (daily cron). Contains 3 jobs:

1. **Label-size** — uses `actions/labeler@v5` with `.github/labeler.yml` rules:
   - `size/XL`: >500 lines changed
   - `size/L`: 200-500 lines
   - `size/M`: 50-200 lines
   - `size/S`: <50 lines
   - `critical-path`: any file matching `backend/game_engine/consumers.py`, `backend/game_engine/auth.py`, `backend/game_engine/models.py`, `backend/game_engine/health.py`, `backend/game_engine/urls.py`, `src/context/GameContext.tsx`
   - `needs-human-review`: when `critical-path` label is applied AND PR has >200 changed lines

2. **Stale management** — uses `actions/stale@v9` with:
   - Days-before-stale: 14
   - Days-before-close: 7 (after stale)
   - Exempt label: `pinned` or `good-first-issue`
   - Stale comment includes a human reviewer ping

3. **Guardrail acknowledgement** — checks PR body for a checkbox acknowledging churn guardrails. Posts a comment if missing. (via `peter-evans/create-or-update-comment`)

**`pull_request_template.md`** — add a checklist section at the bottom:
```markdown
## Churn Guardrails Acknowledgement
- [ ] I have read `AGENTS.md` Active Guardrails
- [ ] My change does not introduce: empty catch blocks, missing @transaction.atomic, unauthenticated endpoints, or secrets in URLs
```

**Test scenarios:**
- Open a PR touching `consumers.py` — labels `critical-path` applied automatically
- Open a PR with 600+ changed lines — labels `size/XL` and `needs-human-review` applied
- PR left untouched for 14 days gets `stale` label and bot comment
- PR with all checkboxes checked in body does not receive guardrail acknowledgement bot comment

**Verification:** Create test PRs of varying sizes and with/without critical path files. Confirm labels appear within 30 seconds of PR creation. Verify stale behavior by manually setting `updated_at` on a test PR or waiting 14 days on a stale branch.

---

## Test Plan

| Unit | File(s) | How to verify |
|------|---------|----------------|
| U1 | auto-review-v2.yml | Open PR, observe trigger |
| U2 | django-reviewer-prompt.txt, auto-review-v2.yml | Open PR with anti-pattern, check synthesized comment |
| U3 | sourcery.yaml | Open PR with code smell, check Checks tab |
| U4 | codeql.yml | Open PR with test vulnerability, check Security tab |
| U5 | pr-lifecycle.yml, labeler.yml | Open PRs of different sizes, confirm labels |

---

## Deferred to Follow-Up Work

- **Branch protection integration**: Requiring Sourcery/CodeQL/OmniRoute as mandatory status checks before merge — this requires UI configuration in GitHub branch protection rules and should be done after confirming the agents produce acceptable false-positive rates over 2 weeks
- **Custom CodeQL query pack**: Writing Django-specific QL queries for Channels auth patterns — much higher effort, deferred unless default queries prove insufficient
- **Sourcery custom rules**: Writing project-specific quality rules beyond defaults — deferred until we have data on which false positives are most annoying
- **Agent parallelism optimization**: Running Sourcery + CodeQL + OmniRoute in parallel vs. serially to reduce PR-to-feedback time — can be optimized after all agents are live

---

## Risk Analysis

| Risk | Impact | Mitigation |
|------|--------|------------|
| OmniRoute posts duplicate reviews (push + trigger) | Noise in PR thread | Add `concurrency: cancel-in-progress: true` to workflow |
| CodeQL false positives block PR merge | Developer frustration | Run CodeQL as informational first (not required check) for 2 weeks |
| Django agent hallucinates findings from embedded context | False-positive feedback | Test against 5 known-clean PRs before enabling as blocking check |
| Sourcery free tier has rate limits on large repos | Missed reviews | Monitor Sourcery check frequency; upgrade only if limits hit |
| Stale bot closes legitimate long-running PRs | Lost work | Exempt `pinned` label; stale comment is informational, close is delayed 7 days after stale |
