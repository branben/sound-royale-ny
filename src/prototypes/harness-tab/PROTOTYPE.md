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

## Verdict

> **Method note.** Verdicts below are arrived at by reading each variant's source
> (`variants/*.tsx` + `data.ts`) on 2026-06-19. Chrome is not installed in this
> environment, so the prototype has not yet been seen in a real browser. The
> verdicts should be re-confirmed by a human viewing it on
> `/prototypes/harness-tab?v=A|B|C|D`. Sections flagged **needs-eye-confirmation**
> are calls that hinge on visual judgement, not code behaviour.

### A. Three-pane (Stream / Diff / History)

**Strengths**
- All three loop contexts (queue / current proposal / history) visible in one
  frame — supports an "edit while zoomed-out" reading.
- Confidence dot rating (`reflectionBatchSize / 5`) is a clean encode-minibatch-
  size-as-density primitive that works in 5 px.
- Right rail packs epoch sparkline + transfer yield + protected slow-update
  block + collapsible `best_skill.md` — the only variant that surfaces everything.
- Diff view uses colour for `+` (emerald), `-` (rose), `~` (amber) — consistent
  with terminal / IDE conventions.

**Weaknesses**
- Left rail has no overflow scroll; with >10 proposals the stream list will clip.
- Click-to-select is wired; Accept / Reject / Defer buttons render but have no
  `onClick` (prototype-acceptable, but worth noting).
- No keyboard navigation between cards — mouse only.
- Right rail is dense; on a laptop screen the sparkline + transfer yield + slow
  block compete for ~25% of width.

**Verdict: Strong default for the production home view.** It is the only
variant that lets you see loop-level context (epoch trend, transfer, slow
field) while reviewing a single proposal. Tradeoff in exchange is screen real
estate — a phone screen would suffer.

---

### B. Commit Graph (git-log swimlanes)

**Strengths**
- Time + delta shape is genuinely legible. Epoch swimlanes (dashed lines with
  validation score labels) read like a paper trail.
- Belief that "the shape matters more than the text" is a legitimate argument
  for SkillOpt-style loops where trends dominate individual edits.
- Hover behaviour is clean — bottom row of cards lights up to match the
  hovered node.
- Colour/symbol pair (`●` emerald accepted / `◐` amber pending / `✗` rose
  rejected) is unambiguous.

**Weaknesses**
- Decisions are *visual only* — no path to "revert e1 commit". Reading a
  history is not the same as steering it.
- Text labels above nodes don't dodge; with proposals clustered in time, labels
  will overlap and become illegible. **Needs-eye-confirmation.**
- `setFocus` mouse-leave handler can race against `setFocus` mouse-enter on the
  next node — flicker possible. Minor.
- Doesn't expose the actual proposed diff text — only the failure pattern in
  the bottom cards. Forces two hops (hover then read) to understand a single
  proposal.

**Verdict: Best as a *review* surface, not as the working surface.** It's the
variant to put on a release-notes / changelog / weekly-summary page. Steering
the loop from here would require a much larger redesign.

---

### C. Vertical Feed (mobile-first cards)

**Strengths**
- The only variant with **wired mutations**: Accept / Reject write to local
  component state. The header counts decisions live. This is "decision-loop in
  one column".
- Mobile-first by construction (`max-w-xl`) — works on a phone without
  reflow.
- Validation-delta colour-coded in card body (`text-emerald-600 vs rose-600`).
- Diff is collapsed by default behind a `<details>` element with a line count
  — context on demand, not always visible. Right default for a decision loop.

**Weaknesses**
- No header access to: epoch history sparkline, transfer yield, slow-update
  field. The user decides without seeing long-horizon state. **Tradeoff, not bug.**
- `SKILL_NAME_KEYWORD` is a gratuitously-named function returning a string
  constant — code smell; should be a top-level `const`. **Worth fixing if promoted.**
- "you decided · accepted" badge only appears *after* a click — but the visual
  is small (italic muted) and the card body dims to `opacity-70`. Easy to miss.
- Decisions are not undoable. No "revert my last decision" affordance. **Worth
  adding before this becomes production.**

**Verdict: Strongest candidate for an "operator" mode.** Paired with A as the
default home, switch to C when the user signs in specifically to triage a
batch of pending proposals. The wired mutations make it feel alive.

---

### D. Diff Inspector (IDE-style split)

**Strengths**
- Full-bleed before/after is the right metaphor for code review. This is the
  only variant that shows the *whole skill*, not just the diff.
- Footer is dense but well-organised: validation, confidence, transfer, three
  actions — a single bottom row, single keyboard hit to accept.
- The header has a `<select>` picker for proposals — keyboard reviewers can
  flip between proposals without using the mouse. **Rare and welcome.**
- Accepted lines get emerald background; deleted lines get rose + line-through
  + `opacity-70`. New lines are visually distinct from unchanged context in
  the candidate column.

**Weaknesses**
- `applyDiff` matches deletions by `d.text.includes(line)` — too loose.
  For the static mock data it doesn't misfire because deletions are
  well-formed, but on real SkillOpt outputs this would mis-attribute lines.
  **Bug to fix** before promotion — use a real diff library (e.g.
  `diff-match-patch`).
- The right column doesn't recompute line numbers to match the left — IDE
  diffs typically re-strike line numbers after insertions. Cosmetic, but
  noticeable to anyone with IDE muscle memory.
- Accept / Reject / Defer render with no `onClick`. Same caveat as A.
- No hover affordance on changed lines — clicking a line does nothing.
- Doesn't show *why* the optimizer proposed this edit (`reason` and
  `failurePattern` are absent) — the IDE metaphor leans entirely on the code
  itself.

**Verdict: Highest-fidelity single-proposal view.** Best as a **modal opened
from A or C**, not as the home view. The transfer-yield footer is excellent
context to keep.

---

## Aggregate recommendation

| | Home view | Operator mode | Detail modal | Release notes |
|---|---|---|---|---|
| **A — Three-pane** | primary | — | — | — |
| **B — Commit Graph** | — | — | — | fits |
| **C — Vertical Feed** | — | fits when triaging | — | — |
| **D — Diff Inspector** | — | — | fits when reading | — |

The pattern: **A as the loop-overview home, C when the user wants to steer,
D when the user wants to audit, B when the user wants to *summarise*.** No
variant alone wins. The four together form a coherent surface.

### Specific fixes before promotion

1. **D's `applyDiff`** — replace loose-text-match with a real diff library.
2. **C's undo** — add a "revert my last decision" affordance.
3. **A's overflow** — make the left stream rail scrollable.
4. **C's `SKILL_NAME_KEYWORD`** — replace with `const`.
5. All four — wire Accept / Reject / Defer `onClick` (currently decoration).

### Eye-confirmation list

1. A — does the right rail *actually* feel dense on a 13" laptop, or is the
   sparkline spacious enough?
2. B — do node labels collide when proposals cluster?
3. C — does the `opacity-70` dim on decided cards read as "done" or as "dead"?

## When done

Per the prototype skill: delete this directory or absorb the validated
decision into a real route. Don't leave a rotting prototype in `src/`.
