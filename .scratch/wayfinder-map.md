# Wayfinder Map — github.com/mattpocock/skills

> Parent-owned canvas. Subagents are reconnaissance only (read-only, return text).
> Subject: Matt Pocock's agent-skills repo. Goal: understand its architecture,
> authoring format, and catalog — to extract reusable patterns for sound-royale-ny
> (which carries 100+ custom skills: ce-*, orchestration, compound-engineering).
>
> NOTE: 3 background delegates (bg_8122ed1f / F2+wayfinder, bg_10e7bc4f / F3,
> bg_396b63c6 / F4) FAILED — they got trapped in an injected mem_session_summary /
> "FIRST ACTION REQUIRED" loop and returned no usable text. All recon below was
> done by the PARENT directly (read-only gh). Delegate outputs were discarded.

## Grounded facts (parent, gh read-only)
- Repo `mattpocock/skills` — "Skills for Real Engineers", MIT, installer `skills@latest add mattpocock/skills` (skills.sh).
- Buckets under `skills/`: `engineering/` (17), `productivity/` (5, PROMOTED), `misc/` (4), `personal/` (2), `in-progress/` (7), `deprecated/` (4). 39 SKILL.md with parseable frontmatter. (An earlier recursive tree scan reported 42 — the delta is likely 3 docs/README `.md` files or frontmatter-less stubs.)
- Promoted skills must appear in top-level `README.md` + `.claude-plugin/plugin.json` + a docs page at `docs/<bucket>/<skill>.md` (published at `aihero.dev/skills-<skill>`).
- Each bucket README groups skills as **User-invoked** vs **Model-invoked**.
- `ask-matt` = ROUTER mapping user-reachable skills + flows. `writing-great-skills` = authoring guide.
- Install: `scripts/link-skills.sh` symlinks into `~/.claude/skills` + `~/.agents/skills` (git pull keeps current).
- Versioning via changesets (`.changeset`). `CONTEXT.md` defines issue-tracker / issue / triage-role ubiquitous language.

## F2 — Skill authoring anatomy (fully retrieved)
- `SKILL.md` = YAML frontmatter (`name`, `description`, optional `disable-model-invocation`) + markdown body. **Body is itself a skill** consumed by the model.
- **Invocation model** (`.agents/invocation.md`): `disable-model-invocation: true` → user-only (zero context load, surfaced only when user types its name). Omit it → model-or-user (description loaded into the model's context EVERY turn for trigger-matching). This is the primary cognitive-load control.
- **Authoring contract** (`writing-great-skills` + `.agents/writing-docs.md`):
  - Write the `description` as a one-line spec with explicit **"Use when…"** trigger clauses (the router reads it).
  - **Router-skill pattern** = the cure for 100+ skills: keep most skills user-only; a small router (ask-matt) maps triggers → skill. Lifts load off the model.
  - **Progressive disclosure**: heavy skills load `references/*.md` on demand via `topic(patterns, ...)`, `topic(pitfalls, ...)` — never dump everything into the body.
  - **Single-purpose & composable**: each skill does ONE thing; `wayfinder` itself delegates to `code-review`, `to-tickets`, `triage`, `research`.
  - **Docs contract** (`writing-docs.md`): every activity writes to a known doc path; `CONTEXT.md` is the ubiquitous-language source of truth.
- `ask-matt` router: user types `ask-matt`, picks the situation, gets routed to the right skill or flow. Mirror of our `issue-to-pr-pipeline` / AGENTS.md routing.
- `wayfinder` loop: plan work too big for one session as a **shared map of investigation tickets** on the issue tracker; resolve one ticket at a time.

## F3 — Engineering catalog (17, `skills/engineering/`)
| skill | invoked | what it does |
|---|---|---|
| ask-matt | user-only | Router over the skills in this repo |
| code-review | model-or-user | Review since a fixed point (commit/branch/tag) on Standards + Spec axes, in parallel |
| codebase-design | model-or-user | Shared vocabulary for designing deep modules |
| diagnosing-bugs | model-or-user | Diagnosis loop for hard bugs / perf regressions |
| domain-modeling | model-or-user | Build/sharpen a project's domain model |
| grill-with-docs | user-only | Relentless interview that also writes ADRs + glossary as it goes |
| implement | user-only | Implement a piece of work from a spec or tickets |
| improve-codebase-architecture | user-only | Scan for deepening opportunities → visual HTML report → grill |
| prototype | model-or-user | Throwaway prototype to answer a design question |
| research | model-or-user | Investigate against high-trust primary sources → Markdown file |
| resolving-merge-conflicts | model-or-user | Resolve in-progress git merge/rebase conflict |
| setup-matt-pocock-skills | user-only | One-shot configure: issue tracker + triage labels + doc path |
| tdd | model-or-user | Test-driven development (red-green-refactor) |
| to-spec | user-only | Turn conversation into a spec → issue tracker (no interview) |
| to-tickets | user-only | Break plan/spec into tracer-bullet tickets declaring blocking edges |
| triage | user-only | Move issues/PRs through a triage-role state machine → agent-ready briefs |
| wayfinder | user-only | Plan huge work as a map of tickets; resolve one at a time |

## F4 — Other buckets
**productivity/** (PROMOTED, 5): grill-me (user-only, interview to sharpen plan), grilling (model-or-user, grill on triggers), handoff (user-only, compact→handoff doc), teach (user-only, teach a concept), writing-great-skills (user-only, authoring reference).
**misc/** (4): git-guardrails-claude-code (model-or-user, block destructive git), migrate-to-shoehorn (model-or-user, `as`→shoehorn), scaffold-exercises (model-or-user), setup-pre-commit (model-or-user, Husky hooks).
**personal/** (2): edit-article (user-only), obsidian-vault (model-or-user).
**in-progress/** (7): claude-handoff (user-only), loop-me (user-only), setup-ts-deep-modules (user-only), wizard (user-only, bash wizard generator), writing-beats (user-only), writing-fragments (user-only), writing-shape (user-only).
**deprecated/** (4, NOT promoted): design-an-interface (model-or-user), qa (model-or-user), request-refactor-plan (model-or-user), ubiquitous-language (user-only).

**Invoked split:** user-only = 27, model-or-user = 12. Matt keeps model-reachable only for diagnostic/refactor/research skills (code-review, diagnosing-bugs, tdd, prototype, research, resolving-merge-conflicts, codebase-design, domain-modeling, grilling, git-guardrails, migrate-to-shoehorn, scaffold-exercises, setup-pre-commit, obsidian-vault) and pushes workflow/orchestration skills to user-only.

## Hypotheses (confirmed)
- H1 ✅ small/composable/single-purpose; frontmatter `description` drives trigger-matching.
- H2 ✅ `disable-model-invocation` is the user-only control (grill-me, handoff, teach, implement, to-spec, to-tickets, triage, wayfinder, ask-matt all user-only).
- H3 ✅ router (`ask-matt`) + bucket READMEs are the index — mirrors our AGENTS.md / issue-to-pr-pipeline routing.
- H4 ✅ `writing-great-skills` + `writing-docs.md` are an adoptable authoring contract.

## F5 — Synthesis: reusable patterns for sound-royale-ny
sound-royale-ny carries **100+ custom skills** (ce-*, compound-engineering, orchestration) ALL loaded into context every turn via the giant `<available_items>` list. That is exactly the cognitive-load problem Matt's repo is engineered to avoid. Highest-value transfers:

1. **Slash the always-on skill surface (Adoption: HIGH).** Set `disable-model-invocation: true` on the long tail of rarely-used custom skills; keep only a curated ~15–20 model-reachable (orchestration, diagnose, review, the routers). Cuts per-turn context from 100+ descriptions to ~20.
2. **Add a router skill (mirror `ask-matt`).** A `route-sr` skill mapping trigger phrases → the right ce-/compound-engineering skill, so the agent routes without holding every description in-window. Reuses our existing AGENTS.md routing knowledge.
3. **Progressive disclosure via `references/`.** Move the long reference blocks out of monolithic skill bodies into `references/*.md` loaded on-demand with `topic(...)`. Our skills are currently single-file monoliths.
4. **Ubiquitous-language doc.** Add a `CONTEXT.md` (or consolidate VARIABLE_LOG.md + SYSTEM_DESIGN_CHOICES.md) as the domain source of truth (producers, rounds, tiles, bingo, ELO) — Matt's `CONTEXT.md` pattern.
5. **Plan-as-tickets (wayfinder) for big migrations.** The next large initiative (e.g., the #169 e2e remediation, or the 100→20 skill-context reduction) should be modeled as a shared map of investigation/impl tickets, resolved one at a time — not one mega-PR.
6. **Authoring contract.** Adopt `writing-great-skills` rules repo-wide: every skill gets a one-line `description` with explicit **"Use when…"** triggers; workflow skills are user-only by default.
7. **One-shot setup skill.** A `setup-sound-royale-skills` (or AGENTS.md step) that wires guardrails + issue tracker + doc path idempotently — Matt's `setup-matt-pocock-skills`.

**Verdict:** sound-royale-ny's skill corpus is mature in *capability* but immature in *context hygiene*. The single highest-leverage change is #1 + #2 (context reduction via invocation flags + a router). #3–#7 are follow-on hardening.

## Evidence pointers
- TREE: `gh api repos/mattpocock/skills/git/trees/HEAD?recursive=1` → 39 SKILL.md.
- Frontmatter sweep: `/tmp/sweep.txt` (name/description/invocation per skill).
- Deep files retrieved: `productivity/writing-great-skills/SKILL.md`, `.agents/invocation.md`, `.agents/writing-docs.md`, `engineering/wayfinder/SKILL.md`, `engineering/ask-matt/SKILL.md`.
- `.claude-plugin/plugin.json` → 21 promoted registrations (16 engineering + 5 productivity).

## Status
- F1 ✅ F2 ✅ F3 ✅ F4 ✅ F5 ✅ (all parent-done; delegates discarded).
- Prior e2e CI work COMPLETE: run 29191636332 green (82 pass / 61 skip / 0 fail), commit c6f5281, issue #169 tracks remediation, PR #168 ready to merge (not merged by agent).
