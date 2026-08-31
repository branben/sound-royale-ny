import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Minimal URLSearchParams-like object with .set()
class MockURLSearchParams {
  private params: Record<string, string> = {};
  set(key: string, value: string) {
    this.params[key] = value;
  }
  toString() {
    return Object.entries(this.params)
      .map(([k, v]) => `${k}=${v}`)
      .join('&');
  }
}

// Minimal URL mock that supports what gameSocket.ts needs
// @ts-expect-error -- minimal URL mock for tests
global.URL = class MockURL {
  protocol = 'ws:';
  pathname = '/ws/game/ABCD/';
  searchParams: MockURLSearchParams = new MockURLSearchParams();
  constructor(_url: string, _base?: string) {}
  toString() {
    const s = this.searchParams.toString();
    return `ws://localhost:8000/ws/game/ABCD/${s ? `?${s}` : ''}`;
  }
  set search(_value: string) {
    // ignore
  }
  get search() {
    const s = this.searchParams.toString();
    return s ? `?${s}` : '';
  }
};

// Minimal WebSocket mock
class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  readyState = MockWebSocket.CONNECTING;
  onopen: ((e: Event) => void) | null = null;
  onclose: ((e: CloseEvent) => void) | null = null;
  onerror: ((e: Event) => void) | null = null;
  onmessage: ((e: MessageEvent) => void) | null = null;

  close = vi.fn();
  send = vi.fn();
  addEventListener = vi.fn();
}

(global as unknown as { WebSocket: typeof MockWebSocket }).WebSocket = MockWebSocket;

// Import AFTER mocks are in place
import gameSocket from '@/services/gameSocket';

describe('triggerRefresh race condition (issue #099)', () => {
  let onConnect: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    onConnect = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
    // Ensure socket is fully torn down so no lingering timers fire.
    gameSocket.disconnect();
    vi.restoreAllMocks();
  });

  it('does NOT start a second refresh while the first onConnect() promise is still pending', async () => {
    // onConnect returns a promise that does NOT resolve immediately (simulates
    // an in-flight HTTP fetch). The race condition: refreshInFlight is cleared
    // BEFORE onConnect() resolves, so a second triggerRefresh() during the
    // fetch starts a redundant timer that calls onConnect() again.
    let resolveConnect!: () => void;
    onConnect = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveConnect = resolve;
        }),
    );

    gameSocket.connect({
      gameId: 'ABCD',
      playerId: 'player-1',
      onMessage: vi.fn(),
      onConnect,
      onDisconnect: vi.fn(),
      onError: vi.fn(),
    });

    const ws = (gameSocket as unknown as { ws: MockWebSocket }).ws;
    expect(ws).not.toBeNull();
    ws.readyState = MockWebSocket.OPEN;

    // --- First onopen: triggerRefresh #1 starts timer A ---
    ws.onopen?.({} as Event);

    // Advance 200ms: timer A fires, refreshInFlight=false, onConnect() called (promise pending).
    await vi.advanceTimersByTimeAsync(200);
    expect(onConnect).toHaveBeenCalledTimes(1);

    // --- Second onopen arrives WHILE onConnect() is still pending ---
    ws.onopen?.({} as Event);

    // Advance 200ms: timer B fires, calls onConnect() AGAIN (the bug).
    await vi.advanceTimersByTimeAsync(200);

    // BUG: onConnect was called twice. After the fix it should still be 1.
    expect(onConnect).toHaveBeenCalledTimes(1);

    // Cleanup: resolve the pending promise.
    resolveConnect();
    await vi.advanceTimersByTimeAsync(50);
  });

  it('cancels the pending refresh timer on disconnect so it does not fire after teardown', async () => {
    onConnect = vi.fn();

    gameSocket.connect({
      gameId: 'ABCD',
      playerId: 'player-1',
      onMessage: vi.fn(),
      onConnect,
      onDisconnect: vi.fn(),
      onError: vi.fn(),
    });

    const ws = (gameSocket as unknown as { ws: MockWebSocket }).ws;
    expect(ws).not.toBeNull();
    ws.readyState = MockWebSocket.OPEN;

    // Fire onopen — triggers triggerRefresh() with a 200ms timer.
    ws.onopen?.({} as Event);

    // Disconnect before the timer fires — should cancel the pending timeout.
    gameSocket.disconnect();

    // Advance past the 200ms window.
    await vi.advanceTimersByTimeAsync(250);

    // onConnect must NOT have been called — disconnect cancels the timer.
    expect(onConnect).not.toHaveBeenCalled();
  });

  it('allows a new refresh after a fully completed refresh cycle', async () => {
    onConnect = vi.fn().mockResolvedValue(undefined);

    gameSocket.connect({
      gameId: 'ABCD',
      playerId: 'player-1',
      onMessage: vi.fn(),
      onConnect,
      onDisconnect: vi.fn(),
      onError: vi.fn(),
    });

    const ws = (gameSocket as unknown as { ws: MockWebSocket }).ws;
    ws.readyState = MockWebSocket.OPEN;

    // First (re)connect cycle.
    ws.onopen?.({} as Event);
    await vi.advanceTimersByTimeAsync(250);
    expect(onConnect).toHaveBeenCalledTimes(1);

    // Second (re)connect cycle after the first fully completed — must NOT be suppressed.
    ws.onopen?.({} as Event);
    await vi.advanceTimersByTimeAsync(250);
    expect(onConnect).toHaveBeenCalledTimes(2);
  });
});
