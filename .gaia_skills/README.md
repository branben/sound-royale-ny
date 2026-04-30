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

## Live Flow Guardrail

- `tests/e2e/live/golden-user-flow.spec.ts` is the browser-live production-flow gate for host, producer, and spectator transitions.
- Live tests that use direct API helpers are backend/API smoke coverage only.
- GAIA, Hermes, Sisyphus, and Gastown should not accept production-flow work as complete unless the golden browser-live gate passes freshly.
- Hermes should route production-flow regressions to `user-flow-live` and desktop viewport regressions to `ui-layout-live`, even when the same golden run exposes both.
- GAIA must use explicit live frontend/backend URLs for local runs and may use a writable browser cache such as `/private/tmp/ms-playwright` when the default Playwright cache is blocked.
- Sisyphus should inspect desktop screenshots for host, producer, and spectator views before accepting a browser-live fix.
- Gastown should record local runtime blockers, including stale ports and browser-cache permission failures, separately from product failures.

## Verified Identity Guardrail

- `player_secret` is not account authentication; it only authorizes room rejoin/actions.
- Global leaderboard work must use verified accounts, not room-scoped player names.
- Hermes should route impersonation issues to `auth-verified-users` or `ranked-verification-guard`, not generic E2E cleanup.
- Sisyphus should review stale local storage, protected display-name joins, and accidental player-secret exposure before accepting identity work.

## Adding Skills

1. Add skill content to `SUPERPOWERS_PROMPT` in `~/gaia-polecat`
2. Optionally create `.gaia_skills/{skill-name}/SKILL.md` for documentation

## Source

Based on [CodingCossack/agent-skills-library](https://github.com/CodingCossack/agent-skills-library) (MIT licensed).

## Security note

Avoid writing secrets, tokens, emails, or absolute local paths into skill docs.
