# E2E MVP Cleanup Retro - 2026-04-19

## Performance Rating: 6/10

### What Went Well
1. **MVP Scope Documentation** - Created clear `docs/MVP_SCOPE.md` with IN/CUT/DEFERRED definitions that GAIA can use as source of truth
2. **Test Categorization** - Successfully executed Category B (CUT) and Category C (DEFERRED) cleanup
3. **Root Cause Found** - Eventually discovered the `/` vs `/lobby` route mismatch that was blocking smoke tests
4. **PlayerView.tsx Fixed** - Restored broken file structure from earlier corrupted edit

### What Didn't Go Well

#### 1. PlayerView.tsx Corruption (Major Time Sink)
- **What happened**: Attempted to add TurnTimer to PlayerView, broke the entire file structure
- **Impact**: ~15-20 minutes to diagnose and fix syntax errors
- **Root cause**: Made edits without fully understanding the existing component structure

#### 2. Repeated File Reading (Context Bloat)
- **What happened**: Read `smoke.spec.ts` approximately 20+ times without making decisions
- **Impact**: ~10 minutes of wasted context window, reduced clarity
- **Root cause**: Uncertainty about what to change, seeking confirmation through re-reading

#### 3. Lobby Test Debugging (Inefficient)
- **What happened**: Took ~30 minutes to discover the route mismatch
- **Impact**: Delayed green baseline, unnecessary debugging complexity
- **Root cause**: Didn't check browser console errors immediately (the error was right there: "404 Error: User attempted to access non-existent route: /lobby")

#### 4. "Ask Mode" Stall
- **What happened**: User had to say "sorry i had you in ask mode" to get me to implement
- **Impact**: User friction, delay in progress
- **Root cause**: Over-reliance on confirmation before acting

## Context Drift Elements

| Element | How It Manifested | Prevention |
|---------|------------------|------------|
| Repeated file reads | Read same file 20+ times | Make decision after 2-3 reads max |
| Uncertainty loops | Re-reading without progress | Trust the code, make the edit, verify |
| Console blindness | Didn't check console errors first | Always capture console.errors in failing tests |
| Route assumption | Assumed /lobby existed without checking | Check App.tsx routes before writing navigation tests |
| File structure ignorance | Edited PlayerView without understanding | Read full component structure before modifying |

## Key Learnings

1. **Check console errors FIRST** - The 404 error was logged immediately, would have saved 30 min
2. **Verify routes in App.tsx** - Before writing any navigation test, confirm the route exists
3. **Read file structure once deeply** - Not 20 times shallowly
4. **Make the edit** - When confident, implement; don't seek repeated confirmation
5. **Use debugging tools** - Browser traces, console logs, screenshots are faster than guessing

## Hardened Principles

- Console errors are the first place to look, not the last
- Route definitions are the source of truth for navigation tests
- Component structure must be understood before modification
- Two reads max before deciding; implement and verify
- Ask mode is for uncertainty, not for every decision
