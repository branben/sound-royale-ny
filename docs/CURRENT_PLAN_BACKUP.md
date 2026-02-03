# 📍 CURRENT MISSION: Hardening the User Flow (Phase 1)

**Status:** 🏗️ IN PROGRESS
**Priority:** CRITICAL (Data Loss & UX Prevention)
**Owner:** Sisyphus (Builder)

## 🎯 OBJECTIVE
Address the top 4 critical gaps identified in the "Edge Case Analysis" to prevent silent failures during file uploads and connection drops.

## 🔍 CONTEXT & DIAGNOSIS
* **Gap 1 (Uploads):** No client-side validation allows 100MB+ files to choke the network.
* **Gap 2 (UX):** Users have no visual feedback during uploads (Optimistic UI is too aggressive).
* **Gap 3 (WebSocket):** No connection timeout means the app can "hang" indefinitely.
* **Gap 4 (Stability):** Rapid reconnection attempts can DDOS our own server (Thundering Herd).

## 📝 EXECUTION STEPS
### 1. File Upload Hardening
- [ ] **A. Size Limit:** Modify `src/components/game/UploadDrawer.tsx` to reject files > 50MB before sending.
- [ ] **B. Progress UI:** Implement `onUploadProgress` in `gameApi.submitTile` and visualize it (e.g., simple % text or progress bar).

### 2. Connection Resilience
- [ ] **C. Connection Timeout:** Update `src/context/GameContext.tsx` to trigger an error toast if WebSocket doesn't connect within 10s.
- [ ] **D. Backoff Strategy:** Implement exponential backoff (1s, 2s, 4s...) for reconnection logic in `connectWebSocket()`.

## 📂 TARGET FILES
* `src/components/game/UploadDrawer.tsx`
* `src/services/api.ts` (or `gameApi` definition)
* `src/context/GameContext.tsx`

## 🧪 VERIFICATION COMMANDS
* **Manual Test 1:** Try uploading a >50MB dummy file. -> Expect "File too large" toast.
* **Manual Test 2:** Throttle network to "Slow 3G" in DevTools and upload. -> Expect progress indicator.
* **Manual Test 3:** Disconnect WiFi -> Check console for "Retrying in 1s... 2s...".