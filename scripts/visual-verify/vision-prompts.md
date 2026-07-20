# scripts/visual-verify/vision-prompts.md

PixelRAG renders each route to `captures/latest/<route>.png.tiles/tile_0000.jpg`.
The deterministic `assert.mjs` covers color/gradient/glow. The checks below need
a vision model (the agent or a VLM) — paste the tile into the vision tool with the
prompt under each route. Record PASS/FAIL + notes into `report.md`.

Authoritative spec: `design-system/sound-royale/MASTER.md`.

## Per-route vision prompt

> Read this screenshot of the Sound Royale route `<ROUTE>`. Verify against the
> "polished Jackbox" design system:
> 1. Background is near-black (#09090b) flat — NOT a gradient, NOT a glow.
> 2. Any surfaces/cards are solid #18181b with #3f3f46 borders — no glass/blur.
> 3. Player colors (red/blue/yellow/green) appear ONLY as borders/highlights, never
>    as large fills or neon glow.
> 4. Exactly one red (#EF4444) primary CTA per view; others are outline/ghost.
> 5. Titles use Righteous, body uses Poppins (visually, not via devtools).
> 6. No broken/empty modal, no overlapping elements, no always-on pulse/spin.
> 7. Report any verbatim text that looks wrong or missing.
> Output: PASS or FAIL with the specific violation.

Routes:
- lobby            → captures/latest/lobby.png.tiles/tile_0000.jpg
- spectator-index  → captures/latest/spectator-index.png.tiles/tile_0000.jpg
- producer         → captures/latest/producer.png.tiles/tile_0000.jpg
- admin-themes     → captures/latest/admin-themes.png.tiles/tile_0000.jpg
- admin-players    → captures/latest/admin-players.png.tiles/tile_0000.jpg
- leaderboard      → captures/latest/leaderboard.png.tiles/tile_0000.jpg
- discord-callback → captures/latest/discord-callback.png.tiles/tile_0000.jpg
- not-found        → captures/latest/not-found.png.tiles/tile_0000.jpg
