# PixelRAG as a Visual-Verification Layer for Sound Royale

**Date:** 2026-07-19 | **Status:** PROVEN END-TO-END (live capture + vision on SR UI)

## A. What "vision of using pixelrag" means here (PROVEN)

PixelRAG (StarTrail-org, local clone at `~/PixelRAG` == origin) ships `pixelshot`
to render any page to screenshot tiles, plus a vision/embedding pipeline. For SR
we use it as a **visual-regression verification layer**: render a route → read the
tile with vision → assert it looks correct / diff against a baseline.

Live proof this session (all real, no fabrication):
1. Chrome launched in remote-debugging mode on this Mac
   (`/Applications/Google Chrome.app` exists; `--remote-debugging-port=9222`).
2. `pixelshot <url> --backend cdp --cdp-url http://localhost:9222` renders to
   tiles. Public URL test: `example.com` → 1 tile in 0.5s.
3. Vite frontend booted (`pnpm exec vite --port 8081`), HTTP 200.
4. `pixelshot http://localhost:8081/` → 1 tile in 0.4s.
5. Vision read the SR landing tile and returned a **verbatim, structured**
   description (branding "SOUND ROYALE", How-to-Play modal, "Let's Play!" CTA,
   color inventory). This is exactly the pixelbrowse "render → read image" pattern.

So: I personally have vision of it. No further tool understanding is needed.
The remaining work is turning the one-off capture into a **durable layer**.

## B. Remaining blockers for Sound Royale (prioritized)

P0 — Pipeline trust
- #137 E5: Re-verify full CI green before trusting pipeline.
- #134 E2: Wire Django+Redis backend into E2E Full Suite CI.
- #136 E4: Stand up deploy target + set SOUND_ROYALE_URL (no reachable instance).

P0 — Security
- #135 E3: Remove player secret from URL query params (#105 guardrail, still live).

P1 — E2E / visual debt (PixelRAG layer helps here)
- #249: ~60 residual E2E failures (82/143 pass).
- #169: 54 stale Playwright specs (test rot).
- #133 E1: design-system regression (ReconnectingBanner side-tab + animate-pulse).

P1 — PR/branch cleanup (parent session owns gh; AFK students get no gh creds)
- #231/#205/#204/#203/#202: ~37 bot PRs + 21 contaminated TestDriver PRs.

P2 — Error-handling guardrail
- #102: replace silent error handling with user-visible feedback.

NOTE: churn issues #338–#343 are still OPEN in gh but several commits on `main`
reference them (e.g. "close missed sites"). Verify closure before listing as blockers.

## C. PixelRAG verification layer — design

**Architecture (3 stages):**
```
Chrome(CDP :9222)  →  pixelshot --cdp-url  →  tiles/*.jpg  →  vision diff  →  report
   (baseline)                                                        (md + json)
```
- `scripts/visual-verify/` harness:
  - `manifest.json`: routes to capture (start with 11 public pages).
  - `capture.mjs` / `.sh`: boot/attach Chrome, loop routes, call `pixelshot`.
  - `audit.mjs`: for each tile, run vision with a fixed assertion prompt
    (verbatim text present? layout sane? no overlap/blank/broken modal?),
    return PASS/FAIL + diff vs committed baseline tile.
  - `report.md` + `report.json`: regressions flagged, gated in CI.
- Committed baselines: `tests/visual-baseline/<route>/tile_0000.jpg` (golden).
- CI gate: run after `verify:types`/`lint`; fail build on new regressions.

**What's needed to make it durable:**
1. Route manifest covering all 11 pages.
2. Committed golden baselines (first clean run).
3. Vision prompt tuned for SR assertions (text-presence, no-empty-modal,
   player-color borders only, flat-not-neon per design system).
4. CI wiring (GitHub Action reusing the existing `e2e-guard.sh` pattern).
5. **The one real gap — authenticated/room-state routes:** Room, Producer,
   Lobby, Leaderboard require a joined room + WebSocket/cookies
   (player_id + player_secret in context/localStorage). Raw `pixelshot`
   hits them unauthenticated → blank/redirect. Need a seed step that
   creates a room via API and injects creds before capture. Stub public
   routes first; add seeded capture second.

**Candidate finding surfaced by the layer (verify, don't assert):**
- SR landing renders on a **black background** with multicolor neon-ish accents
  (red/cyan/purple/green/orange). AGENTS.md mandates "polished Jackbox aesthetic,
  flat colors, no dark-tech/cyberpunk/synthwave." A black bg may be a design-system
  deviation — confirm against `design-system/sound-royale/MASTER.md`. This is
  exactly the class of issue the visual layer catches that text E2E cannot.

## D. Recommended next step (decisive)

**Build the visual-verify harness now, public routes first.**
Rationale: it is the highest-leverage move because it (a) directly closes the
visual-coverage gap behind #133/#169/#249 that text E2E cannot see, (b) requires
zero new dependencies (Chrome + pixelshot already work), (c) gives you a regression
net that runs in CI alongside `lint`/`verify:types`. Authenticated-route seeding
(#5 above) is a follow-up, not a blocker for the first pass.

Decisive pick over alternatives: a snapshot/visual-diff tool (Percy/Chromatic)
would cost a SaaS account and API key; PixelRAG is already installed and local,
and its tiles+vison approach fits the repo's no-secret, local-first preference.
