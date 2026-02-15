---
name: verification-before-completion
description: Verification discipline for completion claims. Use when about to assert success, claim a fix is complete, report tests passing, or before commits and PRs.
---

# Verification Before Completion

> **NO COMPLETION CLAIMS WITHOUT FRESH VERIFICATION EVIDENCE**

## Core Protocol

Evidence before claims, always. If you haven't run the verification command, you cannot claim it passes.

```
BEFORE any completion claim:
1. IDENTIFY: What verification command proves this claim?
2. RUN: Execute the FULL command (fresh, complete)
3. READ: Full output, check exit code, count failures
4. VERIFY: Does output confirm the claim?
   - NO → State actual status with evidence
   - YES → State claim WITH evidence
5. ONLY THEN: Make the claim
```

## Verification Requirements by Claim Type

| Claim | Required Evidence | Insufficient |
|-------|-------------------|--------------|
| Tests pass | Test output: 0 failures | Previous run, "should pass" |
| Linter clean | Linter output: 0 errors | Partial check |
| Build succeeds | Build exit code: 0 | Linter passing |
| Bug fixed | Original symptom test passes | Code changed |
| Regression test | Red-green cycle verified | Single green |

## Evidence Format

```
✅ Ran: npm test
   Exit: 0
   Result: 47 passed, 0 failed
   "All tests pass."

❌ "Tests should pass now" (no command output)
❌ "Should work" (no evidence)
```

## Red Flags — STOP

- Words: "should", "probably", "seems to"
- Satisfaction before verification: "Great!", "Done!"
- Trusting agent success reports
- Partial verification
- ANY wording implying success without verification output

## Rationalization Prevention

| Excuse | Response |
|--------|----------|
| "Should work now" | Run the verification |
| "I'm confident" | Confidence ≠ evidence |
| "Just this once" | No exceptions |
| "Linter passed" | Linter ≠ build |
| "Agent said success" | Verify independently |
