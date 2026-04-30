import { GameState, RoundState } from '@/types/game';

export type GameSocketMessage =
  | { type: 'game_state_update'; payload: GameState }
  | { type: 'bingo_achievement'; payload: { playerId: string; tiles: string[] } }
  | { type: 'victory_celebration'; payload: { winnerId: string } }
  | { type: 'vote_submitted'; payload: { voterId: string; votedForId: string; votesRecorded: number } }
  | { type: 'timer_tick'; payload: { timeRemaining: number } }
  | { type: 'turn_change'; payload: { round: RoundState } }
  | { type: 'player_joined'; payload: { playerId: string; playerName: string; isSpectator: boolean } }
  | { type: 'player_left'; payload: { playerId: string; playerName: string } };

export type MessageHandler = (message: GameSocketMessage) => void;

export interface GameSocketOptions {
  gameId: string;
  playerId?: string;
  playerSecret?: string;
  onMessage: MessageHandler;
  onConnect?: () => void;
  onDisconnect?: (reason: string) => void;
  onError?: (error: Event) => void;
  reconnectAttempts?: number;
  reconnectInterval?: number;
}

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'reconnecting';

class GameSocketService {
  private ws: WebSocket | null = null;
  private options: GameSocketOptions | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private isIntentionallyClosed = false;
  private connectionStatus: ConnectionStatus = 'disconnected';

  private getWsUrl(): string {
    const baseUrl = import.meta.env.VITE_WS_URL || 
      (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000')
        .replace(/^http/, 'ws')
        .replace('/api', '');
    
    const url = new URL(`/ws/game/${this.options!.gameId}/`, baseUrl);
    
    if (this.options!.playerId) {
      url.searchParams.set('player_id', this.options!.playerId);
    }
    if (this.options!.playerSecret) {
      url.searchParams.set('secret', this.options!.playerSecret);
    }
    
    return url.toString();
  }

  connect(options: GameSocketOptions): void {
    this.options = options;
    this.maxReconnectAttempts = options.reconnectAttempts ?? 5;
    this.isIntentionallyClosed = false;
    this.reconnectAttempts = 0;
    
    // Connection established with gameId
    console.log('[GameSocket] Connection config:', { 
      gameId: options.gameId
    });
    
    this.doConnect();
  }

  private doConnect(): void {
    if (!this.options) return;
    
    // Close existing connection if any
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    const wsUrl = this.getWsUrl();
    // Redact secret from URL for logging to prevent PII exposure
    const safeWsUrl = wsUrl.replace(/secret=[^&]*/, 'secret=***');
    console.log('[GameSocket] Connecting to', safeWsUrl);

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log('[GameSocket] Connected');
        this.connectionStatus = 'connected';
        this.reconnectAttempts = 0;
        this.options?.onConnect?.();
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as GameSocketMessage;
          console.log('[GameSocket] Received:', data.type);
          this.options?.onMessage(data);
        } catch (err) {
          console.error('[GameSocket] Failed to parse message:', err);
        }
      };

      this.ws.onclose = (event) => {
        console.log('[GameSocket] Disconnected:', event.reason || event.code);
        this.connectionStatus = 'disconnected';

        if (!this.isIntentionallyClosed) {
          this.options?.onDisconnect?.(event.reason || `Code: ${event.code}`);
          this.attemptReconnect();
        }
      };

      this.ws.onerror = (error) => {
        console.error('[GameSocket] Error:', error);
        this.options?.onError?.(error);
      };
    } catch (err) {
      console.error('[GameSocket] Failed to create WebSocket:', err);
      this.attemptReconnect();
    }
  }

  private attemptReconnect(): void {
    if (this.isIntentionallyClosed || !this.options) return;

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log('[GameSocket] Max reconnection attempts reached');
      this.connectionStatus = 'disconnected';
      return;
    }

    this.connectionStatus = 'reconnecting';
    const interval = this.options.reconnectInterval ?? 1000;
    const delay = Math.min(interval * Math.pow(2, this.reconnectAttempts), 30000);

    console.log(`[GameSocket] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts + 1}/${this.maxReconnectAttempts})`);

    this.reconnectTimeout = setTimeout(() => {
      this.reconnectAttempts++;
      this.doConnect();
    }, delay);
  }

  disconnect(): void {
    this.isIntentionallyClosed = true;
    
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.ws) {
      this.ws.close(1000, 'Client disconnecting');
      this.ws = null;
    }
    
    this.options = null;
    console.log('[GameSocket] Disconnected');
  }

  send(messageType: string, payload?: unknown): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('[GameSocket] Cannot send - not connected');
      return;
    }

    const message = {
      type: messageType,
      payload,
    };

    this.ws.send(JSON.stringify(message));
    console.log('[GameSocket] Sent:', messageType);
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  getConnectionStatus(): ConnectionStatus {
    return this.connectionStatus;
  }
}

export const gameSocket = new GameSocketService();
export default gameSocket;
