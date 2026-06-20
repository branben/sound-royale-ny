# Harness Tab — Prototype

**Status:** Throwaway. Built to answer a single design question. Do not import
from outside `/src/prototypes/harness-tab/`.

**Question being answered:**

> Can a UI legibly expose the SkillOpt loop (optimizer proposals, held-out
> validation gate, rejected-edit buffer, slow-update field, transfer yield)
> without burying the user in prompt engineering details?

## Variations

| ID | Layout | Read direction | Optimised for |
|----|--------|----------------|---------------|
| A  | Three-pane (Stream / Diff / History)  | left→right | simultaneous comparison + review queue |
| B  | Commit graph (git-log swimlanes)     | time→        | shape of optimisation over epochs |
| C  | Vertical feed (mobile-first cards)   | top→bottom   | fast single-decision loop |
| D  | Split-pane diff inspector (IDE-style)| side→side    | reading the actual skill change |

All four render the same mock SkillOpt loop data (see `data.ts`). Each answers
the question with a different emphasis.

## How to run

The prototype is reachable at `/prototypes/harness-tab` in the sound-royale-ny
SPA. The variant is selected by `?v=A|B|C|D` (the floating bottom bar
overrides it on click).

## Wiring

- Page wrapper: `src/pages/HarnessTabPrototype.tsx`
- Route: added in `src/App.tsx` `/prototypes/harness-tab`
- Lazy-loaded to avoid impacting the real app bundle

## Toy assumptions

- All data is hardcoded in `data.ts`. No proposal is generated, accepted, or
  rejected by code; only the local override in `VerticalFeed` mutates state.
- No persistence. Refresh = reset.
- "Transfer yield" is presented as a single number per axis for clarity.
- The SkillOpt loop is approximated — not a faithful implementation. The
  point is to expose the *shape* of the loop, not to run it.

## Verdict placeholder

*To be filled in after the user (or whoever) reviews the variations.*

- **A (Three-pane):** ___
- **B (Commit graph):** ___
- **C (Vertical feed):** ___
- **D (Diff inspector):** ___

## When done

Per the prototype skill: delete this directory or absorb the validated
decision into a real route. Don't leave a rotting prototype in `src/`.
