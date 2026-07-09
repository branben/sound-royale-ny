import { Page, expect } from '@playwright/test';
import {
  joinRoom,
  submitTile,
  nextTurn,
  castVote,
  getGameState,
  toggleReady,
  openVoting,
} from '../helpers';
import { setupPlayerSession } from '../../helpers';
import axios from 'axios';

function getApiBaseUrl(): string {
  return process.env.LIVE_API_BASE_URL || 'http://localhost:8000/api';
}

export type PlayerRole = 'host' | 'producer' | 'spectator';

export interface PlayerConfig {
  name: string;
  role: PlayerRole;
}

export class PlayerPage {
  public page: Page;
  public name: string;
  public role: PlayerRole;
  public playerSecret: string = '';
  public playerId: string = '';
  public roomCode: string = '';
  public boardTiles: Array<{ id: string; genre: string; position: number; status?: string }> = [];

  constructor(page: Page, name: string, role: PlayerRole) {
    this.page = page;
    this.name = name;
    this.role = role;
  }

  async createRoom(): Promise<string> {
    // Use backend API directly for reliable room creation (avoids UI flakiness)
    // Backend rate-limited: room_creation: 5/minute. Retry with aggressive backoff
    // to cover up to ~60s rate limit window.
    let response;
    const MAX_RETRIES = 8;
    const MAX_BACKOFF_MS = 30_000;
    for (let i = 0; i < MAX_RETRIES; i++) {
      try {
        response = await axios.post(`${getApiBaseUrl()}/rooms/`, {
          name: 'Test Room',
          player_name: this.name,
        });
        break;
      } catch (error: any) {
        if (i === MAX_RETRIES - 1) throw error;
        if (error.response?.status === 429) {
          const backoff = Math.min(Math.pow(2, i) * 1000, MAX_BACKOFF_MS);
          console.log(
            `createRoom 429 rate limited, retrying in ${backoff}ms... (${i + 1}/${MAX_RETRIES})`,
          );
          await new Promise((r) => setTimeout(r, backoff));
          continue;
        }
        if (error.response?.status === 500) {
          console.log(`createRoom 500 error, retrying in 500ms... (${i + 1}/${MAX_RETRIES})`);
          await new Promise((r) => setTimeout(r, 500));
          continue;
        }
        throw error;
      }
    }
    if (!response) throw new Error('createRoom failed after retries');
    const data = response.data;
    this.roomCode = data.room_code || data.room?.code || '';
    this.playerId = data.player_id || '';
    this.playerSecret = data.player_secret || '';

    // Inject session via the shared helper (uses addInitScript)
    await setupPlayerSession(this.page, {
      playerName: this.name,
      playerId: this.playerId,
      playerSecret: this.playerSecret,
      roomCode: this.roomCode,
      isSpectator: false,
    });
    await this.page.goto(`/room/${this.roomCode}`);
    // Wait for the room screen to confirm render (data-testid=lobby was removed
    // from the Room UI; "room-id" is the stable anchor present for host + producers).
    await expect(this.page.locator('data-testid=room-id')).toBeVisible({ timeout: 15000 });

    return this.roomCode;
  }

  async joinRoom(roomCode: string, isSpectator: boolean = false): Promise<void> {
    this.roomCode = roomCode;

    if (isSpectator) {
      // Spectators must join via API — no UI checkbox exists
      // Backend auto-assigns spectator names ("Spectator 1", "Spectator 2", etc.)
      const response = await joinRoom(roomCode, this.name, true);
      // Join endpoint returns player data directly (PlayerCreateSerializer format)
      this.playerId = response.id;
      this.playerSecret = response.player_secret;
      this.name = response.name; // Use auto-assigned name from backend
      // Inject session via the shared helper (uses addInitScript)
      await setupPlayerSession(this.page, {
        playerName: this.name,
        playerId: this.playerId,
        playerSecret: this.playerSecret,
        roomCode,
        isSpectator: true,
      });
      await this.page.goto(`/?code=${roomCode}`);
    } else {
      // Producer / host join via API for reliability
      // Join endpoint returns player data directly (PlayerCreateSerializer format)
      const response = await joinRoom(roomCode, this.name, false);
      this.playerId = response.id;
      this.playerSecret = response.player_secret;
      // Inject session via the shared helper (uses addInitScript)
      await setupPlayerSession(this.page, {
        playerName: this.name,
        playerId: this.playerId,
        playerSecret: this.playerSecret,
        roomCode,
        isSpectator: false,
      });
      await this.page.goto(`/room/${roomCode}`);
      await expect(this.page.locator('data-testid=room-id')).toBeVisible({ timeout: 15000 });
    }
  }

  async toggleReady(): Promise<void> {
    // Use backend API — host has no ready button UI
    if (!this.playerSecret) {
      throw new Error('playerSecret required for toggleReady');
    }
    await toggleReady(this.roomCode, this.playerSecret, this.playerId);
    await this.page.waitForTimeout(500);
  }

  async startGame(): Promise<void> {
    if (this.role !== 'host') {
      throw new Error('Only host can start the game');
    }
    // Use API directly for reliability — works regardless of current page
    const { startGame } = await import('../helpers');
    await startGame(this.roomCode, this.playerSecret);
    // Give React time to sync state
    await this.page.waitForTimeout(1000);
  }

  async playTile(audioFilePath: string): Promise<boolean> {
    // Fetch game state to learn current round's genre
    const state = await getGameState(this.roomCode);
    const roundGenre = state.roundState?.currentTileGenre;

    const matchingTile = roundGenre
      ? this.boardTiles.find(
          (t) => t.status !== 'complete' && t.genre.toLowerCase() === roundGenre.toLowerCase(),
        )
      : undefined;

    if (!matchingTile) {
      console.log(`${this.name} has no ${roundGenre ?? 'available'} tile this round, skipping`);
      return false;
    }

    try {
      await submitTile(matchingTile.id, audioFilePath, this.playerSecret, this.playerId);
    } catch (error: any) {
      const msg = error.response?.data?.error || error.message || '';
      if (msg.includes('Game is not in progress')) {
        console.log(`Game already finished before ${this.name} could play tile`);
        return false;
      }
      console.error(`submitTile failed for ${this.name}: ${msg}`);
      throw error;
    }

    // Mark as completed locally
    matchingTile.status = 'complete';

    // Wait for submission to propagate
    await this.page.waitForTimeout(500);
    return true;
  }

  async advanceTurn(): Promise<void> {
    if (this.role !== 'host') {
      throw new Error('Only host can advance turn');
    }
    await nextTurn(this.roomCode, this.playerSecret);
    await this.page.waitForTimeout(500);
  }

  async openVoting(): Promise<void> {
    if (this.role !== 'host') {
      throw new Error('Only host can open voting');
    }
    await openVoting(this.roomCode, this.playerSecret);
    await this.page.waitForTimeout(500);
  }

  async voteFor(playerId: string): Promise<void> {
    if (this.role !== 'spectator') {
      throw new Error('Only spectators can vote');
    }
    await castVote(this.roomCode, this.playerSecret, playerId);
    await this.page.waitForTimeout(500);
  }

  async waitForState(expected: 'lobby' | 'playing' | 'voting' | 'finished'): Promise<void> {
    const maxWait = 30000; // 30 seconds
    const startTime = Date.now();

    while (Date.now() - startTime < maxWait) {
      const state = await getGameState(this.roomCode);
      if (state.status === expected) {
        return;
      }
      await this.page.waitForTimeout(500);
    }

    throw new Error(`Timed out waiting for state: ${expected}`);
  }

  async loadBoardTiles(): Promise<void> {
    // Spectators don't get tiles assigned
    if (this.role === 'spectator') return;
    const state = await getGameState(this.roomCode);
    // Backend returns players as a dictionary keyed by player ID
    // GameStateSerializer nests tiles under player.board.tiles
    const playerData = state.players[this.playerId];
    if (!playerData) {
      const keys = Object.keys(state.players || {});
      throw new Error(
        `loadBoardTiles: player ${this.playerId} not found in state.players. ` +
          `Keys: [${keys.join(', ')}], playerName: ${this.name}, role: ${this.role}`,
      );
    }
    const tiles = playerData.board?.tiles || playerData.tiles || [];
    if (tiles.length === 0) {
      throw new Error(
        `loadBoardTiles: player ${this.playerId} (${this.name}) has no tiles. ` +
          `playerData keys: [${Object.keys(playerData).join(', ')}]`,
      );
    }
    this.boardTiles = tiles.map((t: any) => ({
      id: t.id,
      genre: t.genre,
      position: t.position,
      status: t.status,
    }));
  }

  // --- Spectator UI assertions (for live POM tests) ---

  async assertBoardVisible(): Promise<void> {
    await expect(this.page.getByTestId('game-board').first()).toBeVisible({ timeout: 15000 });
  }

  async assertVotingPanelVisible(): Promise<void> {
    await expect(this.page.getByTestId('voting-panel')).toBeVisible({ timeout: 15000 });
  }

  async assertCasualVotingDisabled(): Promise<void> {
    // In casual mode (spectators < 3), time-up ends the round with no voting UI.
    // The UI replaces the voting panel with a "Casual round complete" card that
    // explicitly states no votes are recorded — assert that contract.
    await expect(this.page.getByText('Casual round complete')).toBeVisible({ timeout: 15000 });
    await expect(this.page.getByText('No votes are recorded for this round.')).toBeVisible({
      timeout: 15000,
    });
  }

  async assertWinnerVisible(winnerName: string): Promise<void> {
    const announcement = this.page.getByTestId('winner-announcement');
    await expect(announcement).toBeVisible({ timeout: 15000 });
    await expect(announcement).toContainText(winnerName);
  }

  async assertRoundNumber(n: number): Promise<void> {
    await expect(this.page.getByText(`Round ${n}`).first()).toBeVisible({ timeout: 15000 });
  }
}
