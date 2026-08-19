# What a Healthy `main` Looks Like

This is the definition of done for the `main` branch. It is the contract every
merged PR must satisfy. It exists because we repeatedly accrued dozens of
long-lived branches whose work never reached `main`, and because some merged
branches carried agent-runtime cruft and mock-only coverage that hid real
regressions.

`main` is healthy when ALL of the following hold.

## 1. Every merged branch actually lands in `main`

- A branch only reaches `main` by a **merged PR**. Opening a branch is not
  "shipping" — merging is.
- No branch sits with unique commits forever. If a branch has been open >2 weeks
  and isn't in `main`, it is either (a) merged, (b) closed as superseded, or
  (c) explicitly tracked on a backlog. Drift between `main` and long-lived
  branches is a bug, not a feature.
- `git rev-list --count origin/main..origin/<branch>` is the source of truth for
  "is this branch ahead of `main`". If it's >0 and the PR is closed/never opened,
  the work is stranded.

## 2. E2E tests are rooted in reality, not mocks

- **Live integration tests win.** The `tests/e2e/live/` suite drives the real
  stack (Vite + Django + Postgres + Redis + WS) via Playwright against a running
  backend. These are the primary regression net.
- **Mocks are a last resort, never the default.** Mock-driven specs
  (`VITE_E2E_TESTING` fixtures, MSW, hand-rolled fakes) are acceptable ONLY for
  isolated unit coverage or to reproduce a specific race that the live stack
  can't deterministically trigger. A mock that stands in for game state, the WS
  consumer, or the audio pipeline is a **code smell** — it can pass while the
  real path is broken.
- **`VITE_E2E_TESTING=true` gates mock injection**, not the presence of tests.
  CI must run BOTH the live suite (Postgres-backed) and the unit suite. A green
  mock run is not a green pipeline.
- Every behavioral PR ships or extends a **live** e2e spec, not just a unit/mock
  assertion.

## 3. CI gates protect `main`, and they actually run

- `pnpm run lint`, `pnpm run verify:types`, `pnpm run test` (vitest), backend
  Django tests, and the Playwright **visual + live** e2e all run on every PR.
- The **visual-regression gate** (`playwright` job, Playwright
  `toHaveScreenshot`) catches content/layout/CTa regressions that the pixelrag
  job cannot. Its baselines are platform-pinned (`snapshotSuffix: 'linux'`) so
  they match `ubuntu-latest` CI. Room/mono-font routes are excluded until a
  Linux baseline-generation step exists (mac-rendered baselines can't equal
  ubuntu rasterization).
- A red CI run is a **hypothesis, not a verdict** when it routes through a local
  gateway or a leaf delegation. Re-run live before acting.
- The husky `pre-push` gate (`scripts/gaia-gate.sh`) must run in this
  environment. **Known defect:** it depends on GNU `timeout`, which is absent on
  macOS, so the gate dies with exit 127 and blocks ALL pushes. This must be
  fixed (use `gtimeout` via coreutils, or a shell-native timeout) before the
  gate can be trusted to block broken code.

## 4. `main` contains no agent-runtime or build cruft

These must NEVER be committed to `main`:

- `.scratch/`, `.omo/`, `.beads-adversarial/`, `.hermes/` runtime artifacts
- `.entire/`, `.dev.vars`, impeccable/agent skill dirs
- `node_modules`, lockfiles that fight the package manager in use
  (`bun.lock`/`package-lock.json` alongside `pnpm-lock.yaml` for a pnpm repo)
- stray `.worktrees/` left from aborted rebases

A PR whose diff contains these is **closed, not merged**, regardless of its
intended fix. Re-propose the real change as a clean, scoped PR.

## 5. No regressions disguised as "already in main"

Before merging a long-lived branch, verify the branch is an **improvement over
`main`**, not an older copy of it:

- Rebase onto current `origin/main` first.
- If the rebase results in **0 net file changes**, the work is already in `main`
  — close the PR as superseded (don't force-merge a no-op).
- If the branch's version of a file is **inferior** to `main`'s (e.g. hardcoded
  constants vs. the extracted `MIN_TILES_FOR_BINGO_RESOLUTION`, missing
  idempotency, missing error surfacing), **keep `main`'s version** during
  conflict resolution. Merging the branch would regress `main`.

## 6. Deploy config is single-source and matches architecture

- Frontend deploys to Cloudflare Pages as a static SPA; REST + WS go **directly
  to the Railway backend** (no Cloudflare Pages Function proxy). This is the
  documented architecture (AGENTS.md). A branch that re-introduces a `/api`
  Functions proxy conflicts with `main` and is rejected.
- `wrangler.toml` / `railway.toml` / `Dockerfile` changes must be consistent
  with this. Divergent deploy strategies are discussed on an issue, not snuck in
  via a fix branch.

## 7. Secrets and auth stay hardened

- Player secrets are SHA-256 hashed at rest (guardrail #105). WS auth requires
  both identifier + secret. Secret rotation is a reconnect-breaking op and is
  documented as such.
- No secret in a URL query string. No `as any` / `@ts-ignore` (CI-enforced).

## Quick health check

```bash
# Branches stranded with unique work not in main:
git ls-remote --heads origin | awk '{print $2}' | sed 's|refs/heads/||' \
  | while read b; do [ "$b" = main ] && continue; \
      n=$(git rev-list --count origin/main..origin/$b 2>/dev/null); \
      [ "$n" -gt 0 ] && echo "$n  $b"; done | sort -rn

# Redundant branches (all commits already in main — safe to delete):
for b in $(git ls-remote --heads origin | awk '{print $2}' | sed 's|refs/heads/||'); do
  [ "$b" = main ] && continue
  [ -z "$(git diff --name-only origin/main...origin/$b 2>/dev/null)" ] && echo "REDUNDANT $b"
done
```

If the first list is long and the branches are old, that is a `main`-health
problem: merge, close-as-superseded, or backlog them. Do not let work rot in
branches.
