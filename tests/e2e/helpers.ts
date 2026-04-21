import { Page, Route } from '@playwright/test';

declare global {
  interface Window {
    __E2E_TESTING__?: boolean;
  }
}

export async function enableE2EMode(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.__E2E_TESTING__ = true;
  });
}

export async function setupPlayerSession(
  page: Page,
  session: { playerName: string; playerId: string; playerSecret: string }
): Promise<void> {
  await page.addInitScript((s) => {
    localStorage.setItem('playerName', s.playerName);
    localStorage.setItem('playerId', s.playerId);
    localStorage.setItem('playerSecret', s.playerSecret);
  }, session);
}

export interface MockWebSocketOptions {
  autoConnect?: boolean;
  delay?: number;
}

export interface MockWebSocketMessage {
  type: string;
  data: unknown;
  timestamp: number;
}

export async function mockWebSocketConnection(
  page: Page,
  options: MockWebSocketOptions = {}
): Promise<void> {
  // Define the MockWebSocket class as a string to inject into the page context
  const mockWebSocketCode = `
    class MockWebSocket {
      static CONNECTING = 0;
      static OPEN = 1;
      static CLOSING = 2;
      static CLOSED = 3;

      constructor(url, protocols) {
        this.CONNECTING = MockWebSocket.CONNECTING;
        this.OPEN = MockWebSocket.OPEN;
        this.CLOSING = MockWebSocket.CLOSING;
        this.CLOSED = MockWebSocket.CLOSED;
        
        this.readyState = MockWebSocket.CONNECTING;
        this.url = url;
        this.protocol = '';
        this.extensions = '';
        this.bufferedAmount = 0;
        
        this._onopen = null;
        this._onclose = null;
        this._onerror = null;
        this._onmessage = null;
        this.eventListeners = new Map();
        
        this.messageQueue = [];
        
        // Auto-connect after a short delay
        setTimeout(() => this.connect(), 10);
      }

      addEventListener(type, listener) {
        if (!this.eventListeners.has(type)) {
          this.eventListeners.set(type, []);
        }
        this.eventListeners.get(type).push(listener);
        
        // Also set the direct property for compatibility
        switch (type) {
          case 'open':
            this._onopen = listener;
            break;
          case 'close':
            this._onclose = listener;
            break;
          case 'error':
            this._onerror = listener;
            break;
          case 'message':
            this._onmessage = listener;
            break;
        }
      }

      removeEventListener(type, listener) {
        switch (type) {
          case 'open':
            if (this._onopen === listener) this._onopen = null;
            break;
          case 'close':
            if (this._onclose === listener) this._onclose = null;
            break;
          case 'error':
            if (this._onerror === listener) this._onerror = null;
            break;
          case 'message':
            if (this._onmessage === listener) this._onmessage = null;
            break;
        }
      }

      get onopen() { return this._onopen; }
      set onopen(value) { this._onopen = value; }
      
      get onclose() { return this._onclose; }
      set onclose(value) { this._onclose = value; }
      
      get onerror() { return this._onerror; }
      set onerror(value) { this._onerror = value; }
      
      get onmessage() { return this._onmessage; }
      set onmessage(value) { this._onmessage = value; }

      connect() {
        if (this.readyState === MockWebSocket.OPEN) return;
        
        this.readyState = MockWebSocket.OPEN;
        
        // Process queued messages
        this.messageQueue.forEach(message => this.deliverMessage(message));
        this.messageQueue = [];

        // Trigger open event for event listeners
        const openListeners = this.eventListeners.get('open') || [];
        openListeners.forEach(listener => {
          setTimeout(() => listener(new Event('open')), 0);
        });
        
        // Also trigger direct property for compatibility
        if (this._onopen) {
          setTimeout(() => this._onopen(new Event('open')), 0);
        }
      }

      close(code, reason) {
        if (this.readyState === MockWebSocket.CLOSED) return;
        
        this.readyState = MockWebSocket.CLOSED;
        
        if (this._onclose) {
          setTimeout(() => {
            const closeEvent = new CloseEvent('close', { 
              code: code || 1000, 
              reason: reason || '',
              wasClean: true 
            });
            this._onclose(closeEvent);
          }, 0);
        }
      }

      send(data) {
        if (this.readyState !== MockWebSocket.OPEN) {
          throw new Error('WebSocket is not open');
        }
      }

      injectMessage(message) {
        if (this.readyState === MockWebSocket.OPEN) {
          this.deliverMessage(message);
        } else {
          this.messageQueue.push(message);
        }
      }

      simulateDisconnect() {
        this.readyState = MockWebSocket.CLOSED;
        if (this._onclose) {
          this._onclose(new CloseEvent('close', { code: 1006, reason: 'Abnormal closure', wasClean: false }));
        }
      }

      simulateReconnect() {
        this.readyState = MockWebSocket.CONNECTING;
        setTimeout(() => this.connect(), 50);
      }

      deliverMessage(message) {
        const messageEvent = new MessageEvent('message', {
          data: JSON.stringify(message.data),
          origin: 'ws://localhost:8000',
          lastEventId: '',
          ports: [],
          source: null
        });
        
        // Trigger event listeners
        const messageListeners = this.eventListeners.get('message') || [];
        messageListeners.forEach(listener => {
          listener(messageEvent);
        });
        
        // Also trigger direct property for compatibility
        if (this._onmessage) {
          this._onmessage(messageEvent);
        }
      }
    }

    // Initialize tracking and replace WebSocket
    window.__WS_INSTANCES = [];
    window.MockWebSocket = MockWebSocket;
    
    const OriginalWebSocket = window.WebSocket;
    window.WebSocket = function(url, protocols) {
      const mockWs = new MockWebSocket(url, protocols);
      window.__WS_INSTANCES.push(mockWs);
      return mockWs;
    };
    
    window.OriginalWebSocket = OriginalWebSocket;
  `;

  await page.addInitScript(mockWebSocketCode);
}

export function createMockGameMessage(type: string, data: unknown): MockWebSocketMessage {
  return {
    type,
    data,
    timestamp: Date.now()
  };
}

export function createMockGameStateUpdate(gameState: Record<string, unknown>): MockWebSocketMessage {
  return createMockGameMessage('game_state_update', gameState);
}

export function createMockPlayerJoined(player: Record<string, unknown>): MockWebSocketMessage {
  return createMockGameMessage('player_joined', player);
}

export function createMockPlayerLeft(playerId: string): MockWebSocketMessage {
  return createMockGameMessage('player_left', { id: playerId });
}

export function createMockGameStarted(): MockWebSocketMessage {
  return createMockGameMessage('game_started', { timestamp: Date.now() });
}

export function createMockGameFinished(winnerId: string): MockWebSocketMessage {
  return createMockGameMessage('game_finished', { winner: winnerId, timestamp: Date.now() });
}

// Types and functions for API mocking
interface MockPlayerLike {
  id: string;
  name: string;
  avatar?: string;
  board?: {
    tiles: Array<{
      id: string;
      genre: string;
      status: 'empty' | 'pending' | 'complete';
      audioUrl?: string;
      position: number;
    }>;
  };
  isSpectator?: boolean;
  isConnected?: boolean;
  isHost?: boolean;
  eloRating?: number;
  eloWins?: number;
  eloLosses?: number;
  eloMatches?: number;
}

interface MockRouteResponse {
  status?: number;
  json: unknown;
}

type MockRouteHandler =
  | MockRouteResponse
  | ((route: Route) => Promise<void>);

interface MockApiRoutesOptions {
  roomResponse: Record<string, unknown>;
  rejoin?: {
    player: MockPlayerLike;
    playerSecret: string;
  };
  joinGame?: MockRouteHandler;
  startGame?: MockRouteHandler;
  kickPlayer?: MockRouteHandler;
  vote?: MockRouteHandler;
}

function toTileResponse(tile: any): Record<string, unknown> {
  return {
    id: tile.id,
    genre: tile.genre,
    status: tile.status,
    position: tile.position,
    ...(tile.audioUrl ? { audio_url: tile.audioUrl } : {}),
  };
}

export function toRejoinResponse(
  player: MockPlayerLike,
  playerSecret: string
): Record<string, unknown> {
  return {
    id: player.id,
    name: player.name,
    avatar: player.avatar,
    tiles: player.board?.tiles?.map(toTileResponse) ?? [],
    player_secret: playerSecret,
    is_connected: player.isConnected ?? true,
    is_spectator: player.isSpectator ?? false,
    is_host: player.isHost ?? false,
    elo_rating: player.eloRating,
    elo_wins: player.eloWins,
    elo_losses: player.eloLosses,
    elo_matches: player.eloMatches,
  };
}

async function fulfillRoute(
  route: Route,
  handler: MockRouteHandler
): Promise<void> {
  if (typeof handler === 'function') {
    await handler(route);
    return;
  }

  await route.fulfill({
    status: handler.status ?? 200,
    json: handler.json,
  });
}

export async function mockApiRoutes(
  page: Page,
  options: MockApiRoutesOptions
): Promise<void> {
  await page.route('**/api/**', async (route) => {
    const url = route.request().url();

    if (url.includes('/rejoin_game/')) {
      if (!options.rejoin) {
        await route.fulfill({ status: 404, json: { error: 'No rejoin mock configured' } });
        return;
      }

      await route.fulfill({
        status: 200,
        json: toRejoinResponse(options.rejoin.player, options.rejoin.playerSecret),
      });
      return;
    }

    if (url.includes('/rooms/')) {
      await route.fulfill({ json: options.roomResponse });
      return;
    }

    if (url.includes('/join_game/')) {
      if (options.joinGame) {
        await fulfillRoute(route, options.joinGame);
        return;
      }
    }

    if (url.includes('/start_game/')) {
      if (options.startGame) {
        await fulfillRoute(route, options.startGame);
        return;
      }
    }

    if (url.includes('/kick_player/')) {
      if (options.kickPlayer) {
        await fulfillRoute(route, options.kickPlayer);
        return;
      }
    }

    if (url.includes('/vote/')) {
      if (options.vote) {
        await fulfillRoute(route, options.vote);
        return;
      }
    }

    // Default: continue with original request
    await route.continue();
  });
}
