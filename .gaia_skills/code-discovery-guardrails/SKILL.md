---
name: code-discovery-guardrails
description: Use before broad, unfamiliar, GAIA/polecat, or cross-cutting code tasks. Establishes CocoIndex for semantic discovery, rg for exact guardrails, and Serena for verified symbol navigation.
---

# Code Discovery Guardrails

> Core rule: CocoIndex finds likely areas. It does not prove truth or authorize edits.

## Mandatory Discovery Order

1. Check index health:

```bash
ccc status
```

If missing, stale, or clearly out of date:

```bash
ccc index
```

2. Use semantic discovery for concepts:

```bash
ccc search "player session and secret handling"
ccc search --lang python "title ELO calculation"
ccc search --lang typescript "leaderboard player profile heatmap"
ccc search "GAIA polecat task contract guardrails"
```

3. Use `rg` for exact checks:

```bash
rg "playerSecret|player_secret"
rg "localStorage\\.setItem\\('userSession'"
rg "as any|@ts-ignore"
```

4. Use Serena or direct file reads for exact source truth before edits:

```text
serena.get_symbols_overview(...)
serena.find_symbol(...)
serena.find_referencing_symbols(...)
```

## When This Skill Is Required

- Any task touching unfamiliar code.
- Any GAIA, polecat, Gas Town, Qodo feedback, or orchestration workflow task.
- Any cross-cutting feature involving frontend, backend, and E2E tests.
- Any security-sensitive path involving `playerSecret`, admin secrets, WebSockets, or persisted local state.

## Guardrails

- Do not edit solely from CocoIndex snippets.
- Do not copy secrets, local paths, or raw private state from search output into commits or comments.
- Keep `.cocoindex_code/`, `.serena/cache/`, `.gaia_private/`, `.beads/`, `test-results/`, and generated logs unstaged.
- Keep `rg` as the required mechanism for exact anti-pattern and secret scans.
- Keep Serena as the authoritative tool for exact symbols and references.
- RTK (`rtk`) may compress noisy shell output, but compressed output is not authoritative. Use raw commands or `rtk proxy <command>` for security reviews, final diffs, migrations, destructive operations, and suspicious failures.

## GAIA/Polecat Contract Requirements

Every queued GAIA task should include:

- A discovery query or discovery summary.
- Explicit file allowlist.
- Explicit forbidden paths.
- Skills to inject.
- Stop conditions.
- Verification commands.

If a contract lacks these fields, tighten the contract before running the executor.
