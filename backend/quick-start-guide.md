# Django Backend Skills Hardening - Quick Start Guide

## Immediate Actions to Start Hardening Your Skills

### Day 1: Fix the Most Critical Issue (30 minutes)

**Exercise 1: ViewSet Action Routing Fix**

The `PlayerViewSet` has the same bug we fixed in `RoomViewSet`. Fix it now:

```bash
# 1. Identify the issue
grep -n "def.*self, request, pk=None" backend/game_engine/views.py

# 2. Fix PlayerViewSet methods
# Edit backend/game_engine/views.py and update:
# - update_score: add player_secret parameter
# - toggle_connection: add player_secret parameter

# 3. Test your fix
pytest backend/tests/test_player_viewset.py -v
```

**Expected Fix**:
```python
@action(detail=True, methods=["post"])
def update_score(self, request, pk=None, player_secret=None):
    player = self.get_object()
    # implementation
```

---

### Day 2: Add Robust Error Handling (45 minutes)

**Exercise 2: Serializer Error Handling**

Enhance the `TileCreateSerializer` to handle all edge cases:

```bash
# 1. Find current serializer
grep -n "class TileCreateSerializer" backend/game_engine/serializers.py

# 2. Add validation methods:
#    - validate() for business rules
#    - create() with error handling

# 3. Test edge cases:
#    - Duplicate positions
#    - Missing room field
#    - Invalid genre
```

**Key Validations to Add**:
```python
def validate(self, attrs):
    player = attrs['player']
    position = attrs['position']
    room = player.room
    
    # Check duplicate position in room
    if Tile.objects.filter(player__room=room, position=position).exists():
        raise ValidationError(f"Position {position} already occupied")
    
    # Check genre uniqueness for player
    # Add your validation here
    
    return attrs
```

---

### Day 3: Make Operations Transaction-Safe (60 minutes)

**Exercise 3: Transaction Safety**

Wrap game creation in proper transactions:

```bash
# 1. Find game creation methods
grep -n "def create.*game" backend/game_engine/views.py

# 2. Add transaction imports and wrapping
# 3. Add rollback on errors
# 4. Test failure scenarios
```

**Transaction Pattern**:
```python
from django.db import transaction

@action(detail=True, methods=["post"])
def create_full_game(self, request, pk=None, code=None):
    try:
        with transaction.atomic():
            # All database operations here
            # If any fails, everything rolls back
            pass
    except IntegrityError as e:
        transaction.set_rollback(True)
        return Response({"error": "Constraint violation"}, status=400)
```

---

### Day 4: Fix Test Discovery (30 minutes)

**Exercise 4: CI Test Discovery**

Ensure all tests are discovered in CI:

```bash
# 1. Check current test count
pytest --collect-only | grep "collected"

# 2. Update pytest.ini if needed
# 3. Verify all test directories are included

# 4. Test CI validation
TEST_COUNT=$(pytest --collect-only -q | grep "collected" | grep -oE "[0-9]+")
echo "Current test count: $TEST_COUNT"
```

**Expected pytest.ini**:
```ini
[pytest]
DJANGO_SETTINGS_MODULE = sound_royale_api.settings
python_files = tests.py test_*.py *_tests.py
testpaths = tests game_engine gaia/tests
```

---

## Immediate Wins (This Week)

### 1. Fix PlayerViewSet Routing (30 min)
- **Impact**: Fixes URL routing errors
- **Files**: `backend/game_engine/views.py`
- **Test**: `pytest backend/tests/test_player_api.py -v`

### 2. Add Tile Serializer Validation (45 min)
- **Impact**: Prevents database constraint violations
- **Files**: `backend/game_engine/serializers.py`
- **Test**: `pytest backend/tests/test_tile_validation.py -v`

### 3. Wrap Game Creation in Transactions (60 min)
- **Impact**: Prevents partial game states
- **Files**: `backend/game_engine/views.py`
- **Test**: `pytest backend/tests/test_game_creation.py -v`

### 4. Verify Test Discovery (15 min)
- **Impact**: Ensures CI runs all tests
- **Files**: `backend/pytest.ini`
- **Test**: `pytest --collect-only | grep collected`

---

## Skill Assessment Checklist

After completing the immediate wins, assess your progress:

### Django REST Framework
- [ ] Can identify ViewSet routing parameter mismatches
- [ ] Can implement serializer validation
- [ ] Can handle database constraint violations

### Database Operations
- [ ] Can use transactions for multi-step operations
- [ ] Can handle foreign key dependencies
- [ ] Can implement rollback strategies

### CI/CD Configuration
- [ ] Can configure test discovery
- [ ] Can implement quality gates
- [ ] Can debug CI issues

---

## Next Week: Advanced Exercises

Once you complete the immediate wins, tackle these:

### Exercise 5: Multiple Lookup Fields
Create ViewSet that supports multiple URL patterns

### Exercise 6: Comprehensive CI Pipeline
Add coverage, security scanning, and performance tests

### Exercise 7: Complex Migration
Add ELO system with proper data migration

### Exercise 8: Error Recovery System
Implement centralized error handling

---

## Common Pitfalls to Avoid

### 1. Parameter Mismatch
**Wrong**: `def action(self, request, pk=None)` when `lookup_field = "code"`
**Right**: `def action(self, request, pk=None, code=None)`

### 2. Missing Transaction Rollback
**Wrong**: `except IntegrityError: return error`
**Right**: `except IntegrityError: transaction.set_rollback(True); return error`

### 3. Incomplete Error Handling
**Wrong**: Let database errors bubble up
**Right**: Convert to user-friendly error messages

### 4. Test Discovery Gaps
**Wrong**: `testpaths = tests` (misses subdirectories)
**Right**: `testpaths = tests game_engine app/tests` (comprehensive)

---

## Quick Reference Commands

### Testing
```bash
# Run all tests
pytest -v

# Check test count
pytest --collect-only | grep collected

# Run specific test
pytest backend/tests/test_views.py::TestRoomViewSet::test_start_game -v

# Coverage report
coverage run --source='.' pytest
coverage report
```

### Database Operations
```bash
# Create migration
python manage.py makemigrations

# Apply migration
python manage.py migrate

# Check database status
python manage.py dbshell
```

### Code Quality
```bash
# Type check
npx tsc --noEmit

# Security check
bandit -r backend/

# Code formatting
black backend/
isort backend/
```

---

## Progress Tracking

Track your daily progress:

- [ ] Day 1: ViewSet routing fix
- [ ] Day 2: Serializer validation
- [ ] Day 3: Transaction safety
- [ ] Day 4: Test discovery

**Weekly Goal**: Complete all immediate wins and pass skill assessment

---

## Get Help

If you get stuck:

1. **Check the full program**: `backend/skills-hardening-program.md`
2. **Review practical exercises**: `backend/practical-exercises.md`
3. **Look at working examples**: `backend/game_engine/views.py`
4. **Run tests to verify**: `pytest backend/tests/ -v`

---

## Success Criteria

You've successfully hardened your skills when:

- All ViewSet actions handle routing correctly
- All serializers have comprehensive validation
- All database operations are transaction-safe
- CI discovers and runs all tests
- You can debug and fix similar issues independently

**Time Investment**: 2-3 hours for immediate wins
**Long-term Impact**: Expert-level Django backend development capability

Start now with Exercise 1 - it's the quickest win and builds immediate confidence!
