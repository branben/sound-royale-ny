---
name: test-driven-development
description: Red-green-refactor development methodology. Use for feature implementation, bugfixes, refactoring, or any behavior changes where tests must prove correctness.
---

# Test-Driven Development

Write test first. Watch it fail. Write minimal code to pass. Refactor.

**Core principle:** If you didn't watch the test fail, you don't know if it tests the right thing.

## The Iron Law

```
NO BEHAVIOR-CHANGING PRODUCTION CODE WITHOUT A FAILING TEST FIRST
```

Wrote code before test? Delete it completely. Implement fresh from tests.

## Red-Green-Refactor Cycle

```
RED ──► Verify Fail ──► GREEN ──► Verify Pass ──► REFACTOR ──► Next RED
```

### RED - Write Failing Test

Write one minimal test for one behavior.

**Good example:**
```typescript
test('retries failed operations 3 times', async () => {
  let attempts = 0;
  const operation = async () => {
    attempts++;
    if (attempts < 3) throw new Error('fail');
    return 'success';
  };

  const result = await retryOperation(operation);

  expect(result).toBe('success');
  expect(attempts).toBe(3);
});
```

### GREEN - Minimal Code

Write simplest code to pass the test.

**Bad example:**
```typescript
// Over-engineered beyond test requirements
async function retryOperation<T>(
  fn: () => Promise<T>,
  options?: { maxRetries?: number; backoff?: 'linear' | 'exponential'; }
): Promise<T> { /* YAGNI */ }
```

Write only what the test demands. No extra features.

## Red Flags - STOP and Start Over

- Code written before test
- Test passes immediately (testing existing behavior)
- Can't explain why test failed
- Rationalizing "just this once"

## Legacy Code (No Existing Tests)

Use characterization tests:
1. Write tests that capture current behavior
2. Run tests, observe actual outputs
3. Update assertions to match reality
4. Now you have a safety net for refactoring

## Flakiness Rules

Tests must be deterministic:
- No real sleeps → use fake timers
- No wall clock time → inject clock
- No Math.random() → seed or inject RNG
- No network calls → mock at boundary
