# CI Failure Debugging

## Trigger
Any task involving fixing red CI checks on a GitHub PR.

## Discipline

### 1. Verify Which Commit You're Actually Debugging
**Rule:** Before analyzing any CI failure, confirm the run's `headSha` matches your latest commit.

**Anti-pattern:** `gh run view <id>` → see failures → start fixing → realize the run was for the PREVIOUS commit.

**Why this happens:** GitHub Actions queues runs. If you push while a run is in progress, the new run may not appear until the old one completes. Re-running failed jobs from an old run checks out the LATEST branch code, but a brand-new workflow run for the new commit may also be queued.

**Command:**
```bash
gh run list --limit 5 --json databaseId,status,conclusion,headSha,createdAt,workflowName
```
Check `headSha[:8]` against `git rev-parse HEAD`.

### 2. Read the Actual Failure Logs, Not the Summary
GitHub's UI summary often truncates. Use:
```bash
gh run view <run-id> --log-failed | grep -E "ERROR|FAIL|AssertionError|Traceback"
```
Or for a specific job:
```bash
gh run view <run-id> --log --job <job-id> | tail -50
```

### 3. Distinguish "Your Bug" from "Pre-existing Bug"
If your fix makes a previously-hidden bug visible (e.g., Redis dependency masked test failures), the test was **already broken**.

**Decision tree:**
- Did the test pass before your changes? → Your bug, fix carefully.
- Did the test fail for a DIFFERENT reason before? → Pre-existing bug, fix or skip with reason.
- Is the failure in code you didn't touch? → Almost certainly pre-existing.

### 4. Local Reproduction Before Pushing Fixes
Don't iterate through CI. Run the failing command locally first.

**Django tests:**
```bash
DJANGO_SETTINGS_MODULE=proj.settings_test python -m pytest <path> -v --tb=short
```

**If pytest is missing in PATH**, use the full Python binary:
```bash
PYTHONPATH=.:backend ~/.pyenv/versions/<ver>/bin/python -m pytest ...
```

### 5. Common Framework Traps

#### Django REST Framework: `extra_kwargs = {"field": {"required": False}}` on `PrimaryKeyRelatedField`
DRF ModelSerializer auto-generates `PrimaryKeyRelatedField` from the model FK. Setting `required=False` via `extra_kwargs` does NOT reliably make it optional in `data` dicts. The field-level declaration works:
```python
room = serializers.PrimaryKeyRelatedField(queryset=Room.objects.all(), required=False)
```

Better yet: if the field can be inferred at validation time, just include it in test data. Changing 10 tests is often faster than fighting DRF internals.

#### DRF `validate()` vs Model Validation
DRF runs field-level validators (ChoiceField, UniqueTogether) **before** `validate()`. If your custom `validate()` expects to catch something, but DRF's built-in validator fires first, the error message and dict structure will be different.

**Fix:** Match test expectations to the ACTUAL first validator that fires, not what `validate()` would produce.

#### Django `TextChoices` is Unmockable
Django's `TextChoices` metaclass makes `.values` a read-only property. `unittest.mock.patch.object()` on it raises `AttributeError: property 'values' has no setter/deleter`.

**Fix:** Either restructure the code to accept injectable choices, or skip the test with a reason.

#### DRF ViewSet Actions Need `.request` Attribute
Instantiating a ViewSet directly (not through the router) leaves `.request` unset. Any action that calls `self.get_serializer()` or `self.get_serializer_context()` will fail with `AttributeError: 'XViewSet' object has no attribute 'request'`.

**Fix:**
```python
viewset = MyViewSet()
viewset.request = request  # Must set before calling action methods
```

#### CI PYTHONPATH Pitfalls
If tests import as `from gaia.guards_adapter import ...`, the import path is `gaia.guards_adapter`, NOT `backend.gaia.guards_adapter`. PYTHONPATH must include `backend/` as a root:
```yaml
env:
  PYTHONPATH: ".:backend"
```

### 6. Security Scan Failures in CI
When GAIA integrity checks or secret scans fail:
1. Run the exact same `git grep` / `rg` command locally to reproduce
2. Distinguish "real links" from "documentation examples"
3. If documentation legitimately references the forbidden pattern (e.g., "Avoid `file:///Users/...`"), add the doc file to the grep exclusion list in the CI workflow, OR rephrase the example to not match the regex
4. Never remove the check — make it smarter

### 7. Commit Strategy for CI Fixes
- Group related fixes in ONE commit per logical theme
- Include `[ci skip]` ONLY if you're sure — prefer letting CI validate
- After pushing, wait for the run with matching SHA to appear in `gh run list` before declaring victory

### 8. Decision: Fix vs Skip
If a pre-existing test is fundamentally wrong (asserts behavior the code never had), and fixing it requires restructuring production code:
- **Skip the test** with `pytest.mark.skip(reason=...)` documenting the mismatch
- **File a separate issue** to fix the production code
- **Do not** weaken production conditionals to make bad tests pass

### 9. Common Log Patterns and Their Meanings

| Log Pattern | Likely Cause | Quick Fix |
|---|---|---|
| `ModuleNotFoundError: No module named 'gaia'` | PYTHONPATH missing `backend/` | Add `backend` to PYTHONPATH |
| `ConnectionRefusedError: 127.0.0.1:6379` | Redis not running in CI | Use `InMemoryChannelLayer` in test settings |
| `pytest: error: unrecognized arguments: --reuse-db` | pytest-django not installed | Remove flag or install plugin |
| `E AttributeError: 'ViewSet' object has no attribute 'request'` | Direct viewset instantiation | Set `viewset.request = request` |
| `AssertionError: 500 != 200` | Exception in view code | Read full traceback, not just assert line |
| `AttributeError: property 'values' has no setter` | Mocking Django TextChoices | Skip test or restructure code |

## Verification Checklist
Before declaring CI "fixed":
- [ ] `gh run list` shows a run with `headSha` matching `git rev-parse HEAD`
- [ ] All jobs for that run show `conclusion: success`
- [ ] At least one full run completed (not just in_progress) with green status
- [ ] No `git grep` for forbidden patterns matches outside excluded docs
- [ ] Local pytest run of the same test file passes

## Anti-Patterns (Never Do)
- ❌ Fix CI by skipping tests without documenting why
- ❌ Relax production security checks to make tests pass
- ❌ Remove `set -euo pipefail` from CI workflows to hide errors
- ❌ Add `|| true` after test commands to force green status
- ❌ Iterate via CI push-and-pray instead of local reproduction
- ❌ Assume `extra_kwargs` works for DRF generated fields without testing

## Related Skills
- `systematic-debugging` — root cause analysis methodology
- `pii-prevention` — security scan conventions
- `django` — Django-specific guardrails
- `verification-before-completion` — evidence-based claims
