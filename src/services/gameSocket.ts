import { GameState, RoundState } from '@/types/game';

export type GameSocketMessage =
  | { type: 'game_state_update'; payload: GameState }
  | { type: 'bingo_achievement'; payload: { playerId: string; tiles: string[] } }
  | { type: 'victory_celebration'; payload: { winnerId: string } }
  | {
      type: 'vote_submitted';
      payload: { voterId: string; votedForId: string; votesRecorded: number };
    }
  | { type: 'timer_tick'; payload: { timeRemaining: number } }
  | { type: 'turn_change'; payload: { round: RoundState } }
  | {
      type: 'player_joined';
      payload: { playerId: string; playerName: string; isSpectator: boolean };
    }
  | { type: 'player_left'; payload: { playerId: string; playerName: string } }
  | { type: 'host_migrated'; payload: { newHostId: string; newHostName: string } }
  | { type: 'error'; payload: { code: string; message: string } };

export type MessageType = GameSocketMessage['type'];

export type MessageHandler = (message: GameSocketMessage) => void;

const MESSAGE_TYPES: readonly string[] = [
  'game_state_update',
  'bingo_achievement',
  'victory_celebration',
  'vote_submitted',
  'timer_tick',
  'turn_change',
  'player_joined',
  'player_left',
  'host_migrated',
  'error',
] as const;

function isValidMessageType(type: unknown): type is MessageType {
  return typeof type === 'string' && (MESSAGE_TYPES as readonly string[]).includes(type);
}

function parseGameSocketMessage(data: string): GameSocketMessage | null {
  const parsed = JSON.parse(data);
  if (parsed && typeof parsed === 'object' && isValidMessageType(parsed.type)) {
    return parsed as GameSocketMessage;
  }
  return null;
}

export interface GameSocketOptions {
  gameId: string;
  playerId?: string;
  playerSecret?: string;
  accessToken?: string | null;
  onMessage: MessageHandler;
  onConnect?: () => void;
  onDisconnect?: (reason: string) => void;
  onError?: (error: Event) => void;
  reconnectAttempts?: number;
  reconnectInterval?: number;
}

class GameSocketService {
  private ws: WebSocket | null = null;
  private options: GameSocketOptions | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private isIntentionallyClosed = false;
  private currentConnectionKey: string | null = null;
  private isConnecting = false;
  private connectTimeout: ReturnType<typeof setTimeout> | null = null;
  private pendingMessages: Array<{ type: string; payload: unknown }> = [];

  private getWsUrl(): string {
    const baseUrl =
      import.meta.env.VITE_WS_URL ||
      (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000')
        .replace(/^http/, 'ws')
        .replace('/api', '');

    const url = new URL(`/ws/game/${this.options!.gameId}/`, baseUrl);

    // Prefer JWT token for auth
    if (this.options!.accessToken) {
      url.searchParams.set('token', this.options!.accessToken);
    } else if (this.options!.playerSecret) {
      // Fallback to player_secret for backward compat
      url.searchParams.set('secret', this.options!.playerSecret);
      if (this.options!.playerId) {
        url.searchParams.set('player_id', this.options!.playerId);
      }
    }

    return url.toString();
  }

  connect(options: GameSocketOptions): void {
    const nextConnectionKey = this.getConnectionKey(options);

    // Prevent duplicate simultaneous attempts for the same room and credentials.
    if (this.isConnecting && this.currentConnectionKey === nextConnectionKey) {
      return;
    }

    // If the same connection is open, only update callbacks
    if (
      this.currentConnectionKey === nextConnectionKey &&
      this.ws &&
      this.ws.readyState === WebSocket.OPEN
    ) {
      this.options = options;
      return;
    }

    // Room or credentials changed; reconnect
    if (this.currentConnectionKey !== nextConnectionKey) {
      this.disconnect();
    }

    this.options = options;
    this.maxReconnectAttempts = options.reconnectAttempts ?? 5;
    this.isIntentionallyClosed = false;
    this.reconnectAttempts = 0;
    this.currentConnectionKey = nextConnectionKey;

    this.doConnect();
  }

  private getConnectionKey(options: GameSocketOptions): string {
    return [options.gameId, options.playerId ?? '', options.playerSecret ?? ''].join(':');
  }

  private doConnect(): void {
    if (!this.options) return;

    this.isConnecting = true;

    // Close existing connection if any
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    const wsUrl = this.getWsUrl();

    try {
      this.ws = new WebSocket(wsUrl);

      this.connectTimeout = setTimeout(() => {
        if (this.isConnecting && this.ws) {
          this.ws.close();
          this.ws = null;
          this.isConnecting = false;
          this.attemptReconnect();
        }
      }, 10000);

      this.ws.onopen = () => {
        if (this.connectTimeout) {
          clearTimeout(this.connectTimeout);
          this.connectTimeout = null;
        }
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        this.options?.onConnect?.();
        this.drainQueue();
      };

      this.ws.onmessage = (event) => {
        try {
          const message = parseGameSocketMessage(event.data);
          if (message) {
            this.options?.onMessage(message);
          }
        } catch (err) {
          console.error('[GameSocket] Failed to parse message:', err);
        }
      };

      this.ws.onclose = (event) => {
        if (this.connectTimeout) {
          clearTimeout(this.connectTimeout);
          this.connectTimeout = null;
        }
        this.isConnecting = false;
        if (!this.isIntentionallyClosed) {
          const reason = event.reason || `Code: ${event.code}`;
          this.options?.onDisconnect?.(reason);
          this.options?.onMessage?.({
            type: 'error',
            payload: { code: String(event.code), message: reason },
          });
          this.attemptReconnect();
        }
      };

      this.ws.onerror = (error) => {
        if (this.connectTimeout) {
          clearTimeout(this.connectTimeout);
          this.connectTimeout = null;
        }
        this.isConnecting = false;
        console.error('[GameSocket] Error:', error);
        this.options?.onError?.(error);
        this.options?.onMessage?.({
          type: 'error',
          payload: { code: 'WS_ERROR', message: 'WebSocket connection error' },
        });
      };
    } catch (err) {
      if (this.connectTimeout) {
        clearTimeout(this.connectTimeout);
        this.connectTimeout = null;
      }
      this.isConnecting = false;
      console.error('[GameSocket] Failed to create WebSocket:', err);
      this.attemptReconnect();
    }
  }

  private attemptReconnect(): void {
    if (this.isIntentionallyClosed || !this.options) return;

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      return;
    }

    const interval = this.options.reconnectInterval ?? 1000;
    const delay = Math.min(
      interval * Math.pow(2, this.reconnectAttempts) + Math.random() * 1000,
      30000,
    );

    this.reconnectTimeout = setTimeout(() => {
      this.reconnectAttempts++;
      this.doConnect();
    }, delay);
  }

  disconnect(): void {
    this.isIntentionallyClosed = true;
    this.isConnecting = false;
    this.currentConnectionKey = null;

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.connectTimeout) {
      clearTimeout(this.connectTimeout);
      this.connectTimeout = null;
    }

    if (this.ws) {
      this.ws.close(1000, 'Client disconnecting');
      this.ws = null;
    }

    this.pendingMessages = [];
    this.options = null;
  }

  send(message: GameSocketMessage): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      if (this.pendingMessages.length < 50) {
        this.pendingMessages.push({ type: message.type, payload: message.payload });
      }
      return;
    }

    this.ws.send(JSON.stringify(message));
  }

  private drainQueue(): void {
    while (this.pendingMessages.length > 0 && this.ws?.readyState === WebSocket.OPEN) {
      const msg = this.pendingMessages.shift()!;
      this.ws.send(JSON.stringify(msg));
    }
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }
}

export const gameSocket = new GameSocketService();
export default gameSocket;
