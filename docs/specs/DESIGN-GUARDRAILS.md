# Sound Royale — Design System Guardrails

Generated 2026-07-08. Source of truth: `design-guardrails.json` (this doc is rendered from it).
Token source of truth: `src/index.css` (HSL vars) + `tailwind.config.ts` (theme.extend).

A design system is only real if violations are caught. These rules are **enforced** (wired to a detector/ESLint in CI), not documented-and-ignored.

## Allowed tokens (the ONLY values)
**Colors** (all `hsl(var(--token))`): background, foreground, card, popover, primary, secondary, muted, accent, destructive, border, input, ring, sidebar-*, chart-1..5, player-1..4, success, warning, error.

**Radii**: lg=`var(--radius)`, md=`calc(var(--radius)-2px)`, sm=`calc(var(--radius)-4px)`; `--radius=0.5rem`.

**Fonts**: sans=Poppins stack, display=Righteous, mono=SF Mono stack.

**Animations** (only these keyframes may be used): card-enter, fade-in, scale-in, slide-up, timer-urgent, glow, accordion-down, accordion-up.

**Shadows**: shadow-sm / shadow / shadow-md / shadow-lg — pure black rgba, no color tint.

## Banned patterns (fail the build)
| ID | Pattern | Why |
|----|---------|-----|
| hardcoded-hex | `bg-[#ef4444]`, `text-[#fff]`, etc. | Use semantic tokens. |
| hardcoded-rgb | `bg-[rgba(0,0,0,0.5)]` | Raw rgba bypasses token system. |
| hardcoded-hsl-class | `bg-[hsl(0_84%_60%)]` | Use token class, not inline hsl. |
| offscale-spacing | `p-[37px]`, `gap-[13px]` | Use the Tailwind spacing scale. |
| offscale-radius | `rounded-[13px]` | Use rounded-lg/md/sm. |
| raw-color-word | `bg-red-500`, `text-zinc-400` | Only semantic tokens exist in this system. |

## Allowed exceptions
- `bg-[url(...)]` — background images (album art) are legitimate.
- `transparent` / `inherit` / `currentColor` — legitimate non-token values.
- `opacity-[n]` / `z-[n]` — routine safe overrides.

## Policy
- `no-hardcoded-color: true`
- `no-arbitrary-value: true`
- `tokens-must-exist: true`
- **Enforcement: `warn`** (ratchet to `error` after a cleanup PR removes current violations).

## Why `warn` first
Banning instantly on many violations recreates the gate-rot problem this session fixed (the polecat blocked every push because `main` failed pre-existing rules). Start in `warn`, surface the violations, clean them in one PR, then flip to `error`. This makes the design system real without blocking the team.
