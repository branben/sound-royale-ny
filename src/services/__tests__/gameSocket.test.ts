import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { gameSocket } from '../gameSocket';

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

describe('GameSocketService credential lifecycle', () => {
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

  it('reconnects with credentials when a player joins while the anonymous room socket is still opening', () => {
    gameSocket.connect({
      gameId: '1234',
      onMessage: vi.fn(),
    });

    expect(MockWebSocket.instances).toHaveLength(1);
    expect(MockWebSocket.instances[0].url).toBe('ws://localhost:8000/ws/game/1234/');

    gameSocket.connect({
      gameId: '1234',
      playerId: 'player-1',
      playerSecret: 'secret-1',
      onMessage: vi.fn(),
    });

    expect(MockWebSocket.instances).toHaveLength(2);
    expect(MockWebSocket.instances[0].close).toHaveBeenCalledTimes(1);

    // SEC-1 / guardrail #105: the credentialed reconnect must carry ONLY the
    // non-secret player_id in the handshake URL. The player_secret must never
    // appear in the URL (address bar, proxy/CDN access logs, Referer header,
    // or a devtools-captured WebSocket handshake).
    const reconnectUrl = MockWebSocket.instances[1].url;
    expect(reconnectUrl).toBe('ws://localhost:8000/ws/game/1234/?player_id=player-1');
    expect(reconnectUrl).not.toContain('secret');
    expect(reconnectUrl).not.toContain('secret-1');
  });

  it('SEC-1: sends the player_secret only as the first post-handshake auth message, never in the URL', () => {
    gameSocket.connect({
      gameId: '1234',
      playerId: 'player-1',
      playerSecret: 'secret-1',
      onMessage: vi.fn(),
    });

    const socket = MockWebSocket.instances.at(-1)!;

    // Before the socket opens, nothing has been sent — and the URL is clean.
    expect(socket.url).not.toContain('secret');
    expect(socket.send).not.toHaveBeenCalled();

    // The handshake completes; auth is sent as the first message on the wire.
    socket.open();

    expect(socket.send).toHaveBeenCalled();
    const authFrames = socket.send.mock.calls
      .map(([raw]) => JSON.parse(raw as string))
      .filter((msg) => msg.type === 'auth');
    expect(authFrames).toHaveLength(1);
    expect(authFrames[0]).toEqual({
      type: 'auth',
      player_id: 'player-1',
      player_secret: 'secret-1',
    });
  });

  it('SEC-1: prefers a JWT access token over the player_secret for post-handshake auth', () => {
    gameSocket.connect({
      gameId: '1234',
      playerId: 'player-1',
      playerSecret: 'secret-1',
      accessToken: 'jwt-token-abc',
      onMessage: vi.fn(),
    });

    const socket = MockWebSocket.instances.at(-1)!;
    expect(socket.url).not.toContain('secret');
    expect(socket.url).not.toContain('jwt-token-abc');

    socket.open();

    const authFrames = socket.send.mock.calls
      .map(([raw]) => JSON.parse(raw as string))
      .filter((msg) => msg.type === 'auth');
    expect(authFrames).toHaveLength(1);
    // A token is present, so it is used and the raw secret is NOT sent.
    expect(authFrames[0]).toEqual({ type: 'auth', token: 'jwt-token-abc' });
    expect(authFrames[0]).not.toHaveProperty('player_secret');
  });
});
