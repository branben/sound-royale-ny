# Domain Docs — sound-royale-ny

## Layout: SINGLE-CONTEXT
- One `CONTEXT.md` at the repo root holds the project's domain language and architecture summary.
- No `docs/adr/` directory exists yet. When architectural decisions are recorded, create
  `docs/adr/` and reference them from `CONTEXT.md`.

## Consumer rules (for engineering skills)
- `improve-codebase-architecture`, `diagnose`, `tdd` read `CONTEXT.md` first to learn
  domain terms (e.g. "producer", "spectator", "round", "bingo", "ELO", "match type =
  casual|ranked", "playerSecret").
- Do NOT invent domain terms not present in `CONTEXT.md`; if a term is missing, flag it
  rather than assuming meaning.

## Domain glossary (seed — verify against CONTEXT.md)
- **Producer**: a playing participant who submits audio tiles for assigned genres.
- **Spectator**: a non-playing participant; in ranked mode, >=3 spectators gate voting.
- **Round**: a timed segment; casual rounds end on time-up with NO voting; ranked rounds
  require spectator voting.
- **Bingo**: the win condition (completed lines on the board).
- **ELO**: rating that updates only in ranked mode; casual results must NOT affect it.
- **playerSecret**: per-player auth secret; must never appear in console logs (PII safety).
- **match_type**: `casual` | `ranked` — drives voting/elo rules.
