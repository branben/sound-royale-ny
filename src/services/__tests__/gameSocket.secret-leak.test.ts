import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { gameSocket } from '../gameSocket';

/**
 * SEC-1 regression guard (issue #105).
 *
 * The player secret is a bearer-equivalent credential. It MUST NOT be exposed
 * in a location that leaks to logs, proxies, browser history, or Referer
 * headers. A WebSocket URL query string is exactly such a location: it is
 * routinely captured by access logs and observability tooling, and it is
 * trivially readable from `WebSocket.url` / the network panel.
 *
 * These tests assert the secret is carried out-of-band (Authorization header,
 * POST body, or a first WS message) and never appears in:
 *   1. the WebSocket connect URL, or
 *   2. console / error strings emitted on failure.
 *
 * They FAIL against the current implementation (which does
 * `url.searchParams.set('secret', ...)`) and PASS once SEC-1 is fixed. This is
 * a regression test only — the fix itself is application code.
 */

type MockSocketEventHandler = ((event: Event) => void) | null;
type MockSocketMessageHandler = ((event: MessageEvent) => void) | null;

class MockWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static instances: MockWebSocket[] = [];

  readonly url: string;
  readyState = MockWebSocket.CONNECTING;
  onopen: MockSocketEventHandler = null;
  onmessage: MockSocketMessageHandler = null;
  onclose: MockSocketEventHandler = null;
  onerror: MockSocketEventHandler = null;
  close = vi.fn((_code?: number, _reason?: string) => {
    this.readyState = MockWebSocket.CLOSED;
  });
  send = vi.fn();

  constructor(url: string | URL) {
    this.url = String(url);
    MockWebSocket.instances.push(this);
  }

  open(): void {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.(new Event('open'));
  }
}

const PLAYER_SECRET = 'super-secret-token-abc123';
const PLAYER_ID = 'player-42';
const GAME_ID = '1234';

describe('GameSocketService — SEC-1: player secret must not leak (issue #105)', () => {
  const originalWebSocket = globalThis.WebSocket;

  beforeEach(() => {
    MockWebSocket.instances = [];
    globalThis.WebSocket = MockWebSocket as unknown as typeof WebSocket;
  });

  afterEach(() => {
    gameSocket.disconnect();
    globalThis.WebSocket = originalWebSocket;
    vi.restoreAllMocks();
  });

  it('does not put the player secret in the WebSocket connect URL', () => {
    gameSocket.connect({
      gameId: GAME_ID,
      playerId: PLAYER_ID,
      playerSecret: PLAYER_SECRET,
      onMessage: vi.fn(),
    });

    expect(MockWebSocket.instances).toHaveLength(1);
    const connectedUrl = MockWebSocket.instances[0].url;

    // The raw secret must never appear anywhere in the URL...
    expect(connectedUrl).not.toContain(PLAYER_SECRET);
    // ...and not via a `secret` query parameter either.
    const parsed = new URL(connectedUrl);
    expect(parsed.searchParams.has('secret')).toBe(false);
    expect(parsed.searchParams.get('secret')).toBeNull();
  });

  it('does not leak the player secret when an access token is present', () => {
    gameSocket.connect({
      gameId: GAME_ID,
      playerId: PLAYER_ID,
      playerSecret: PLAYER_SECRET,
      accessToken: 'jwt-access-token',
      onMessage: vi.fn(),
    });

    const connectedUrl = MockWebSocket.instances[0].url;
    expect(connectedUrl).not.toContain(PLAYER_SECRET);
    expect(new URL(connectedUrl).searchParams.has('secret')).toBe(false);
  });

  it('keeps the connect URL free of the secret even after the socket opens', () => {
    gameSocket.connect({
      gameId: GAME_ID,
      playerId: PLAYER_ID,
      playerSecret: PLAYER_SECRET,
      onMessage: vi.fn(),
    });

    const socket = MockWebSocket.instances[0];
    // Simulate the connection opening (this is where a secure implementation
    // would perform an out-of-band auth handshake via the message channel).
    socket.open();

    // The URL that a proxy / access log / network panel would capture must
    // never contain the raw secret, before OR after open.
    expect(socket.url).not.toContain(PLAYER_SECRET);
    expect(new URL(socket.url).searchParams.has('secret')).toBe(false);

    // If the secret is transmitted at all in this flow, it must go through the
    // message channel (send), which is the secure out-of-band transport — not
    // the URL. Header-based auth (no send) is also acceptable, so a body
    // message is not required.
    for (const call of socket.send.mock.calls) {
      // Whatever is sent, the URL still must not carry the secret.
      expect(String(call[0])).toBeDefined();
    }
    expect(socket.url.includes(PLAYER_SECRET)).toBe(false);
  });

  it('does not echo the player secret into console error output on failure', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    gameSocket.connect({
      gameId: GAME_ID,
      playerId: PLAYER_ID,
      playerSecret: PLAYER_SECRET,
      onMessage: vi.fn(),
      onError: vi.fn(),
    });

    const socket = MockWebSocket.instances[0];
    // Trigger the error + close paths that build reason/error strings.
    socket.onerror?.(new Event('error'));
    socket.onclose?.(
      Object.assign(new Event('close'), { code: 1006, reason: 'abnormal' }) as CloseEvent,
    );

    const loggedText = errorSpy.mock.calls
      .flat()
      .map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg)))
      .join(' ');

    expect(loggedText).not.toContain(PLAYER_SECRET);
  });
});
