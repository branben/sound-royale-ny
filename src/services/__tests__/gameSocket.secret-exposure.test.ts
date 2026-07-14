/**
 * SEC-1 (security) regression guard — issue #105.
 *
 * "Player secret is exposed via URL query param or console/error string.
 *  Move to Authorization header / POST body / first WS message."
 *
 * The WebSocket auth path in `src/services/gameSocket.ts` builds its connection
 * URL in `getWsUrl()` and, when no JWT `accessToken` is present, falls back to
 * putting the player secret straight into the query string:
 *
 *     url.searchParams.set('secret', this.options!.playerSecret);
 *
 * A secret in a URL leaks into server access logs, proxy logs, browser history,
 * and `Referer` headers — the classic "secret in URL" finding. The fix is to
 * stop putting the secret in the URL and instead deliver it out-of-band: as the
 * first WS message body (the transport this service already has via `send()`),
 * an `Authorization` header, or a POST body.
 *
 * This is a STRUCTURAL probe, not a log spy: it stubs the global `WebSocket`
 * constructor, captures the exact URL the service opens (and everything it later
 * sends), and asserts the raw secret value never appears in the URL. That stays
 * honest regardless of console behavior.
 *
 * Timing note: `connect()` constructs the WebSocket *synchronously* inside
 * `doConnect()`, so the fake instance exists immediately — no timer flush is
 * needed to grab it. The service also arms a 10s connect-timeout that, if it
 * fires, closes and nulls the socket; a real `onopen` clears that timeout, so
 * the test fires `onopen` (via `fireOpen`) BEFORE advancing any timers, exactly
 * as a real connection would.
 *
 * Red/green contract (verified locally):
 *   - Baseline (JWT token present)                 → secret never used → PASS today.
 *   - Guard: secret must NOT appear in the WS URL  → FAILS today (it's a query
 *                                                    param), PASSES once the fix
 *                                                    moves it out of the URL.
 *   - Guard: secret must be delivered out-of-band  → FAILS today (URL leak + no
 *     as the first WS message once connected          auth frame), PASSES once
 *                                                    the fix sends an auth frame.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const GAME_ID = 'ROOM42';
const PLAYER_ID = 'player-1';
// A distinctive, unlikely-to-collide secret so substring checks are meaningful.
const PLAYER_SECRET = 's3cr3t-SEC1-do-not-leak-in-url-105';
const ACCESS_TOKEN = 'jwt.access.token.value';

/**
 * A fake WebSocket that records the URL it was constructed with and every
 * payload passed to `send()`. It mimics enough of the browser API for the
 * service under test: the static `OPEN` constant, an instance `readyState`, and
 * `onopen`/`onmessage`/`onclose`/`onerror` assignment points.
 */
class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  static instances: FakeWebSocket[] = [];

  url: string;
  readyState = FakeWebSocket.OPEN;
  sent: string[] = [];

  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: ((event: { code: number; reason: string }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.readyState = FakeWebSocket.CLOSED;
  }

  /** Test helper: simulate the socket opening so the service runs `onopen`. */
  fireOpen(): void {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.();
  }
}

/**
 * Load a FRESH copy of the gameSocket singleton with the fake WebSocket in
 * place. The module exports a module-level singleton, so we reset the module
 * registry between tests to avoid shared connection state bleeding across them.
 */
async function loadFreshSocket() {
  vi.resetModules();
  FakeWebSocket.instances = [];
  vi.stubGlobal('WebSocket', FakeWebSocket as unknown as typeof WebSocket);
  const mod = await import('../gameSocket');
  return mod.default;
}

describe('SEC-1: player secret must not be exposed in the WebSocket URL (issue #105)', () => {
  beforeEach(() => {
    // Fake timers keep the service's connect/reconnect setTimeout()s from
    // firing real waits. We deliberately do NOT advance them before grabbing
    // the (synchronously constructed) socket or firing onopen.
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  // ---- Baseline: proves the harness captures the real connection URL. ----
  it('baseline: connecting with a JWT token opens a socket and never touches the secret', async () => {
    const gameSocket = await loadFreshSocket();

    gameSocket.connect({
      gameId: GAME_ID,
      playerId: PLAYER_ID,
      accessToken: ACCESS_TOKEN,
      onMessage: () => {},
    });

    // The socket is constructed synchronously inside connect(); no flush needed.
    const ws = FakeWebSocket.instances[0];
    expect(ws, 'a WebSocket should have been constructed').toBeTruthy();
    // The token path is used, so the raw secret is never involved at all.
    expect(ws.url).not.toContain(PLAYER_SECRET);
    expect(ws.url).toContain('token=');
  });

  // ---- Regression guard #1: secret must not ride in the URL. ----
  it('does NOT put the player secret in the WebSocket URL query string', async () => {
    const gameSocket = await loadFreshSocket();

    // No JWT token → the service falls back to secret-based auth. Today that
    // fallback stuffs the secret into the URL query string, which is the leak.
    gameSocket.connect({
      gameId: GAME_ID,
      playerId: PLAYER_ID,
      playerSecret: PLAYER_SECRET,
      onMessage: () => {},
    });

    const ws = FakeWebSocket.instances[0];
    expect(ws, 'a WebSocket should have been constructed').toBeTruthy();

    // The heart of SEC-1: the raw secret value must never appear in the URL,
    // and neither should a `secret=`/`player_secret=` query parameter carrying it.
    expect(
      ws.url,
      `WebSocket URL leaked the player secret: ${ws.url}`,
    ).not.toContain(PLAYER_SECRET);
    expect(ws.url.toLowerCase()).not.toMatch(/[?&](secret|player_secret)=/);
  });

  // ---- Regression guard #2: secret must instead be delivered out-of-band. ----
  it('delivers the player secret out-of-band (first WS message) rather than in the URL', async () => {
    const gameSocket = await loadFreshSocket();

    gameSocket.connect({
      gameId: GAME_ID,
      playerId: PLAYER_ID,
      playerSecret: PLAYER_SECRET,
      onMessage: () => {},
    });

    const ws = FakeWebSocket.instances[0];
    expect(ws, 'a WebSocket should have been constructed').toBeTruthy();

    // Simulate the connection opening so any first-message auth handshake fires.
    // Fire BEFORE advancing timers so the service's connect-timeout hasn't
    // closed/nulled the socket (a real onopen clears that timeout too).
    ws.fireOpen();

    // Positive contract for the fix: the secret is still sent to the server, but
    // through the WS message body (an auth frame), never in the URL. This fails
    // today (nothing is sent, and the secret is in the URL) and passes once the
    // fix moves auth into the first message.
    expect(ws.url).not.toContain(PLAYER_SECRET);
    const bodyContainsSecret = ws.sent.some((frame) => frame.includes(PLAYER_SECRET));
    expect(
      bodyContainsSecret,
      `Expected the secret to be sent in a WS message body once connected, ` +
        `but no sent frame contained it. URL was: ${ws.url}`,
    ).toBe(true);
  });
});
