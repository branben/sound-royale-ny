#!/usr/bin/env bash
#
# scripts/visual-verify/capture.sh
# Render routes in manifest.json to PixelRAG screenshot tiles via an attached
# Chrome DevTools instance. Public routes render directly; the auth-gated
# /room/:id route (when --seed is given) is rendered with a valid session by
# injecting creds into localStorage first.
#
# Prereqs:
#   - Google Chrome.app at /Applications/Google Chrome.app
#   - `pixelshot` on PATH (uv tool install pixelrag)
#   - Dev server running (default http://localhost:8081)
#   - Chrome launched with --remote-debugging-port=9222
#   - For --seed: Django backend running (default http://localhost:8000) and a
#     seed.json produced by `node seed-room.mjs`.
#
# Usage:
#   ./capture.sh             # public routes only
#   ./capture.sh --baseline  # also copy results into ./baselines/ (golden set)
#   ./capture.sh --seed      # also render /room/:id using seed.json creds
set -euo pipefail

export PATH="$HOME/.local/bin:$HOME/.local/share/uv/tools/pixelrag/bin:$PATH"
PIXELSHOT="$(command -v pixelshot || true)"
if [ -z "$PIXELSHOT" ]; then
  echo "ERROR: pixelshot not found on PATH. Install: uv tool install pixelrag" >&2
  exit 1
fi

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$HERE"

CDP_URL="${PIXELSHOT_CDP_URL:-http://localhost:9222}"
BASE_URL="${SR_BASE_URL:-http://localhost:8081}"
SEED="${SR_SEED_JSON:-$HERE/seed.json}"
USE_SEED=0
USE_BASELINE=0
for a in "$@"; do
  case "$a" in
    --seed) USE_SEED=1 ;;
    --baseline) USE_BASELINE=1 ;;
  esac
done

RUN_DIR="captures/$(date +%Y%m%d-%H%M%S)"
mkdir -p "$RUN_DIR"

echo "==> PixelRAG capture | base=$BASE_URL cdp=$CDP_URL seed=$USE_SEED"
echo "==> pixelshot: $PIXELSHOT"
echo "==> run dir: $RUN_DIR"

if ! curl -s -m 3 "$CDP_URL/json/version" >/dev/null; then
  echo "ERROR: Chrome CDP not reachable at $CDP_URL." >&2
  echo "Launch: /Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome --headless=new --remote-debugging-port=9222 --no-sandbox --disable-gpu --user-data-dir=/tmp/chrome-px" >&2
  exit 1
fi
if ! curl -s -m 4 "$BASE_URL/" -o /dev/null; then
  echo "ERROR: Dev server not reachable at $BASE_URL. Start: pnpm exec vite --port 8081" >&2
  exit 1
fi

# Validate seed prerequisites up front (fail loudly, not mid-loop).
if [ "$USE_SEED" -eq 1 ]; then
  if [ ! -f "$SEED" ]; then
    echo "ERROR: --seed requires seed.json ($SEED). Run: node seed-room.mjs" >&2
    exit 1
  fi
  SR_PUBLIC="$(cd "$HERE/../.." && pwd)/public"
  if [ ! -d "$SR_PUBLIC" ]; then
    echo "ERROR: could not locate project public/ dir (expected $SR_PUBLIC)" >&2
    exit 1
  fi
  echo "==> seed mode: injecting creds from $SEED into $SR_PUBLIC/seed.html"
fi

FAILED=0

capture_route() {
  local path="$1" name="$2" seedable="$3"
  local url="$BASE_URL$path"
  echo "--- [$name] $url"
  local log="$RUN_DIR/${name}.log"
  local route_out="$RUN_DIR/_raw_$name"
  mkdir -p "$route_out"

  if [ "$seedable" = "1" ] && [ "$USE_SEED" -eq 1 ]; then
    # 1) Write a same-origin seed page that reconstructs the FULL UserContext
    #    session (see src/context/UserContext.tsx) then redirects to /room/:id.
    #    - JWT tokens (GameContext reads these on mount)
    #    - soundRoyaleSessions map: "<roomCode>:<playerId>" -> StoredRoomSession
    #    - soundRoyaleActiveSessionKey (localStorage AND sessionStorage): the key
    #    readInitialSession() pulls from sessionStorage to repopulate the session
    #    location.replace keeps the document in the SAME target, so a single
    #    --wait-network-idle capture ends on the room page with the host joined.
    local code pid secret at rt pname
    code="$(python3 -c 'import json;print(json.load(open("'"$SEED"'"))["roomCode"])')"
    pid="$(python3 -c 'import json;print(json.load(open("'"$SEED"'"))["playerId"])')"
    secret="$(python3 -c 'import json;print(json.load(open("'"$SEED"'"))["playerSecret"])')"
    at="$(python3 -c 'import json;print(json.load(open("'"$SEED"'"))["accessToken"])')"
    rt="$(python3 -c 'import json;print(json.load(open("'"$SEED"'"))["refreshToken"])')"
    pname="$(python3 -c 'import json;print(json.load(open("'"$SEED"'"))["playerName"])')"
    local skey="${code}:${pid}"
    cat > "$SR_PUBLIC/seed.html" <<EOF
<!doctype html><meta charset="utf-8"><body><script>
localStorage.setItem('soundRoyaleAccessToken','$at');
localStorage.setItem('soundRoyaleRefreshToken','$rt');
var sess = {};
sess['$skey'] = {roomCode:'$code',playerName:'$pname',playerId:'$pid',playerSecret:'$secret',isSpectator:false,isHost:true};
localStorage.setItem('soundRoyaleSessions', JSON.stringify(sess));
localStorage.setItem('soundRoyaleActiveSessionKey', '$skey');
sessionStorage.setItem('soundRoyaleActiveSessionKey', '$skey');
location.replace('/room/$code');
</script></body></html>
EOF
    # 2) Single capture of the seed URL; wait for the redirect + room render to
    #    settle, then rename the produced tile to <name>.png.tiles.
    if "$PIXELSHOT" "$BASE_URL/seed.html" -o "$route_out" --backend cdp --cdp-url "$CDP_URL" --wait-network-idle >"$log" 2>&1; then
      rm -f "$SR_PUBLIC/seed.html"
      if grep -q "failed=0" "$log"; then
        local src
        src="$(find "$route_out" -maxdepth 2 -type d -name '*.png.tiles' | head -1)"
        local dst="$RUN_DIR/${name}.png.tiles"
        if [ -n "$src" ] && [ ! -e "$dst" ]; then
          mv "$src" "$dst"; echo "    ok -> $name.png.tiles (seeded)"
        elif [ -n "$src" ]; then
          echo "    ok (already $name.png.tiles)"
        else
          echo "    CAPTURE FAILED (no tile dir produced)" >&2; FAILED=$((FAILED+1))
        fi
      else
        rm -f "$SR_PUBLIC/seed.html"
        echo "    CAPTURE FAILED (pixelshot did not report success)" >&2; tail -3 "$log" >&2; FAILED=$((FAILED+1))
      fi
    else
      rm -f "$SR_PUBLIC/seed.html"
      echo "    CAPTURE FAILED (pixelshot exit non-zero)" >&2; tail -3 "$log" >&2; FAILED=$((FAILED+1))
    fi
    rm -rf "$route_out"
    return
  fi

  if "$PIXELSHOT" "$url" -o "$route_out" --backend cdp --cdp-url "$CDP_URL" >"$log" 2>&1; then
    if grep -q "failed=0" "$log"; then
      local src
      src="$(find "$route_out" -maxdepth 2 -type d -name '*.png.tiles' | head -1)"
      local dst="$RUN_DIR/${name}.png.tiles"
      if [ -n "$src" ] && [ ! -e "$dst" ]; then
        mv "$src" "$dst"; echo "    ok -> $name.png.tiles"
      elif [ -n "$src" ]; then
        echo "    ok (already $name.png.tiles)"
      else
        echo "    CAPTURE FAILED (no tile dir produced)" >&2; FAILED=$((FAILED+1))
      fi
    else
      echo "    CAPTURE FAILED (pixelshot did not report success)" >&2; tail -3 "$log" >&2; FAILED=$((FAILED+1))
    fi
  else
    echo "    CAPTURE FAILED (pixelshot exit non-zero)" >&2; tail -3 "$log" >&2; FAILED=$((FAILED+1))
  fi
  rm -rf "$route_out"
}

# Public routes
while IFS= read -r entry; do
  capture_route \
    "$(echo "$entry" | python3 -c 'import sys,json;print(json.load(sys.stdin)["path"])')" \
    "$(echo "$entry" | python3 -c 'import sys,json;print(json.load(sys.stdin)["name"])')" \
    0
done < <(python3 -c '
import json
m=json.load(open("manifest.json"))
for r in m["routes"]:
    print(json.dumps(r))
')

# Seeded room route
if [ "$USE_SEED" -eq 1 ]; then
  code="$(python3 -c 'import json;print(json.load(open("'"$SEED"'"))["roomCode"])')"
  echo "--- [room] $BASE_URL/room/$code (seeded)"
  capture_route "/room/$code" "room" 1
fi

echo
[ "$FAILED" -gt 0 ] && { echo "==> $FAILED route(s) failed to capture." >&2; exit 1; }

rm -f captures/latest
ln -s "$(basename "$RUN_DIR")" captures/latest

if [ "$USE_BASELINE" -eq 1 ]; then
  echo "==> writing golden baselines"
  rm -rf baselines
  cp -R "$RUN_DIR" baselines
  echo "    baselines/ <- $RUN_DIR"
fi

echo "==> done. Tiles under $RUN_DIR (latest -> captures/latest)"
