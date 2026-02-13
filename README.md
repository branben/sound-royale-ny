# Sound Royale 🎹

> The High-Stakes Game Show for Music Producers.
> Built with React + TypeScript + Django (PERN-like client patterns with a Python backend).

## QODO Test (Branch-specific)

This branch includes intentional anti-patterns to exercise QODO:
- Direct state mutations (frontend)
- PlayerSecret exposure (logs)
- Direct context usage instead of hooks
- Missing error handling

Expected QODO feedback:
- Flag anti-patterns and suggest immutable updates
- Identify secret exposure risks
- Recommend React/Django best practices

Tradeoffs: Keeping test antipatterns visible speeds tooling evaluation but can confuse new devs; we isolate these in test files and CI gates to limit impact.