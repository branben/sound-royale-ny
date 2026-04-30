---
name: "e2e-test-hygiene"
description: "E2E test principles to prevent time waste and enforce quality"
triggers:
  file_patterns:
    - "tests/e2e/**/*.spec.ts"
    - "tests/e2e/**/*.ts"
    - "src/context/**/*.tsx"
    - "src/components/game/**/*.tsx"

pre_edit_validations:
  - id: "file_read_limit"
    condition: "file_read_count >= 3"
    severity: "warn"
    message: "3rd read of {filename} detected. Stop reading, implement now, verify after."
    action_on_fail: "prompt_continue"
    
  - id: "data_flow_check"
    condition: "editing_context_or_components && !data_flow_verified"
    severity: "warn"
    message: "Trace data flow before editing: test helper → localStorage → context → component props → render condition"
    action_on_fail: "show_skill_section"
    skill_section: "Data Flow Tracing"
    
  - id: "type_interface_check"
    condition: "accessing_player_or_game_state && !type_verified"
    severity: "warn"
    message: "Check TypeScript interface before property access. Example: Player has `board.tiles`, not `tiles` directly."
    action_on_fail: "show_skill_section"
    skill_section: "Type-First Verification"
    
  - id: "route_verification"
    condition: "test_contains_page_goto && !route_verified"
    severity: "info"
    message: "Verify route exists in App.tsx before writing `page.goto('/path')`"
    action_on_fail: "suggest_command"
    command: "grep -n 'Route.*path' src/App.tsx"

phase_timeouts:
  red: 10      # Test must fail fast
  green: 30    # Implementation + type check
  refactor: 15 # Cleanup only
  
  green_timeout_action: "force_check"
  green_timeout_command: "npx tsc --noEmit"
  green_timeout_message: "30 minutes in green phase. Run type check now. Cannot mark complete until types pass."

post_task_checks:
  - id: "type_check"
    command: "npx tsc --noEmit"
    must_pass: true
    condition: "modified_frontend_files"
    failure_message: "Type errors present. Run `npx tsc --noEmit` and fix before marking complete."
    
  - id: "no_console_logs"
    command: "grep -rn 'console.log' {modified_src_files} || true"
    expect_empty: true
    condition: "always"
    failure_message: "Debug console.log statements found in production code. Remove before completing."
    auto_fix_available: true
    auto_fix_command: "sed -i '/console.log/d' {modified_src_files}"
    
  - id: "test_pass"
    command: "npx playwright test {modified_test_files} --reporter=line"
    must_pass: true
    condition: "modified_test_files"
    failure_message: "E2E tests failing. Fix before completing."

reminder_triggers:
  - pattern: "reading_same_file_again"
    message: "STOP: 3rd read detected. Implement now."
  - pattern: "writing_navigation_test"
    message: "STOP: Check App.tsx routes first."
  - pattern: "debugging_failing_test"
    message: "STOP: Add console error capture first."
  - pattern: "editing_component"
    message: "STOP: Verify full structure before modifying."
  - pattern: "testing_context_injection"
    message: "STOP: Trace data flow first (helper → storage → context → component)."
---

# E2E Test Hygiene - Hardened Skill

**Attach to context when**: Working with E2E tests, Playwright tests, or debugging test failures.

## Pre-Action Checklist

Before any E2E test modification:

- [ ] **Check App.tsx routes** - Verify the route exists before writing `page.goto('/path')`
- [ ] **Read file once deeply** - Understand full structure before editing (not 20 shallow reads)
- [ ] **Capture console errors** - Add console/pageerror listeners to failing tests immediately
- [ ] **Trace data flow** - Map: test helper → storage → context → component props → render condition
- [ ] **Check TypeScript types** - Verify interfaces before writing property access code (e.g., `player.board.tiles` not `player.tiles`)

## Anti-Patterns (STOP and Check)

| Anti-Pattern | Detection | Fix |
|--------------|-----------|-----|
| Re-reading file 3+ times | Same file in recent context | Make decision now, implement, verify |
| Assuming routes | Writing `/path` without checking App.tsx | `grep -n "Route.*path" src/App.tsx` first |
| Ignoring console | Test fails, no error capture in code | Add `page.on('console', ...)` and `page.on('pageerror', ...)` |
| Component surgery | Editing without understanding structure | Read full component, identify insertion point |
| Calling API-live "production flow" | Test uses direct API helpers to create/join/play/vote | Label as backend/API smoke; run the browser-live golden gate for user flow |
| Manual reload masking transitions | Test reloads after host starts or after joining | Fix the product transition; browser-live gate must move naturally |

## Browser-Live vs API-Live

- **Browser-live production gate:** `tests/e2e/live/golden-user-flow.spec.ts`
- Browser-live means no API helpers, no route mocks, no localStorage session injection, and no manual reloads.
- **API-live smoke:** live tests that use direct API helpers to set up rooms or trigger gameplay.
- API-live smoke is useful backend coverage, but it is not proof that host, producer, and spectator browser flows work in production.
- Production-flow, spectator-perspective, host-perspective, producer-perspective, or natural-transition bugs are not complete until the golden gate passes freshly.

## Fast Debugging Protocol

Test failing? Execute in order:

1. **Console check** (30 sec) - Add error capture, re-run, read output
2. **Screenshot check** (1 min) - View test-failed-1.png if available
3. **Route check** (30 sec) - Verify URL in `page.goto()` matches App.tsx routes
4. **Selector check** (1 min) - Use browser dev tools to verify selectors
5. **Then** - Make targeted fix based on evidence

## Decision Velocity

- Uncertain about edit? → Make it, verify with test, iterate (not re-read)
- 2+ file re-reads? → Stop reading, start implementing
- Route in test? → Verify in App.tsx immediately

## Context Efficiency

- Max 2 reads of same file per task
- Console errors are free debugging info - capture them
- Screenshots are worth 1000 context tokens - use them
- Routes are contracts - verify before testing

## Data Flow Tracing (CRITICAL for Context/State Tests)

When testing with injected state (localStorage, context, props):

```
Test Helper → localStorage → Context Provider → Component Props → Component Render
     ↑___________________________________________________________↓
                    (assert on rendered output)
```

**Trace each arrow:**
- [ ] Helper sets correct keys? (e.g., `playerName` vs `player-name`)
- [ ] Context reads from correct source? (localStorage key X, not key Y)
- [ ] Context provides to component? (prop name matches)
- [ ] Component uses for render condition? (null check, length check, etc.)

**Sound Royale specific:**
- `setupPlayerSession()` must set `playerName`, `playerId`, `playerSecret` individually
- `UserContext.tsx` reads these with `safeLocalStorage.getItem('playerName')`
- `Room.tsx` passes `userSession.playerName` to `PlayerView`
- `PlayerView` finds player in `gameState.players` by name

## Type-First Verification

Before writing code that uses data structures:

- [ ] Check TypeScript interface (e.g., `Player` has `board.tiles`, not `tiles`)
- [ ] Verify property paths match (dot notation vs nested objects)
- [ ] Run `npx tsc --noEmit` after each file edit

**Anti-pattern:** `playerData.tiles.map(...)` when `Player` type has `board: { tiles: [...] }`

## Red-Green-Refactor Discipline

| Phase | Duration | Action | Check |
|-------|----------|--------|-------|
| **Red** | 5 min | Write test, confirm it fails for right reason | Error message matches expectation |
| **Green** | 20 min | Minimal implementation + type fixes | `npx tsc --noEmit` passes before declaring green |
| **Refactor** | 10 min | Remove debug, tighten assertions | No `console.log` left in production code |

**Violation:** Spent 40 min in "green" fixing types after test "passed" — types are part of green.

## Data Flow Tracing (CRITICAL for Context/State Tests)

When testing with injected state (localStorage, context, props):

```
Test Helper → localStorage → Context Provider → Component Props → Component Render
     ↑___________________________________________________________↓
                    (assert on rendered output)
```

**Trace each arrow:**
- [ ] Helper sets correct keys? (e.g., `playerName` vs `player-name`)
- [ ] Context reads from correct source? (localStorage key X, not key Y)
- [ ] Context provides to component? (prop name matches)
- [ ] Component uses for render condition? (null check, length check, etc.)

**Sound Royale specific:**
- `setupPlayerSession()` must set `playerName`, `playerId`, `playerSecret` individually
- `UserContext.tsx` reads these with `safeLocalStorage.getItem('playerName')`
- `Room.tsx` passes `userSession.playerName` to `PlayerView`
- `PlayerView` finds player in `gameState.players` by name

## Type-First Verification

Before writing code that uses data structures:

- [ ] Check TypeScript interface (e.g., `Player` has `board.tiles`, not `tiles`)
- [ ] Verify property paths match (dot notation vs nested objects)
- [ ] Run `npx tsc --noEmit` after each file edit

**Anti-pattern:** `playerData.tiles.map(...)` when `Player` type has `board: { tiles: [...] }`

## Red-Green-Refactor Discipline

| Phase | Duration | Action | Check |
|-------|----------|--------|-------|
| **Red** | 5 min | Write test, confirm it fails for right reason | Error message matches expectation |
| **Green** | 20 min | Minimal implementation + type fixes | `npx tsc --noEmit` passes before declaring green |
| **Refactor** | 10 min | Remove debug, tighten assertions | No `console.log` left in production code |

**Violation:** Spent 40 min in "green" fixing types after test "passed" — types are part of green.

## Reminder Triggers

If you find yourself:
- Reading the same file again → **STOP**: Implement now
- Writing a navigation test → **STOP**: Check App.tsx routes first
- Debugging a failing test → **STOP**: Add console error capture first
- Editing a component → **STOP**: Verify full structure before modifying
- **Testing context/state injection → **STOP**: Trace data flow first (helper → storage → context → component)**
- **Testing context/state injection → **STOP**: Trace data flow first (helper → storage → context → component)**
