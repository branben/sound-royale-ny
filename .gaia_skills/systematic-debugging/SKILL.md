---
name: systematic-debugging
description: Root cause analysis for debugging. Use when bugs, test failures, or unexpected behavior have non-obvious causes, after multiple fix attempts have failed.
---

# Systematic Debugging

**Core principle:** Find root cause before attempting fixes. Symptom fixes are failure.

```
NO FIXES WITHOUT ROOT CAUSE INVESTIGATION FIRST
```

## Phase 1: Root Cause Investigation

**BEFORE attempting ANY fix:**

1. **Read Error Messages Carefully**
   - Read stack traces completely
   - Note line numbers, file paths, error codes
   - Don't skip warnings

2. **Reproduce Consistently**
   - What are the exact steps?
   - If not reproducible → gather more data, don't guess

3. **Check Recent Changes**
   - Git diff, recent commits
   - New dependencies, config changes
   - Environmental differences

4. **Trace Data Flow**
   - Where does bad value originate?
   - Trace up call chain until you find the source
   - Fix at source

## Phase 2: Pattern Analysis

1. **Find Working Examples** - Similar working code in codebase
2. **Compare Against References** - Read reference implementations COMPLETELY
3. **Identify Differences** - List every difference
4. **Understand Dependencies** - Components, config, environment

## Phase 3: Hypothesis and Testing

1. **Form Single Hypothesis** - "I think X is root cause because Y"
2. **Test Minimally** - SMALLEST possible change, one variable at a time
3. **Verify** - Worked → Phase 4. Didn't work → form NEW hypothesis
4. **When You Don't Know** - Say so. Don't pretend.

## Phase 4: Implementation

1. **Create Failing Test Case** - MUST have before fixing
2. **Implement Single Fix** - ONE change at a time
3. **Verify Fix** - Test passes? Other tests still pass?

## Escalation: 3+ Failed Fixes

**STOP. Question fundamentals:**
- Is this pattern fundamentally sound?
- Are we continuing through inertia?

**Discuss with human partner before more fix attempts.**

## Red Flags → STOP and Return to Phase 1

- "Quick fix for now, investigate later"
- "Just try changing X"
- "I'll skip the test"
- "Probably X"
- Proposing solutions before tracing data flow
