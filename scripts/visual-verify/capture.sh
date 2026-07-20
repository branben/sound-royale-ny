#!/usr/bin/env bash
#
# scripts/visual-verify/capture.sh
# Render every PUBLIC route in manifest.json to PixelRAG screenshot tiles via
# an attached Chrome DevTools instance. Produces tiles under ./captures/<run>/,
# each renamed to <route-name>.png.tiles so assert.mjs can find them.
#
# Prereqs (already proven working on this macOS host):
#   - Google Chrome.app at /Applications/Google Chrome.app
#   - `pixelshot` on PATH (uv tool install pixelrag) — we also auto-prepend
#     ~/.local/bin and the uv tool bin so this works under non-login shells.
#   - A running dev server (default http://localhost:8081)
#   - Chrome launched with --remote-debugging-port=9222
#
# Usage:
#   ./capture.sh             # render all public routes
#   ./capture.sh --baseline  # also copy results into ./baselines/ (golden set)
set -euo pipefail

# Ensure pixelshot (uv tool) is on PATH even under non-login bash.
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
RUN_DIR="captures/$(date +%Y%m%d-%H%M%S)"
mkdir -p "$RUN_DIR"

echo "==> PixelRAG capture | base=$BASE_URL cdp=$CDP_URL"
echo "==> pixelshot: $PIXELSHOT"
echo "==> run dir: $RUN_DIR"

if ! curl -s -m 3 "$CDP_URL/json/version" >/dev/null; then
  echo "ERROR: Chrome CDP not reachable at $CDP_URL." >&2
  echo "Launch it:" >&2
  echo "  /Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome \\" >&2
  echo "    --headless=new --remote-debugging-port=9222 --no-sandbox --disable-gpu \\" >&2
  echo "    --user-data-dir=/tmp/chrome-px" >&2
  exit 1
fi

if ! curl -s -m 4 "$BASE_URL/" -o /dev/null; then
  echo "ERROR: Dev server not reachable at $BASE_URL. Start it: pnpm exec vite --port 8081" >&2
  exit 1
fi

# Slug handling is unnecessary — each route captures into its own temp dir and
# the inner *.png.tiles is moved directly to <name>.png.tiles (see loop).

FAILED=0
while IFS= read -r entry; do
  path="$(echo "$entry" | python3 -c 'import sys,json;print(json.load(sys.stdin)["path"])')"
  name="$(echo "$entry" | python3 -c 'import sys,json;print(json.load(sys.stdin)["name"])')"
  url="$BASE_URL$path"
  echo "--- [$name] $url"
  log="$RUN_DIR/${name}.log"
  # Capture each route into its OWN temp dir so pixelshot's (opaque) slug naming
  # doesn't matter — the single *.png.tiles inside is unambiguously this route.
  route_out="$RUN_DIR/_raw_$name"
  mkdir -p "$route_out"
  if "$PIXELSHOT" "$url" -o "$route_out" --backend cdp --cdp-url "$CDP_URL" >"$log" 2>&1; then
    if grep -q "failed=0" "$log"; then
      src="$(find "$route_out" -maxdepth 2 -type d -name '*.png.tiles' | head -1)"
      dst="$RUN_DIR/${name}.png.tiles"
      if [ -n "$src" ] && [ ! -e "$dst" ]; then
        mv "$src" "$dst"
        echo "    ok -> $name.png.tiles"
      elif [ -n "$src" ]; then
        echo "    ok (already $name.png.tiles)"
      else
        echo "    CAPTURE FAILED (no tile dir produced)" >&2
        FAILED=$((FAILED+1))
      fi
    else
      echo "    CAPTURE FAILED (pixelshot did not report success)" >&2
      tail -3 "$log" >&2
      FAILED=$((FAILED+1))
    fi
  else
    echo "    CAPTURE FAILED (pixelshot exit non-zero)" >&2
    tail -3 "$log" >&2
    FAILED=$((FAILED+1))
  fi
  rm -rf "$route_out"
done < <(python3 -c '
import json
m=json.load(open("manifest.json"))
for r in m["routes"]:
    print(json.dumps(r))
')

echo
if [ "$FAILED" -gt 0 ]; then
  echo "==> $FAILED route(s) failed to capture." >&2
  exit 1
fi

rm -f captures/latest
ln -s "$(basename "$RUN_DIR")" captures/latest

if [ "${1:-}" = "--baseline" ]; then
  echo "==> writing golden baselines"
  rm -rf baselines
  cp -R "$RUN_DIR" baselines
  echo "    baselines/ <- $RUN_DIR"
fi

echo "==> done. Tiles under $RUN_DIR (latest -> captures/latest)"
