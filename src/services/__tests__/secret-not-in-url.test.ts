/**
 * SEC-1 regression test — player secret must never travel in a URL.
 *
 * Open issue #105: "Player secret is exposed via URL query param or
 * console/error string. Move to Authorization header / POST body / first WS
 * message."
 *
 * A secret placed in a URL query string is a real leak: it lands in browser
 * history, proxy/CDN/server access logs, `Referer` headers, and any error
 * report that echoes the request URL. This suite pins two concrete leak
 * surfaces in the frontend transport layer and fails while the secret is
 * present in the URL — it turns green once the secret is moved to an
 * Authorization header / POST body / first WS message (the fix issue #105
 * asks for).
 *
 * NOTE: This is a jsdom + Vitest (+ MSW) unit test of the transport layer, not
 * a TestDriver computer-use / browser test — so there is no browser session or
 * recording to embed. It is written by the TestDriver test agent, whose remit
 * is tests only; the application-code fix (changing the transport) is left to a
 * maintainer. These assertions are the guard that proves when that fix lands.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

// The literal secret we thread through every code path. It is deliberately
// distinctive so a substring search over a URL is unambiguous.
const SECRET = 'super-secret-player-token-value';
const PLAYER_ID = 'player-1';

// ---------------------------------------------------------------------------
// WebSocket leak surface: gameSocket.getWsUrl() currently does
//   url.searchParams.set('secret', playerSecret)
// which puts the secret in the ws:// URL query string.
// ---------------------------------------------------------------------------

class MockWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static instances: MockWebSocket[] = [];

  readonly url: string;
  readyState = MockWebSocket.CONNECTING;
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  close = vi.fn((_code?: number, _reason?: string) => {
    this.readyState = MockWebSocket.CLOSED;
  });
  send = vi.fn();

  constructor(url: string | URL) {
    this.url = String(url);
    MockWebSocket.instances.push(this);
  }
}

describe('SEC-1: player secret must not appear in the WebSocket URL (issue #105)', () => {
  beforeEach(() => {
    MockWebSocket.instances = [];
    // In jsdom `globalThis.WebSocket` is a read-only accessor, so a plain
    // assignment throws. vi.stubGlobal replaces it safely and is undone by
    // vi.unstubAllGlobals() in afterEach.
    vi.stubGlobal('WebSocket', MockWebSocket as unknown as typeof WebSocket);
  });

  afterEach(async () => {
    const { gameSocket } = await import('../gameSocket');
    gameSocket.disconnect();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('does not put the raw secret in the ws:// URL query string', async () => {
    const { gameSocket } = await import('../gameSocket');

    gameSocket.connect({
      gameId: '1234',
      playerId: PLAYER_ID,
      playerSecret: SECRET,
      onMessage: vi.fn(),
    });

    expect(MockWebSocket.instances.length).toBeGreaterThan(0);
    const openedUrl = MockWebSocket.instances.at(-1)!.url;

    // The secret value must not be anywhere in the connection URL...
    expect(openedUrl).not.toContain(SECRET);
    // ...and specifically not as a `secret` query parameter.
    const parsed = new URL(openedUrl);
    expect(parsed.searchParams.get('secret')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// HTTP leak surface: discordApi.getAccountStatus() currently does
//   api.get(`/auth/discord/status/?player_id=${id}&player_secret=${secret}`)
// which puts the secret in the request URL query string. We capture the URL
// the client actually sends with MSW and assert the secret is not in it.
// ---------------------------------------------------------------------------

// Keep the axios error-interceptor's POST /errors/log/ from tripping MSW.
const API_BASE = 'http://localhost:8000/api';
const errorLogHandler = http.post(
  `${API_BASE}/errors/log/`,
  () => new HttpResponse(null, { status: 204 }),
);

const server = setupServer(errorLogHandler);

beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }));
afterEach(() => server.resetHandlers());
afterEach(() => server.use(errorLogHandler));
afterAll(() => server.close());

describe('SEC-1: player secret must not appear in an HTTP request URL (issue #105)', () => {
  it('discordApi.getAccountStatus does not send the secret as a URL query param', async () => {
    const { discordApi } = await import('../api');

    let capturedUrl = '';
    server.use(
      http.get(`${API_BASE}/auth/discord/status/`, ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.json({ is_linked: false });
      }),
    );

    await discordApi.getAccountStatus(PLAYER_ID, SECRET);

    expect(capturedUrl).not.toBe('');
    // The raw secret must not be present anywhere in the request URL...
    expect(capturedUrl).not.toContain(SECRET);
    // ...and specifically not as a `player_secret` query parameter.
    const parsed = new URL(capturedUrl);
    expect(parsed.searchParams.get('player_secret')).toBeNull();
  });
});
