# Visual-Verify — PixelRAG visual-regression layer for Sound Royale

Renders each public route with [`pixelshot`](https://github.com/StarTrail-org/PixelRAG)
(PixelRAG), then runs deterministic design-system assertions over the screenshot
tiles. Catches what text E2E cannot: background-color drift, gradients, neon/glow,
non-solid surfaces.

Source of truth for what's allowed: `design-system/sound-royale/MASTER.md`.

## Prereqs
- Google Chrome (`/Applications/Google Chrome.app` on macOS) for the CDP backend.
- `pixelshot` on PATH: `uv tool install pixelrag` (or `pipx install pixelrag`).
- A running dev server: `pnpm exec vite --port 8081`.
- Chrome launched in remote-debugging mode:
  ```bash
  /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
    --headless=new --remote-debugging-port=9222 --no-sandbox --disable-gpu \
    --user-data-dir=/tmp/chrome-px
  ```

## Run
```bash
cd scripts/visual-verify
./capture.sh            # render all public routes -> captures/latest
node assert.mjs captures/latest   # deterministic checks -> report.json + exit code
./capture.sh --baseline # also write baselines/ (golden set)
```
Exit 0 = all deterministic checks passed. Vision-only checks (verbatim text, font
identity, layout) are listed in `vision-prompts.md` for the agent/VLM to fill.

## What it checks (deterministic)
| id | rule | source |
|----|------|--------|
| bgNearBlack | >60% of pixels near `#09090b` | MASTER bg token |
| noGradient | column-brightness std < 12/255 | "flat colors, no gradients" |
| noGlow | <1% saturated-low-luminance px | "no glow/neon" anti-pattern |
| solidSurfaces | covered by noGradient+noGlow | "solid backgrounds only" |

## CI
`.github/workflows/visual-verify.yml` runs the same steps on Ubuntu (using
`puppeteer`'s/Playwright's bundled Chromium via `--cdp-url` or the playwright
backend). It currently runs the deterministic gate; vision checks run in the
agent review loop. Fails the build on new regressions.

## Findings surfaced during build
- `src/pages/NotFound.tsx` used `bg-muted` (#27272a) instead of `bg-background`
  (#09090b) → fixed to match the dark-stage token.
