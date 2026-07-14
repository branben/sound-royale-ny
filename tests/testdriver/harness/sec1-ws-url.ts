// SEC-1 harness: exercise the REAL production WebSocket-URL builder and reveal
// whether the player secret leaks into the connection URL.
//
// This imports the actual app module (src/services/gameSocket.ts) so the
// TestDriver assertion verifies production behavior, not a re-implementation.
// We stub the global WebSocket so no real network connection is attempted; we
// only need the URL the app hands to `new WebSocket(url)`.
import gameSocket from '@/services/gameSocket';

// A recognizable fake secret. If this string (or a `secret=`/`token=` query
// param carrying it) shows up in the connect URL, the secret is leaking.
const FAKE_SECRET = 'SUPERSECRET-LEAK-CANARY-123456';
const FAKE_PLAYER_ID = 'player-abc-123';

const urlEl = document.getElementById('ws-url') as HTMLPreElement;
const statusEl = document.getElementById('status') as HTMLDivElement;

// Intercept the URL passed to the WebSocket constructor, then neutralize the
// socket so nothing actually connects.
class CapturingWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  readyState = 0;
  url: string;
  onopen: ((ev?: unknown) => void) | null = null;
  onmessage: ((ev?: unknown) => void) | null = null;
  onclose: ((ev?: unknown) => void) | null = null;
  onerror: ((ev?: unknown) => void) | null = null;
  constructor(url: string) {
    this.url = url;
    (window as unknown as { __capturedWsUrl?: string }).__capturedWsUrl = url;
    report(url);
  }
  send() {}
  close() {
    this.readyState = 3;
  }
  addEventListener() {}
  removeEventListener() {}
}
(window as unknown as { WebSocket: unknown }).WebSocket = CapturingWebSocket;

function report(url: string) {
  urlEl.textContent = url;
  const leaks =
    url.includes(FAKE_SECRET) ||
    /[?&](secret|token|player_secret)=/.test(url);
  if (leaks) {
    statusEl.className = 'leak';
    statusEl.textContent =
      'LEAK: the player secret is present in the WebSocket URL query string.';
  } else {
    statusEl.className = 'safe';
    statusEl.textContent =
      'SAFE: no secret found in the WebSocket URL query string.';
  }
}

// Drive the real production connect path with a fake secret (no JWT token, so
// the code takes the player_secret branch — the SEC-1 leak path).
gameSocket.connect({
  gameId: 'ROOM42',
  playerId: FAKE_PLAYER_ID,
  playerSecret: FAKE_SECRET,
  accessToken: null,
  onMessage: () => {},
});
