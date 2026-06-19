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
    expect(MockWebSocket.instances[1].url).toBe(
      'ws://localhost:8000/ws/game/1234/?player_id=player-1&secret=secret-1',
    );
  });
});
