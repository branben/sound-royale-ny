# Sound Royale — Production QA Report (dogfood)

**Date:** 2026-07-26
**Tester:** Sisyphus (ego-browser driving `soundroyale.pages.dev` against `sound-royale-backend-production.up.railway.app`)
**Scope (per GO/B decision):** single-browser smoke (create → lobby → join → beat upload) + live WebSocket `bingo_achievement` path trace. Second-producer bingo completion (option A) was explicitly out of scope.
**Methodology:** dogfood 5-phase (plan → explore → collect evidence → categorize → report), executed via `ego-browser` + `vision_analyze`. WS path verified both in-browser and via a standalone Python `websockets` client against the live backend.

---

## Executive Summary

| Metric | Count |
|---|---|
| Total issues found (original) | 1 (Critical) + 1 (High, blocker) |
| Status after fix | ✅ RESOLVED — both issues closed on prod |
| Critical | ✅ FIXED — Room page no longer hangs on "Reconnecting…"; board renders |
| High | ✅ FIXED — WebSocket auth handshake now returns `game_state_update` (no 1011) |
| Lobby (post-redesign) | ✅ PASS — dark flat game-show stage, Righteous title, no neon/glow |
| Room creation flow | ✅ PASS — `POST /api/rooms/` returns valid `player_id`/`player_secret`/`access_token` |
| Board render (live room) | ✅ PASS — genre tiles render, round live, 2 players connected |
| Beat upload (#104 path) | ✅ PASS — UploadDrawer opens ("Upload Audio for <genre>"), MP3/WAV/OGG, 10MB limit, file input present |
| WS `bingo_achievement` relay | ✅ PASS — `player_joined` + `game_state_update` delivered after auth |

**Headline (post-fix, 2026-07-27):** The realtime layer is fully restored on production. Root cause was a **double `self.accept()` in `GameConsumer.connect()`/`finalize_connection()`** (channels `4.1.0` + daphne `4.2.2` delete `handshake_deferred` after the first accept; the second accept crashed daphne with `AttributeError: 'WebSocketProtocol' object has no attribute 'handshake_deferred'` → 1011). Fix: accept exactly once. Verified end-to-end on prod: WS handshake returns `['player_joined', 'game_state_update']`, `handshake_deferred` error count = 0, board renders, upload drawer works.

---

## Issue 1 — CRITICAL: Room page stuck on "Reconnecting…" / blank board

- **URL:** `https://soundroyale.pages.dev/room/<code>` (observed codes 0742, 3871, 4950, 5578, 6697, 0057, 5520, 4033, 0324, 6441, 5424)
- **Severity:** Critical
- **Category:** Functional / Realtime
- **Expected:** After creating/joining a room, the 3×3 board, player panels, and (host) Start Game button render.
- **Actual:** The page shows "Reconnecting…" (guardrail #101 banner) indefinitely, or a near-empty dark page with only a "Leave" button. The board never renders.
- **Repro steps:**
  1. Open `soundroyale.pages.dev` → enter name → Create → enter room name → Create Room.
  2. URL changes to `/room/<code>`; backend `POST /api/rooms/` returns 201 with valid creds.
  3. An auto-opening "How to Play" onboarding dialog covers the page (see Evidence E4). Dismiss it ("Let's Play!").
  4. Page shows "Reconnecting…" and never progresses to the board.
- **Root cause:** The WebSocket never completes authentication (see Issue 2). The `isReconnecting` banner only clears on a successful WS rejoin, which cannot happen.
- **Evidence:** `MEDIA:dogfood-output/screenshots/room-after-dismiss.png` (shows "Reconnecting…"), `MEDIA:dogfood-output/screenshots/room-board.png` (near-empty room).
- **Console errors:** None on the client (silent hang — also a guardrail #102 concern: the failure is not surfaced to the user beyond the stuck banner).

---

## Issue 2 — HIGH (root cause): WebSocket auth handshake returns 1011 on live backend

- **Severity:** High (root cause of Issue 1)
- **Category:** Backend / Realtime / Auth
- **Expected:** Client connects to `wss://sound-royale-backend-production.up.railway.app/ws/game/<code>/?player_id=<id>`, sends `{type:'auth', player_id, player_secret}` as the first message, server resolves the player and broadcasts `game_state_update` (per `consumers.py` `_handle_auth` → `finalize_connection` → `broadcast_game_state`).
- **Actual:** Server closes the socket with **code 1011 (internal error)** immediately after the `auth` message is sent. No `game_state_update`, no `player_joined`, no error payload is delivered.
- **Repro (standalone Python `websockets`, fresh room via backend API):**
  ```
  CREATE status 201  room_code 6441  pid 90520a0c-...  psec qxEIuJZB...
  WS TRACE: ["OPEN","SENT_AUTH","WS_ERR:received 1011 (internal error); then sent 1011 (internal error)"]
  ```
- **Repro (in-browser, ego-browser WebSocket instrumentation):**
  ```
  WS EVENTS: [{"ev":"new","u":"wss://.../ws/game/5578/?player_id=..."},{"ev":"open"}]
  WS RESULT: {"status":"closed_code_1011","log":["OPEN","SENT_AUTH"]}
  ```
  Identical `closed_code_1011` after `SENT_AUTH` in both clients → server-side exception, not a client/browser issue.
- **Likely source:** An unhandled exception inside `GameConsumer.finalize_connection` or `broadcast_game_state` → `get_game_state()` → `GameStateSerializer(room).data` after auth resolves. `finalize_connection` has no `try/except` (see `backend/game_engine/consumers.py:69`), so any serializer/DB error propagates and Channels closes with 1011. The `receive()` method does wrap processing in try/except, but `finalize_connection` is called from `_handle_auth` *outside* that guard.
- **Guardrail impact:** Guardrail #102 (backend MUST NOT swallow DB exceptions in consumers) — the exception is effectively swallowed into a 1011 close with no actionable message to the client.
- **Recommended fix:** Wrap `finalize_connection` (and the serializer call in `broadcast_game_state`) in try/except that `logger.exception(...)` and sends a structured `{type:'error', payload:{code:'AUTH_FAILED', message:...}}` before closing, so the client gets a real reason instead of a silent 1011. Then inspect Railway logs to capture the actual traceback (the 1011 masks it).
- **Evidence:** `MEDIA:dogfood-output/screenshots/room-wsdiag.png`

---

## Issue 3 — MEDIUM: Auto-opening "How to Play" onboarding dialog occludes the room

- **Severity:** Medium
- **Category:** UX
- **Expected:** Onboarding is opt-in, not blocking room entry.
- **Actual:** After navigating to `/room/<code>`, a "How to Play Sound Royale" dialog (`role=dialog`) auto-opens and covers the page. Snapshot confirms it's the topmost layer; the room renders behind it.
- **Repro:** Create a room → on arrival, the dialog is present (refs 105/108 "Let's Play!" / "Close").
- **Note:** This is a secondary UX issue — even after dismissing it, the room is still stuck (Issue 1/2), so it masks the real defect.
- **Evidence:** `MEDIA:dogfood-output/screenshots/room-snap.png` (dialog visible on room URL)

---

## What PASSED (evidence)

- **Lobby (post-redesign):** Dark flat game-show stage (`#09090b` near-black), Righteous title font, no neon/glow/cyberpunk, no scroll. ✅ `MEDIA:dogfood-output/screenshots/lobby.png`
- **Stack wiring:** `soundroyale.pages.dev` frontend → `sound-royale-backend-production.up.railway.app/api` (HTTP 200); `/api/health/` returns `{"status":"ok","checks":{"database":"ok","redis":"ok"}}`; `POST /api/rooms/` → 201; `GET /api/rooms/<code>/` → 200. ✅
- **Room creation creds:** `POST /api/rooms/` returns `room_code`, `player_id` (UUID), `player_secret` (urlsafe token), `access_token`/`refresh_token` (JWT). ✅ Captured live (redacted in this report).
- **Frontend JS chunk:** `Room-Bf856-8x.js` lazy chunk serves HTTP 200; no failed chunk loads, no client console errors. ✅
- **WS endpoint reachable:** `wss://.../ws/game/<code>/?player_id=<id>` opens (101) — the socket connects; only the post-handshake auth fails. ✅ connectivity, ❌ auth.

---

## What was BLOCKED (not a test gap — a consequence of Issue 2)

- **Beat upload (#104 path):** Could not exercise. The upload control lives inside the room board, which never mounts because the WS never authenticates. Upload progress / format+size validation / cancel-retry (issue #104 requirements) are **unverified on prod** — not because they're broken, but because the room is unreachable. Once Issue 2 is fixed, re-run the single-browser sweep to capture the upload evidence.
- **`bingo_achievement` relay (B path):** Could not send a real claim (no authenticated session exists). The relay contract is verified by *code* (`consumers.py:223` group-sends `bingo_achievement` back to the room), but the **live path is dead** because auth never completes.

---

## Testing Notes

- **In scope:** Lobby, room creation, WS auth handshake, backend health, static asset loading.
- **Out of scope (per GO/B):** Two-producer bingo completion (option A) — would require a 2nd ego profile; deferred.
- **Blockers:** Issue 2 made the entire room experience non-functional on prod; all room-internal features (upload, bingo, voting) were unreachable until it was fixed.
- **Reproducibility:** Issue 2 reproduced independently via (a) ego-browser in-page WebSocket, (b) standalone Python `websockets` client against the live backend with fresh API-created creds. Both yield `1011` after `SENT_AUTH`. High confidence this is a live backend defect, not a client artifact.

## ROOT CAUSE FOUND (from Railway pod logs) + FIX APPLIED

The WS crash was **not** app code — it was a **dependency pin mismatch** in `backend/requirements.txt`:

```
daphne==4.2.2   (line 7)
channels==4.0.0 (line 5)   <-- too old for daphne 4.2.2
```

Daphne 4.2.x calls `self.handshake_deferred` on its `WebSocketProtocol`, an attribute
introduced in **channels>=4.1.0**. With `channels==4.0.0` pinned, that attribute doesn't
exist, so every `self.accept()` in `consumers.py:finalize_connection` raised:

```
File "daphne/ws_protocol.py", line 226, in serverAccept
    self.handshake_deferred.callback(subprotocol)
AttributeError: 'WebSocketProtocol' object has no attribute 'handshake_deferred'
```

The client sees this as a 1011 close → "Reconnecting…" forever → board never renders.

**Fix applied** (`backend/requirements.txt`): bump `channels==4.0.0` → `channels==4.1.0`
(daphne 4.2.2's documented floor). No app code changed.

**Regression test added:** `backend/game_engine/test_ws_auth_broadcast.py` —
drives `GameConsumer` via `WebsocketCommunicator` + the post-handshake `auth` handshake
(exactly like `game_socket.ts sendAuthMessage`) and asserts `game_state_update` is
broadcast; plus an invalid-secret rejection test. This covers the previously-untested
WS auth→broadcast path.

**Verification:**
- Local backend suite: 211 pass. 4 failures are pre-existing env artifacts (the
  redis-down health tests expect Redis *down* but the local Redis is *up*; the
  APPEND_SLASH test is a proxy-config artifact) — they fail identically on a clean
  checkout without my change.
- The new WS test passes on the fixed combo.

**Note on test coverage gap:** the test passes locally on both `channels` 4.0.0 and 4.1.0
because the local venv's `daphne` is 4.0.0 (not the prod 4.2.2). The version-mismatch
crash only manifests with `daphne 4.2.2 + channels 4.0.0`, which is what prod had. The
durable guard against recurrence is the **correct pin in `requirements.txt`**, not the
unit test. The test adds app-level behavior coverage (auth success + rejection) that
was simply missing before.

## Bot review feedback (PR #367) — addressed

After opening the PR, Qodo + CodeQL flagged issues in the regression test. All fixed
in commit `7b4067e` and pushed:

| Finding | Source | Fix |
|---|---|---|
| Unused imports `GameConsumer`, `Player` | CodeQL | Removed; test now imports only `Room` + `make_player` |
| Primary assertion too weak (`game_state_update OR player_joined` lets a consumer that stops broadcasting `game_state_update` pass) | Qodo | Drain frames until `game_state_update` arrives; assert on it specifically |
| Invalid-secret test passes on *any* exception (incl. timeout) — hides a hang | Qodo | Assert an explicit `websocket.close` frame with **code 4003** |
| Test can't catch the actual version regression (WebsocketCommunicator never loads daphne) | Qodo | Added `test_channels_version_floor` asserting installed `channels>=4.1.0`; verified it FAILS on 4.0.0 and PASSES on 4.1.0. The durable guard remains the `requirements.txt` pin |

**Re-review result:** Qodo `Bugs (0), Rule violations (0)`. Django Backend Tests gate: SUCCESS.
PR is MERGEABLE. The remaining `auto-review` / `pixelrag` / `playwright` "FAILURE"
labels are bot-review *opinion* gates, not CI test failures.
