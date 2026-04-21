# Practical Exercises: Django Backend Skills Hardening

## Exercise 1: ViewSet Action Routing Fix

**Scenario**: The current `PlayerViewSet` has the same routing issue we fixed in `RoomViewSet`. Fix it.

```python
# Current (Broken) Implementation in backend/game_engine/views.py
class PlayerViewSet(viewsets.ModelViewSet):
    """
    API endpoint for managing players.
    """
    queryset = Player.objects.all()
    serializer_class = PlayerSerializer
    permission_classes = [AllowAny]
    lookup_field = "player_secret"  # URLs use player_secret, not pk
    
    @action(detail=True, methods=["post"])
    def update_score(self, request, pk=None):  # BUG: Wrong parameter
        """Update player score"""
        player = self.get_object()
        # Implementation here
    
    @action(detail=True, methods=["post"])
    def toggle_connection(self, request, pk=None):  # BUG: Wrong parameter
        """Toggle player connection status"""
        player = self.get_object()
        # Implementation here
```

**Your Task**:
1. Fix the parameter mismatch in both action methods
2. Test the fix with pytest
3. Ensure backward compatibility

**Expected URLs**:
- `/api/players/{player_secret}/update_score/`
- `/api/players/{player_secret}/toggle_connection/`

---

## Exercise 2: Serializer Error Handling Enhancement

**Scenario**: The `TileCreateSerializer` needs robust error handling for the complex tile creation rules.

```python
# Current Implementation in backend/game_engine/serializers.py
class TileCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Tile
        fields = ['genre', 'position', 'player']
    
    # TODO: Add comprehensive validation and error handling
```

**Your Task**:
1. Add validation for duplicate positions in the same room
2. Add validation for genre uniqueness per player
3. Handle database constraint violations gracefully
4. Add meaningful error messages

**Business Rules**:
- Each position (0-8) can only be used once per room
- Each player can only use each genre once
- Both player and room fields are required
- Position must be between 0-8

---

## Exercise 3: Transaction-Safe Game Creation

**Scenario**: The game creation process needs to be transaction-safe to prevent partial game states.

```python
# Current Implementation in backend/game_engine/views.py
@action(detail=True, methods=["post"])
def create_full_game(self, request, pk=None, code=None):
    """Create a complete game with players and tiles"""
    room = self.get_object()
    player_data = request.data.get('players', [])
    
    # TODO: Make this transaction-safe
    for data in player_data:
        player = Player.objects.create(room=room, **data)
        
        # Create 9 tiles for each player
        for position in range(9):
            Tile.objects.create(
                player=player,
                position=position,
                genre=random.choice(Tile.Genre.values)
            )
```

**Your Task**:
1. Wrap the entire operation in a database transaction
2. Add comprehensive error handling
3. Validate all data before starting the transaction
4. Provide meaningful error responses
5. Ensure rollback on any failure

---

## Exercise 4: Advanced ViewSet with Multiple Lookup Fields

**Scenario**: Create a new `GameSessionViewSet` that can be looked up by multiple fields.

```python
# Create new ViewSet in backend/game_engine/views.py
class GameSessionViewSet(viewsets.ModelViewSet):
    """
    API endpoint for game sessions.
    Should support lookup by: session_code, room_code, or player_secret
    """
    queryset = GameSession.objects.all()
    serializer_class = GameSessionSerializer
    
    # TODO: Implement multiple lookup field support
    # URLs should support:
    # /api/sessions/{session_code}/
    # /api/sessions/room/{room_code}/
    # /api/sessions/player/{player_secret}/
```

**Your Task**:
1. Implement custom `get_object()` method
2. Create multiple URL patterns
3. Add appropriate action methods
4. Handle lookup failures gracefully

---

## Exercise 5: Test Discovery Configuration

**Scenario**: The current pytest configuration needs to be optimized for a new project structure.

```python
# Current pytest.ini
[pytest]
DJANGO_SETTINGS_MODULE = sound_royale_api.settings
python_files = tests.py test_*.py *_tests.py
python_classes = Test*
python_functions = test_*
addopts = -v --tb=short --reuse-db
testpaths = tests game_engine gaia/tests
```

**New Project Structure**:
```
backend/
  tests/
    unit/
      test_models.py
      test_views.py
    integration/
      test_api.py
      test_workflows.py
  app/
    tests/
      test_serializers.py
      test_utils.py
  features/
    tests/
      test_new_feature.py
```

**Your Task**:
1. Update `pytest.ini` to discover all test files
2. Ensure minimum test count validation (> 100 tests)
3. Add coverage reporting
4. Configure test database settings

---

## Exercise 6: CI Pipeline with Quality Gates

**Scenario**: Create a comprehensive CI pipeline for the Django backend.

**Requirements**:
- Test discovery validation
- Minimum test count (100+ tests)
- Code coverage (> 80%)
- Security scanning
- Type checking
- Database migration testing

**Your Task**:
1. Create `.github/workflows/backend-ci.yml`
2. Add all quality gates
3. Configure test database
4. Add caching for dependencies
5. Add artifact collection for test reports

---

## Exercise 7: Complex Database Migration

**Scenario**: Add ELO rating system to existing Player model with proper migration.

```python
# Current Player model
class Player(models.Model):
    room = models.ForeignKey(Room, on_delete=models.CASCADE)
    name = models.CharField(max_length=100)
    is_spectator = models.BooleanField(default=False)
    is_host = models.BooleanField(default=False)
    is_connected = models.BooleanField(default=False)
```

**Required Changes**:
1. Add ELO fields: `elo_rating`, `elo_wins`, `elo_losses`, `elo_matches`
2. Create migration that populates default values for existing players
3. Update serializers to include ELO fields
4. Add validation for ELO values (0-3000 range)
5. Add tests for ELO functionality

**Your Task**:
1. Create the migration file
2. Write data migration for existing players
3. Update model and serializer
4. Add comprehensive tests
5. Update API documentation

---

## Exercise 8: Error Recovery System

**Scenario**: Implement a comprehensive error handling system for the API.

```python
# Create new error handling system
class APIErrorHandler:
    """Centralized error handling for API endpoints"""
    
    # TODO: Implement methods for:
    # - Database constraint violations
    # - Permission errors
    # - Validation errors
    # - Network errors
    # - Business logic errors
```

**Your Task**:
1. Create centralized error handler
2. Define error response formats
3. Add logging for different error types
4. Implement error recovery strategies
5. Update all ViewSets to use the error handler

---

## Exercise 9: Performance Optimization

**Scenario**: Optimize database queries for the game state API.

```python
# Current implementation (N+1 query problem)
class GameStateSerializer(serializers.ModelSerializer):
    players = PlayerSerializer(many=True, read_only=True)
    tiles = TileSerializer(many=True, read_only=True)
    
    class Meta:
        model = Room
        fields = ['id', 'code', 'status', 'players', 'tiles']
```

**Your Task**:
1. Identify N+1 query problems
2. Use `select_related` and `prefetch_related` to optimize
3. Add performance tests
4. Benchmark query improvements
5. Document optimization strategies

---

## Exercise 10: Comprehensive Testing Suite

**Scenario**: Create a complete testing suite for a new feature.

**Feature**: Game Reconnection System
- Players can reconnect to games after network issues
- Maintain game state during disconnection
- Handle concurrent reconnection attempts

**Your Task**:
1. Write model tests
2. Write API endpoint tests
3. Write integration tests
4. Write performance tests
5. Add edge case testing
6. Ensure 100% test coverage for the feature

---

## Solution Verification

For each exercise, verify your solution:

### 1. Run Tests
```bash
pytest backend/tests/test_exercise_1.py -v
```

### 2. Check Code Coverage
```bash
coverage run --source='.' pytest
coverage report
```

### 3. Run Type Checking
```bash
npx tsc --noEmit
```

### 4. Run Security Checks
```bash
bandit -r backend/
safety check
```

### 5. Test CI Pipeline
```bash
# Act like CI
pytest -v --tb=short
TEST_COUNT=$(pytest --collect-only -q | grep "collected" | grep -oE "[0-9]+")
if [ "$TEST_COUNT" -lt 100 ]; then
    echo "ERROR: Insufficient test count"
    exit 1
fi
```

---

## Progress Tracking

Track your completion of each exercise:

- [ ] Exercise 1: ViewSet Action Routing Fix
- [ ] Exercise 2: Serializer Error Handling Enhancement  
- [ ] Exercise 3: Transaction-Safe Game Creation
- [ ] Exercise 4: Advanced ViewSet with Multiple Lookup Fields
- [ ] Exercise 5: Test Discovery Configuration
- [ ] Exercise 6: CI Pipeline with Quality Gates
- [ ] Exercise 7: Complex Database Migration
- [ ] Exercise 8: Error Recovery System
- [ ] Exercise 9: Performance Optimization
- [ ] Exercise 10: Comprehensive Testing Suite

---

## Skill Assessment

After completing all exercises, assess your skills:

### Django REST Framework Advanced Patterns
- [ ] Can handle complex ViewSet routing scenarios
- [ ] Can implement robust serializer validation
- [ ] Can create custom action methods with proper error handling

### Database Management
- [ ] Can design complex model relationships
- [ ] Can implement transaction-safe operations
- [ ] Can handle database constraint violations gracefully

### CI/CD Pipeline Configuration
- [ ] Can configure comprehensive test discovery
- [ ] Can implement quality gates and validation
- [ ] Can debug and optimize CI pipelines

### Testing Excellence
- [ ] Can write comprehensive test suites
- [ ] Can achieve high code coverage
- [ ] Can test complex scenarios and edge cases

---

## Next Steps

1. **Apply skills to real Sound Royale issues**
2. **Create additional exercises** based on new challenges
3. **Share knowledge** with team members
4. **Continuously improve** based on real-world experience

This practical exercise program provides hands-on experience with real Django backend challenges, building the skills needed for expert-level backend development.
