/**
 * SEC-1 regression tests — issue #105.
 *
 * The player secret is a bearer-equivalent credential. It MUST NOT be exposed
 * in a URL (query string) or leaked into console / error strings, because those
 * surfaces are routinely captured by:
 *   - browser history and the address bar,
 *   - server / proxy / CDN access logs (which log full request lines incl. the
 *     query string, and for WebSockets the upgrade request URL),
 *   - Referer headers sent to third parties,
 *   - client-side error trackers and console output.
 *
 * The fix for SEC-1 is to move the secret to an Authorization header, a POST
 * body, or the first WebSocket message after connect — never the URL.
 *
 * These tests are written to FAIL against the current code (which puts the
 * secret in the WS URL and the Discord status GET query string) and to PASS
 * once the secret is moved off the URL. They intentionally do not assert the
 * exact replacement transport, only that the raw secret never appears in a URL.
 *
 * NOTE: `gameSocket.test.ts` currently asserts the OPPOSITE (that the secret is
 * present in the WS URL). That assertion encodes the vulnerability and must be
 * updated as part of the SEC-1 fix; this file is the authoritative expectation.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

// Mock the toast so importing the api module doesn't require a real hook.
const toastMock = vi.fn();
vi.mock('@/hooks/use-toast', () => ({
  toast: (...args: unknown[]) => toastMock(...args),
  useToast: () => ({ toast: toastMock, toasts: [], dismiss: vi.fn() }),
}));

const PLAYER_SECRET = 'super-secret-credential-value';
const PLAYER_ID = 'player-1';
const GAME_ID = '1234';

// ---------------------------------------------------------------------------
// WebSocket connect must not carry the secret in the URL
// ---------------------------------------------------------------------------
type MockSocketEventHandler = ((event: Event) => void) | null;

class MockWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static instances: MockWebSocket[] = [];

  readonly url: string;
  readyState = MockWebSocket.CONNECTING;
  onopen: MockSocketEventHandler = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
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
}

describe('SEC-1: WebSocket connection does not leak the player secret in the URL', () => {
  const originalWebSocket = globalThis.WebSocket;

  beforeEach(() => {
    MockWebSocket.instances = [];
    globalThis.WebSocket = MockWebSocket as unknown as typeof WebSocket;
  });

  afterEach(async () => {
    const { gameSocket } = await import('../gameSocket');
    gameSocket.disconnect();
    globalThis.WebSocket = originalWebSocket;
    vi.restoreAllMocks();
  });

  it('never places the raw player secret in the WebSocket URL', async () => {
    const { gameSocket } = await import('../gameSocket');

    gameSocket.connect({
      gameId: GAME_ID,
      playerId: PLAYER_ID,
      playerSecret: PLAYER_SECRET,
      onMessage: vi.fn(),
    });

    expect(MockWebSocket.instances.length).toBeGreaterThan(0);
    for (const socket of MockWebSocket.instances) {
      // The secret must not appear anywhere in the URL (query string, path, etc.)
      expect(socket.url).not.toContain(PLAYER_SECRET);
      // And specifically not as the well-known leaky query params.
      const parsed = new URL(socket.url);
      expect(parsed.searchParams.get('secret')).toBeNull();
      expect(parsed.searchParams.get('player_secret')).toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------
// Discord account-status request must not carry the secret in the query string
// ---------------------------------------------------------------------------
describe('SEC-1: Discord account-status request does not leak the player secret in the URL', () => {
  const server = setupServer();
  let capturedUrl = '';

  beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }));
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());

  it('does not send player_secret as a URL query parameter', async () => {
    const { discordApi } = await import('../api');

    server.use(
      http.get('http://localhost:8000/api/auth/discord/status/', ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.json({ is_linked: false });
      }),
    );

    await discordApi.getAccountStatus(PLAYER_ID, PLAYER_SECRET);

    // The raw secret must not appear anywhere in the request URL.
    expect(capturedUrl).not.toContain(PLAYER_SECRET);
    const parsed = new URL(capturedUrl);
    expect(parsed.searchParams.get('player_secret')).toBeNull();
  });
});
