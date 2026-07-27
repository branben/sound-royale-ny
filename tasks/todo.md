# Task list — Gate 3 fix + Student capture scope

## Item 2: Fix gaia-gate Vitest Gate 3 (REAL regression, not harness)

- [ ] Task 1: Revert `getAccountStatus` test → POST-body assertion (src/services/__tests__/api.test.ts)
- [ ] Task 2: Revert `getAccountStatusBySession` test → POST-body assertion
- [ ] Task 3: Full `npx vitest run` + `gaia-gate.sh` Gate 3 → green; grep for sibling URL-secret regressions

### Checkpoint (after Task 3)
- [ ] 240 tests pass, Gate 3 green, pre-push no longer blocked, Entire snippet now runs on push
- [ ] Human reviews test-only diff before commit

## Item 3: Hermes Student capture in Entire — INFEASIBLE as framed

- [ ] DECISION GATE: pick A (Principal-only + AgentMail), B (separate JSONL Student log), or C (request upstream import API)
- [ ] No repo changes until chosen

## Key findings
- Item 2 root cause: branch `fix/stale-security-tests` REVERTED 3 discord tests from
  origin/main's secure POST-body assertion back to INSECURE URL-query-secret form.
  Source `api.ts` is already correct. Fix = repair tests, not source. Violates guardrail #105.
- Item 3 root cause: Entire has no `import`/`write` CLI and only captures live
  interactive agent sessions; delegated Students are invisible to it. No shim possible.
