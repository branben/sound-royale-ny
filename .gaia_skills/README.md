# GAIA Skills

GAIA-enhanced development workflows based on [obra/superpowers](https://github.com/CodingCossack/agent-skills-library).

## Skills

This repo includes a collection of skill docs under `.gaia_skills/`.

| Skill | Description |
|-------|-------------|
| `agent-resilience` | Checkpoint-based recovery + safe retry patterns |
| `django` | Django-specific conventions and guardrails |
| `e2e-test-hygiene` | Fast debugging protocol and determinism rules for Playwright E2E work |
| `gastown-070-integration` | Integration notes for GT 0.7.0 workflows |
| `gt-mail` | Gas Town mail workflows |
| `pii-prevention` | Prevent leaking PII/secrets into commits/artifacts |
| `playwright` | Playwright E2E testing guidance |
| `polecat-operational-hygiene` | Pre-flight infrastructure checks, queue monitoring, batch file reads |
| `pr-comment-monitor` | Monitor PR comments/bot feedback (Qodo, CI) |
| `pr-errors` | PR error test suite patterns |
| `pr-hardening` | PR hygiene + safety checks |
| `rating-system` | Evaluating GAIA's Gas Town contribution |
| `react` | React/TypeScript conventions |
| `systematic-debugging` | Root cause analysis before fixing bugs |
| `test-driven-development` | Red-green-refactor methodology |
| `verification-before-completion` | Evidence-based completion claims |
| `websocket` | WebSocket/Channels conventions |

## Usage

These skills are automatically injected into GAIA polecat tasks via `SUPERPOWERS_PROMPT` in `~/gaia-polecat`.

Note: `~/gaia-polecat` is local tooling (outside this repo). The `.gaia_skills/` directory primarily serves as versioned documentation and reference.

Local GAIA/polecat tasks can run from feature branches. They do not require `main`, but default-branch CI and branch protection checks still require workflows to exist on the default branch. Avoid running GAIA orchestration from a branch where `scripts/gaia-polecat.py` has unrelated dirty changes unless the task is specifically to validate the runner.

Direct Codex sessions do not automatically inject these skills. Treat this directory as documentation unless the task is launched through `scripts/gaia-polecat.py` or the external `~/gaia-polecat` workflow.

## Adding Skills

1. Add skill content to `SUPERPOWERS_PROMPT` in `~/gaia-polecat`
2. Optionally create `.gaia_skills/{skill-name}/SKILL.md` for documentation

## Source

Based on [CodingCossack/agent-skills-library](https://github.com/CodingCossack/agent-skills-library) (MIT licensed).

## Security note

Avoid writing secrets, tokens, emails, or absolute local paths into skill docs.
