# Django Backend Skills Hardening Program

## Overview
This program addresses the key areas identified during the backend testing infrastructure fixes. Each skill area includes theoretical knowledge, practical exercises, and real-world scenarios from the Sound Royale codebase.

---

## 1. Django REST Framework Advanced Patterns

### 1.1 ViewSet Action Routing Mastery

#### **Core Concept: lookup_field vs method parameter mapping**

**Theory**: 
- `lookup_field` in ViewSet determines URL parameter name
- Action method signatures must match URL routing expectations
- DRF generates URLs based on `lookup_field` configuration

**Real-World Example from Sound Royale**:
```python
# BEFORE (BROKEN)
class RoomViewSet(viewsets.ModelViewSet):
    lookup_field = "code"  # URLs use /api/rooms/{code}/
    
    @action(detail=True, methods=["post"])
    def start_game(self, request, pk=None):  # Expects 'pk' but URL provides 'code'
        # TypeError: got unexpected keyword argument 'code'

# AFTER (FIXED)
class RoomViewSet(viewsets.ModelViewSet):
    lookup_field = "code"
    
    @action(detail=True, methods=["post"])
    def start_game(self, request, pk=None, code=None):  # Accepts both for compatibility
        room = self.get_object()  # Works with either parameter
```

#### **Practical Exercise 1: ViewSet Parameter Compatibility**

**Task**: Create a new ViewSet with custom lookup field
```python
# Exercise: Fix this ViewSet
class GameViewSet(viewsets.ModelViewSet):
    lookup_field = "game_code"  # URLs: /api/games/{game_code}/
    
    @action(detail=True, methods=["post"])
    def pause_game(self, request, pk=None):  # BUG: Wrong parameter
        pass
    
    @action(detail=True, methods=["post"]) 
    def resume_game(self, request, pk=None):  # BUG: Wrong parameter
        pass
```

**Solution**:
```python
class GameViewSet(viewsets.ModelViewSet):
    lookup_field = "game_code"
    
    @action(detail=True, methods=["post"])
    def pause_game(self, request, pk=None, game_code=None):
        game = self.get_object()
        # Implementation here
    
    @action(detail=True, methods=["post"])
    def resume_game(self, request, pk=None, game_code=None):
        game = self.get_object()
        # Implementation here
```

#### **Advanced Pattern: Dynamic Parameter Handling**

```python
class AdvancedViewSet(viewsets.ModelViewSet):
    lookup_field = "code"
    
    def get_object(self):
        """Custom object retrieval that handles multiple lookup methods"""
        if self.kwargs.get(self.lookup_field):
            try:
                return Room.objects.get(code=self.kwargs[self.lookup_field])
            except Room.DoesNotExist:
                pass
        return super().get_object()
    
    @action(detail=True, methods=["post"])
    def universal_action(self, request, **kwargs):
        """Accepts any parameters - most flexible approach"""
        obj = self.get_object()
        # Implementation
```

### 1.2 Serializer Error Handling Excellence

#### **Core Concept: Graceful Database Constraint Violations**

**Theory**: 
- Database constraints should be caught and converted to user-friendly responses
- Serializer validation should handle both field-level and object-level errors
- Transaction rollback should be used for complex operations

**Real-World Example from Sound Royale**:
```python
# BEFORE (BROKEN - IntegrityError bubbles up)
class PlayerCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Player
        fields = ['name', 'room', 'is_spectator']
    
    def create(self, validated_data):
        # This raises IntegrityError for duplicate names
        return Player.objects.create(**validated_data)

# AFTER (FIXED - Graceful error handling)
class PlayerCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Player
        fields = ['name', 'room', 'is_spectator']
    
    def validate(self, attrs):
        room = attrs['room']
        name = attrs['name']
        
        # Check for duplicate names
        if Player.objects.filter(room=room, name=name).exists():
            raise serializers.ValidationError(
                f"Player name '{name}' is already taken in this room"
            )
        return attrs
    
    def create(self, validated_data):
        try:
            return Player.objects.create(**validated_data)
        except IntegrityError as e:
            # Convert database error to user-friendly message
            if "UNIQUE constraint failed" in str(e):
                raise serializers.ValidationError(
                    "This player name is already taken"
                )
            raise  # Re-raise other errors
```

#### **Practical Exercise 2: Advanced Error Handling**

**Task**: Create robust serializer for complex model relationships
```python
# Exercise: Fix this serializer to handle all edge cases
class TileCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Tile
        fields = ['genre', 'position', 'player']
    
    def create(self, validated_data):
        # BUGS: No validation for constraints, no error handling
        return Tile.objects.create(**validated_data)
```

**Solution**:
```python
class TileCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Tile
        fields = ['genre', 'position', 'player']
    
    def validate(self, attrs):
        player = attrs['player']
        position = attrs['position']
        room = player.room
        
        # Check for duplicate position in same room
        existing_tile = Tile.objects.filter(
            player__room=room, 
            position=position
        ).first()
        
        if existing_tile:
            raise serializers.ValidationError(
                f"Position {position} is already occupied in this room"
            )
        
        # Check genre availability
        used_genres = Tile.objects.filter(
            player__room=room,
            player=player
        ).values_list('genre', flat=True)
        
        if attrs['genre'] in used_genres:
            raise serializers.ValidationError(
                f"Genre {attrs['genre']} is already used by this player"
            )
        
        return attrs
    
    def create(self, validated_data):
        try:
            return Tile.objects.create(**validated_data)
        except IntegrityError as e:
            if "NOT NULL constraint failed" in str(e):
                raise serializers.ValidationError(
                    "Missing required field: room or player"
                )
            raise
```

### 1.3 Custom Action Methods Best Practices

#### **Core Concept: Proper Parameter Handling**

**Theory**: 
- Custom actions should accept both standard and custom parameters
- Use `**kwargs` for maximum flexibility
- Validate permissions and business logic in actions

**Real-World Example from Sound Royale**:
```python
class RoomViewSet(viewsets.ModelViewSet):
    lookup_field = "code"
    
    @action(detail=True, methods=["post"])
    def kick_player(self, request, pk=None, code=None, **kwargs):
        """Robust action method with proper parameter handling"""
        room = self.get_object()
        
        # Validate required data
        player_id = request.data.get('player_id')
        requester_secret = request.data.get('player_secret')
        
        if not player_id or not requester_secret:
            return Response(
                {"error": "player_id and player_secret are required"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Business logic validation
        try:
            requester = Player.objects.get(player_secret=requester_secret)
        except Player.DoesNotExist:
            return Response(
                {"error": "Invalid player secret"},
                status=status.HTTP_403_FORBIDDEN
            )
        
        if not requester.is_host:
            return Response(
                {"error": "Only host can kick players"},
                status=status.HTTP_403_FORBIDDEN
            )
        
        # Execute action
        try:
            player_to_kick = Player.objects.get(id=player_id, room=room)
            player_to_kick.delete()
            return Response(
                {"status": "Player kicked successfully"},
                status=status.HTTP_200_OK
            )
        except Player.DoesNotExist:
            return Response(
                {"error": "Player not found"},
                status=status.HTTP_404_NOT_FOUND
            )
```

---

## 2. Database Migration & Constraint Management

### 2.1 Foreign Key Dependencies Mastery

#### **Core Concept: Understanding Model Relationship Requirements**

**Theory**: 
- Foreign keys create dependencies that must be handled in migrations
- Cascade delete behavior must be explicitly defined
- Database constraints enforce referential integrity

**Real-World Example from Sound Royale**:
```python
# Model relationships with proper constraints
class Room(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4)
    code = models.CharField(max_length=4, unique=True)

class Player(models.Model):
    room = models.ForeignKey(Room, on_delete=models.CASCADE, related_name="players")
    # This means: if Room is deleted, all Players are deleted too

class Tile(models.Model):
    player = models.ForeignKey(Player, on_delete=models.CASCADE, related_name="tiles")
    room = models.ForeignKey(Room, on_delete=models.CASCADE, related_name="tiles")
    # Both player and room are required - this caused our bug!
```

#### **Practical Exercise 3: Foreign Key Dependency Analysis**

**Task**: Identify and fix foreign key issues in this model:
```python
# Exercise: What's wrong with these relationships?
class Game(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4)

class Player(models.Model):
    game = models.ForeignKey(Game, on_delete=models.CASCADE)
    # BUG: Missing related_name, unclear cascade behavior

class Score(models.Model):
    player = models.ForeignKey(Player, on_delete=models.CASCADE)
    game = models.ForeignKey(Game, on_delete=models.CASCADE)
    # BUG: Redundant game reference, potential inconsistency
```

**Solution**:
```python
class Game(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4)

class Player(models.Model):
    game = models.ForeignKey(
        Game, 
        on_delete=models.CASCADE, 
        related_name="players"
    )

class Score(models.Model):
    player = models.ForeignKey(
        Player, 
        on_delete=models.CASCADE, 
        related_name="scores"
    )
    # Remove redundant game field - get it through player.game
```

### 2.2 Transaction Safety Implementation

#### **Core Concept: Proper Error Handling in Database Operations**

**Theory**: 
- Use database transactions for multi-step operations
- Rollback on failure to maintain data consistency
- Handle exceptions at the right level

**Real-World Example from Sound Royale**:
```python
from django.db import transaction

class RoomViewSet(viewsets.ModelViewSet):
    @action(detail=True, methods=["post"])
    def reset_game(self, request, pk=None, code=None, **kwargs):
        """Transaction-safe game reset"""
        room = self.get_object()
        requester_secret = request.data.get("player_secret")
        
        try:
            with transaction.atomic():
                # Validate permissions first
                requester = Player.objects.get(player_secret=requester_secret)
                if not requester.is_host:
                    raise PermissionError("Only host can reset game")
                
                # Update room state
                room.current_round += 1
                room.winner = None
                room.save()
                
                # Delete old tiles
                Tile.objects.filter(room=room).delete()
                
                # Create new tiles for each player
                players = room.players.filter(is_spectator=False)
                for player in players:
                    genres = list(Tile.Genre.values)
                    random.shuffle(genres)
                    
                    for position in range(9):
                        Tile.objects.create(
                            player=player, 
                            room=room,  # CRITICAL: Include required room field
                            position=position, 
                            genre=genres.pop()
                        )
                
                # Broadcast update
                broadcast_game_update(room)
                
        except PermissionError as e:
            return Response(
                {"error": str(e)},
                status=status.HTTP_403_FORBIDDEN
            )
        except IntegrityError as e:
            transaction.set_rollback(True)
            return Response(
                {"error": "Failed to reset game - constraint violation"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
        except Exception as e:
            transaction.set_rollback(True)
            logger.exception(f"Failed to reset game in room {room.code}")
            return Response(
                {"error": "Failed to reset game. Please try again."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
        
        return Response(
            {"status": "Game reset", "round": room.current_round},
            status=status.HTTP_200_OK
        )
```

### 2.3 Constraint Violation Recovery

#### **Core Concept: Graceful Error Responses**

**Theory**: 
- Catch database constraint violations
- Convert to user-friendly error messages
- Provide actionable feedback

**Practical Exercise 4: Constraint Recovery Implementation**

**Task**: Implement robust error handling for this complex operation:
```python
# Exercise: Add proper constraint violation handling
def create_complex_game_data(room_id, player_data_list):
    """Create multiple players and tiles - currently has no error handling"""
    room = Room.objects.get(id=room_id)
    
    for player_data in player_data_list:
        player = Player.objects.create(room=room, **player_data)
        
        # Create tiles for player
        for position in range(9):
            Tile.objects.create(
                player=player,
                position=position,
                genre=random.choice(Tile.Genre.values)
            )
```

**Solution**:
```python
from django.db import transaction

def create_complex_game_data(room_id, player_data_list):
    """Robust game data creation with full error handling"""
    try:
        with transaction.atomic():
            room = Room.objects.get(id=room_id)
            created_players = []
            
            for i, player_data in enumerate(player_data_list):
                try:
                    # Check for duplicate names first
                    if Player.objects.filter(
                        room=room, 
                        name=player_data['name']
                    ).exists():
                        raise ValueError(
                            f"Player name '{player_data['name']}' already exists"
                        )
                    
                    player = Player.objects.create(room=room, **player_data)
                    created_players.append(player)
                    
                    # Create tiles for player
                    used_genres = set()
                    for position in range(9):
                        # Ensure unique genres per player
                        available_genres = [
                            g for g in Tile.Genre.values 
                            if g not in used_genres
                        ]
                        
                        if not available_genres:
                            raise ValueError("Not enough unique genres for tiles")
                        
                        genre = random.choice(available_genres)
                        used_genres.add(genre)
                        
                        Tile.objects.create(
                            player=player,
                            room=room,  # Include required room field
                            position=position,
                            genre=genre
                        )
                        
                except IntegrityError as e:
                    if "UNIQUE constraint failed" in str(e):
                        raise ValueError(
                            f"Duplicate player name: {player_data.get('name', 'unknown')}"
                        )
                    elif "NOT NULL constraint failed" in str(e):
                        raise ValueError(
                            f"Missing required field for player {i+1}"
                        )
                    raise
            
            return {
                "status": "success",
                "players_created": len(created_players),
                "tiles_per_player": 9
            }
            
    except Room.DoesNotExist:
        return {
            "status": "error",
            "error": f"Room with id {room_id} not found"
        }
    except ValueError as e:
        return {
            "status": "error", 
            "error": str(e)
        }
    except Exception as e:
        return {
            "status": "error",
            "error": "Unexpected error during game creation"
        }
```

---

## 3. CI/CD Pipeline Configuration

### 3.1 Test Discovery Optimization

#### **Core Concept: Ensuring CI Discovers All Relevant Test Files**

**Theory**: 
- pytest configuration must match project structure
- Test discovery patterns need to be comprehensive
- CI should validate test count to prevent regressions

**Real-World Example from Sound Royale**:
```bash
# BEFORE (BROKEN - only discovered 13 tests)
# pytest.ini
[pytest]
testpaths = tests game_engine/tests.py gaia/tests

# AFTER (FIXED - discovers all 84 tests)
# pytest.ini  
[pytest]
testpaths = tests game_engine gaia/tests
python_files = tests.py test_*.py *_tests.py
```

#### **Practical Exercise 5: Test Discovery Configuration**

**Task**: Fix this pytest configuration to discover all tests:
```ini
# Exercise: What's wrong with this configuration?
[pytest]
DJANGO_SETTINGS_MODULE = myproject.settings
testpaths = tests
python_files = test_*.py
```

**Project Structure**:
```
backend/
  tests/
    test_models.py
    test_views.py
  app/
    tests/
      test_serializers.py
  integration/
    test_api.py
```

**Solution**:
```ini
[pytest]
DJANGO_SETTINGS_MODULE = myproject.settings
testpaths = tests app/tests integration
python_files = tests.py test_*.py *_tests.py
python_classes = Test*
python_functions = test_*
```

### 3.2 Environment Consistency

#### **Core Concept: Matching Local and CI Test Environments**

**Theory**: 
- CI should mirror local development environment
- Database configuration must be consistent
- Dependencies should be locked

**Real-World Example from Sound Royale**:
```yaml
# .github/workflows/ci.yml
- name: Install dependencies
  run: |
    python -m pip install --upgrade pip
    pip install -r requirements.txt
    pip install pytest pytest-django  # Same as local

- name: Run tests
  env:
    DJANGO_SETTINGS_MODULE: sound_royale_api.settings  # Same as local
    PYTHONPATH: ..  # Same as local
  run: |
    pytest -v --tb=short  # Same options as local
```

### 3.3 Quality Gate Implementation

#### **Core Concept: Proper Validation Criteria in CI**

**Theory**: 
- CI should enforce minimum quality standards
- Test count validation prevents test loss
- Coverage requirements ensure code quality

**Real-World Example from Sound Royale**:
```bash
# CI validation with quality gates
echo "Running comprehensive Django test suite..."
TEST_OUTPUT=$(pytest -v --tb=short 2>&1)

# Verify tests were collected
if ! echo "$TEST_OUTPUT" | grep -qE "collected [1-9][0-9]* items"; then
    echo "ERROR: No tests were collected!"
    exit 1
fi

# Verify minimum test count
TEST_COUNT=$(echo "$TEST_OUTPUT" | grep -oE "collected [0-9]+ items" | grep -oE "[0-9]+")
if [ "$TEST_COUNT" -lt 70 ]; then
    echo "ERROR: Insufficient test count: $TEST_COUNT (expected > 70)"
    exit 1
fi

# Fail CI if pytest failed
if [ "$PYTEST_EXIT" -ne 0 ]; then
    echo "ERROR: Pytest failed!"
    exit "$PYTEST_EXIT"
fi
```

#### **Practical Exercise 6: Complete CI Pipeline**

**Task**: Create comprehensive CI pipeline for Django project:
```yaml
# Exercise: Complete this CI configuration
name: Django CI
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: "3.11"
      
      # TODO: Add dependency installation
      # TODO: Add database setup  
      # TODO: Add test execution with quality gates
      # TODO: Add security checks
```

**Solution**:
```yaml
name: Django CI
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_PASSWORD: postgres
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: "3.11"
          cache: "pip"
      
      - name: Install dependencies
        run: |
          python -m pip install --upgrade pip
          pip install -r requirements.txt
          pip install pytest pytest-django coverage
      
      - name: Run migrations
        env:
          DATABASE_URL: postgres://postgres:postgres@localhost:5432/test
        run: |
          python manage.py migrate
      
      - name: Run tests with quality gates
        env:
          DATABASE_URL: postgres://postgres:postgres@localhost:5432/test
          DJANGO_SETTINGS_MODULE: myproject.settings
        run: |
          echo "Running comprehensive test suite..."
          TEST_OUTPUT=$(pytest -v --tb=short --cov=app 2>&1)
          PYTEST_EXIT=$?
          echo "$TEST_OUTPUT"
          
          # Quality gate 1: Test collection
          if ! echo "$TEST_OUTPUT" | grep -qE "collected [1-9][0-9]* items"; then
            echo "ERROR: No tests were collected!"
            exit 1
          fi
          
          # Quality gate 2: Minimum test count
          TEST_COUNT=$(echo "$TEST_OUTPUT" | grep -oE "collected [0-9]+ items" | grep -oE "[0-9]+")
          if [ "$TEST_COUNT" -lt 50 ]; then
            echo "ERROR: Insufficient test count: $TEST_COUNT (expected > 50)"
            exit 1
          fi
          
          # Quality gate 3: Test success
          if [ "$PYTEST_EXIT" -ne 0 ]; then
            echo "ERROR: Tests failed!"
            exit "$PYTEST_EXIT"
          fi
          
          # Quality gate 4: Coverage threshold
          coverage report --fail-under=80
      
      - name: Security checks
        run: |
          pip install bandit safety
          bandit -r app/
          safety check
```

---

## 4. Skill Assessment & Progress Tracking

### 4.1 Self-Assessment Checklist

#### **Django REST Framework Advanced Patterns**
- [ ] Can identify and fix ViewSet routing parameter mismatches
- [ ] Can implement robust serializer error handling
- [ ] Can create custom action methods with proper parameter handling
- [ ] Understands when to use `**kwargs` vs explicit parameters

#### **Database Migration & Constraint Management**
- [ ] Can analyze foreign key dependencies in model relationships
- [ ] Can implement transaction-safe database operations
- [ ] Can handle database constraint violations gracefully
- [ ] Can design proper cascade delete behavior

#### **CI/CD Pipeline Configuration**
- [ ] Can configure pytest for comprehensive test discovery
- [ ] Can ensure environment consistency between local and CI
- [ ] Can implement quality gates in CI pipelines
- [ ] Can debug CI test discovery issues

### 4.2 Practical Project Exercises

#### **Exercise 7: Complete Backend Feature**
Build a complete Django feature that demonstrates all skills:
- Create models with proper relationships
- Implement ViewSets with custom actions
- Add robust error handling
- Write comprehensive tests
- Configure CI pipeline

#### **Exercise 8: Debug Real-World Issues**
Fix these actual issues from Sound Royale:
1. URL routing parameter mismatch
2. Tile creation missing room field
3. Test discovery configuration
4. Database constraint violation handling

---

## 5. Resources & References

### 5.1 Django REST Framework Documentation
- [ViewSet Actions](https://www.django-rest-framework.org/api-guide/viewsets/#actions)
- [Serializer Validation](https://www.django-rest-framework.org/api-guide/serializers/#validation)
- [Routing](https://www.django-rest-framework.org/api-guide/routers/)

### 5.2 Django Database Documentation
- [Transaction Management](https://docs.djangoproject.com/en/stable/topics/db/transactions/)
- [Database Constraints](https://docs.djangoproject.com/en/stable/ref/models/fields/#django.db.models.ForeignKey)
- [Migration Operations](https://docs.djangoproject.com/en/stable/topics/migrations/#migration-operations)

### 5.3 CI/CD Best Practices
- [pytest Configuration](https://docs.pytest.org/en/stable/customize.html)
- [GitHub Actions](https://docs.github.com/en/actions)
- [Quality Gates](https://docs.gitlab.com/ee/ci/quality_gates.html)

---

## 6. Next Steps

1. **Complete all practical exercises** in this program
2. **Apply skills to real Sound Royale issues**
3. **Create additional exercises** based on new challenges
4. **Share knowledge** with team members
5. **Continuously improve** based on real-world experience

This program provides the foundation for becoming a Django backend expert with deep understanding of advanced patterns, database management, and CI/CD best practices.
