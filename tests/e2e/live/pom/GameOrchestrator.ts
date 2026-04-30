import { Browser, Page } from '@playwright/test';
import { PlayerPage, PlayerConfig, PlayerRole } from './PlayerPage';
import { getGameState } from '../helpers';

export interface GameConfig {
  players: PlayerConfig[];
  audioFilePath: string;
}

export class GameOrchestrator {
  public browser: Browser;
  public players: Map<string, PlayerPage> = new Map();
  public audioFilePath: string;
  public roomCode: string = '';

  constructor(browser: Browser, audioFilePath: string) {
    this.browser = browser;
    this.audioFilePath = audioFilePath;
  }

  async setup(config: GameConfig): Promise<void> {
    const hostConfig = config.players.find(p => p.role === 'host');
    if (!hostConfig) {
      throw new Error('Must have a host player');
    }

    // Create room with host
    const hostPage = await this.browser.newPage();
    const hostPlayer = new PlayerPage(hostPage, hostConfig.name, 'host');
    this.roomCode = await hostPlayer.createRoom();
    await hostPlayer.loadBoardTiles();
    this.players.set(hostConfig.name, hostPlayer);

    // Join other players
    for (const playerConfig of config.players) {
      if (playerConfig.role === 'host') continue;

      const playerPage = await this.browser.newPage();
      const player = new PlayerPage(playerPage, playerConfig.name, playerConfig.role);
      const isSpectator = playerConfig.role === 'spectator';
      await player.joinRoom(this.roomCode, isSpectator);
      // Spectators don't get bingo boards assigned
      if (!isSpectator) {
        await player.loadBoardTiles();
      }
      this.players.set(playerConfig.name, player);
    }
  }

  getPlayer(name: string): PlayerPage {
    const player = this.players.get(name);
    if (!player) {
      throw new Error(`Player not found: ${name}`);
    }
    return player;
  }

  async allPlayersReady(): Promise<void> {
    // Only non-host producers toggle ready — host has no ready button UI,
    // and spectators don't participate in the ready system.
    for (const [name, player] of this.players) {
      if (player.role === 'host' || player.role === 'spectator') continue;
      await player.toggleReady();
    }
  }

  async startGame(): Promise<void> {
    const host = Array.from(this.players.values()).find(p => p.role === 'host');
    if (!host) {
      throw new Error('No host found');
    }
    await host.startGame();
  }

  async playCasualRound(skipAdvanceTurn = false): Promise<boolean> {
    // Each producer plays an incomplete tile via API
    // (Backend doesn't validate genre matching)
    const producers = Array.from(this.players.values()).filter(p => p.role === 'producer' || p.role === 'host');
    for (const producer of producers) {
      try {
        await producer.playTile(this.audioFilePath);
      } catch (error: any) {
        if (error.message?.includes('No incomplete tiles')) {
          console.log(`${producer.name} has no incomplete tiles, skipping`);
        } else {
          console.error(`${producer.name} playTile error: ${error.message || error}`);
          throw error;
        }
      }
    }

    // Check if game finished after tile submissions
    let state = await getGameState(this.roomCode);
    if (state.status === 'finished') {
      return true;
    }

    if (!skipAdvanceTurn) {
      // Host advances turn (may fail if game already finished)
      const host = Array.from(this.players.values()).find(p => p.role === 'host');
      if (!host) {
        throw new Error('No host found');
      }
      try {
        await host.advanceTurn();
      } catch (error: any) {
        // Game may have finished during tile submissions
        console.log(`advanceTurn returned error (game likely finished): ${error.message || error}`);
      }

      // Refresh board tiles to get updated status
      for (const producer of producers) {
        await producer.loadBoardTiles();
      }
    }

    // Check if game is finished
    state = await getGameState(this.roomCode);
    return state.status === 'finished';
  }

  async playRankedRound(): Promise<boolean> {
    // Play tiles but don't advance round yet (voting comes first in ranked mode)
    const isFinished = await this.playCasualRound(true);

    if (isFinished) {
      return true;
    }

    // Host opens voting directly (bypasses 60s timer for test speed)
    const host = Array.from(this.players.values()).find(p => p.role === 'host');
    if (host) {
      await host.openVoting();
    }

    // Each spectator votes
    const spectators = Array.from(this.players.values()).filter(p => p.role === 'spectator');
    const producers = Array.from(this.players.values()).filter(p => p.role === 'producer' || p.role === 'host');
    
    if (producers.length > 0) {
      const winner = producers[0]; // Simplified - just vote for first producer
      for (const spectator of spectators) {
        try {
          await spectator.voteFor(winner.playerId);
        } catch (error) {
          console.log(`Vote failed for ${spectator.name}`);
        }
      }
    }

    // After voting, host advances to next round
    if (host) {
      try {
        await host.advanceTurn();
      } catch (error: any) {
        console.log(`advanceTurn after voting: ${error.message || error}`);
      }
    }

    // Refresh board tiles to get updated status
    const allProducers = Array.from(this.players.values()).filter(p => p.role === 'producer' || p.role === 'host');
    for (const producer of allProducers) {
      await producer.loadBoardTiles();
    }

    // Check if finished
    const state = await getGameState(this.roomCode);
    return state.status === 'finished';
  }

  async waitForVotingOpen(timeout = 30000): Promise<void> {
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      const state = await getGameState(this.roomCode);
      if (state.roundState?.votingOpen) {
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    throw new Error('Timeout waiting for voting to open');
  }

  async waitForNewRound(timeout = 30000): Promise<void> {
    const startTime = Date.now();
    let lastRoundNumber = (await getGameState(this.roomCode)).current_round;

    while (Date.now() - startTime < timeout) {
      const state = await getGameState(this.roomCode);
      if (state.current_round > lastRoundNumber) {
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    throw new Error('Timeout waiting for new round');
  }

  async playUntilBingo(maxRounds = 9): Promise<string | null> {
    for (let i = 0; i < maxRounds; i++) {
      const isFinished = await this.playCasualRound();
      if (isFinished) {
        const state = await getGameState(this.roomCode);
        return state.winner;
      }
    }
    return null;
  }

  async playRankedUntilBingo(maxRounds = 9): Promise<string | null> {
    for (let i = 0; i < maxRounds; i++) {
      const isFinished = await this.playRankedRound();
      if (isFinished) {
        const state = await getGameState(this.roomCode);
        return state.winner;
      }
    }
    return null;
  }

  async cleanup(): Promise<void> {
    for (const [name, player] of this.players) {
      await player.page.close();
    }
  }
}
