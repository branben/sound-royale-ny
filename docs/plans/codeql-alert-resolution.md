# CodeQL Alert Resolution — PR #369

## Summary
Resolved all 23 CodeQL alerts on the `fix/ci-pnpm-workflow-order` branch using compound engineering methodology (brainstorm → plan → work → verify → compound).

## Root Cause
The 23 alerts originated from PR #368 commits (WS double-accept fix + upload fix + T1-T4 regression tests), not from PR #369's CI infrastructure changes. The primary root cause was a **massive accidental duplication** in `backend/game_engine/views.py`: a 1905-line block (lines 540–2444) containing 4 ViewSet class definitions that were byte-identical to their later counterparts (lines 2902+).

## Alert Breakdown

| Alert Type | Count | Fix | Files |
|---|---|---|---|
| `py/multiple-definition` | 4 | Deleted duplicate ViewSet class block | `views.py` |
| `py/repeated-import` | 3 | Deleted duplicate import block | `views.py` |
| `py/log-injection` | 2 | Added `_sanitize_log()` for user-controlled name fields | `views.py` |
| `py/stack-trace-exposure` | 1 | Generic error message instead of `str(e)` | `views.py` |
| `py/empty-except` | 2 | Added `logger.debug(...)` to CancelledError handlers | `views.py` |
| `py/unused-local-variable` | 2 | Removed `original_status` (dead variable) | `views.py` |
| `py/unused-import` | 4 | Removed unused imports (`groupby`, `BytesIO`, `InMemoryChannelLayer`, `transaction`, `uuid`, `random`, `ProtectedError`) | `views.py`, `consumers.py`, `test_*.py` |
| `py/bind-socket-all-network-interfaces` | 1 | Changed `bind(("", 0))` → `bind(("127.0.0.1", 0))` | `test_real_daphne_handshake.py` |
| `py/uninitialized-local-variable` | 1 | N/A (false positive — `frames` is used within inner function scope) | `test_real_daphne_handshake.py` |
| `py/unused-local-variable` (test coupling) | 1 | Updated test assertion to match generic 400 message | `test_transaction_safety.py` |

## Files Changed

### `backend/game_engine/views.py`
- Deleted 1905-line duplicate class block (CodeQL's `multiple-definition` + `repeated-import` root cause)
- Removed unused `from itertools import groupby` import
- Added `_sanitize_log()` helper to strip control chars from user-controlled log data
- Applied `_sanitize_log()` to voter name, voted_for name, winner name in audit logs
- Replaced `{"error": str(e)}` with generic error message in `reset_game`
- Added explicit logger.debug to `except asyncio.CancelledError` handlers
- Removed dead `original_status` variable assignment
- Added module docstring

### `backend/game_engine/consumers.py`
- Removed unused top-level `from django.db import transaction` (local import still present)

### `backend/game_engine/test_play_tile_bingo.py`
- Removed unused `from io import BytesIO` import

### `backend/game_engine/test_real_daphne_handshake.py`
- Removed unused `from channels.layers import InMemoryChannelLayer` import
- Changed `s.bind(("", 0))` → `s.bind(("127.0.0.1", 0))` to harden against bind-socket-all-interfaces alert

### `backend/game_engine/test_ws_auth_broadcast.py`
- Added `logging` import
- Changed empty `except Exception: pass` to `except Exception as exc: logging.debug(...)` 

### `backend/game_engine/test_transaction_safety.py`
- Removed unused `from django.db.models import ProtectedError` (double-line cleanup)
- Removed unused `import random`
- Updated assertion to match generic 400 message (no leaked internal error detail)

## Verification
- Backend test suite: **225 passed, 2 skipped, 0 failed**
- All files parse cleanly (AST validation)
- Merge conflicts resolved on branch (3 files: `test_play_tile_bingo.py`, `test_real_daphne_handshake.py`, `views.py`)
- Branch push triggered CodeQL Security Analysis — **0 open alerts** on `refs/heads/fix/ci-pnpm-workflow-order`
- All CI workflow jobs queued/running successfully

## Compound Engineering Notes
1. **Root cause analysis** revealed the alerts were a symptom of one massive code duplication, not 23 independent issues
2. **Compound fix**: deleting the duplicate block resolved 9+ alerts in one change
3. **Secondary fixes**: security hardening (log-injection, stack-trace-exposure) done in same pass
4. **Test hygiene**: unused imports removed; test coupling to internal error message fixed
5. **Verification**: full backend suite passes, AST validates, CodeQL scan clean