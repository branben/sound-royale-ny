# SEC-1 harness — WebSocket URL secret leak

Standalone page used by `tests/testdriver/sec1-secret-leak.test.mjs` to verify
the **SEC-1** security property (issue #105): the player secret must **not** be
exposed in the WebSocket connection URL.

## What it does

`sec1-ws-url.ts` imports the **real** app module `src/services/gameSocket.ts`,
stubs the global `WebSocket` to capture the URL the app would connect to, then
calls `gameSocket.connect()` with a recognizable fake secret. The page renders:

- **LEAK** (red) — the secret / a `secret=`/`token=` query param is in the URL
  (current behavior — `getWsUrl()` does `url.searchParams.set('secret', …)`).
- **SAFE** (green) — no secret in the URL (expected once SEC-1 is fixed by
  moving the secret to an `Authorization` header / POST body / first WS message).

Because it bundles the production module, the test verifies real code, not a
re-implementation.

## Build

The TestDriver test builds this on demand (its `dist/` output is git-ignored).
To build manually:

```bash
npx vite build --config vite.harness.config.mjs
# outputs tests/testdriver/harness/dist/{index.html,assets/*.js}
```
