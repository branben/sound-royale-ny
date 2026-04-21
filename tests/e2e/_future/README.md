# Future E2E Tests

Tests in this directory are **deferred** — they describe features that are out of MVP scope per `docs/MVP_SCOPE.md`.

All tests here must use `test.skip(...)` so they don't run in CI but document product intent.

## When to move a test out of `_future/`

1. The feature is promoted to MVP in `docs/MVP_SCOPE.md`, AND
2. The frontend implements the feature, AND
3. The test reliably passes on the current frontend.

## When to add a test here

- The feature is DEFERRED in `docs/MVP_SCOPE.md`
- The test describes a real user flow we plan to ship eventually
- The test is not flaky for reasons unrelated to the deferred feature
