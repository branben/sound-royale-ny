import { test, expect } from '@playwright/test';
import { GameOrchestrator, GameConfig } from './pom/GameOrchestrator';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const audioFilePath = path.join(__dirname, 'fixtures/test-audio.wav');

test.describe('Live E2E — Ranked Mode (2 Producers + 3 Spectators)', () => {
  test('should play full ranked game with voting to bingo', async ({ browser }) => {
    const config: GameConfig = {
      players: [
        { name: 'HostPlayer', role: 'host' },
        { name: 'Producer2', role: 'producer' },
        { name: 'Spectator1', role: 'spectator' },
        { name: 'Spectator2', role: 'spectator' },
        { name: 'Spectator3', role: 'spectator' }
      ],
      audioFilePath
    };

    const game = new GameOrchestrator(browser, audioFilePath);
    
    try {
      // Setup: create room and join all players
      await game.setup(config);
      
      // All players mark ready
      await game.allPlayersReady();
      
      // Host starts game
      await game.startGame();
      
      // Play rounds with voting until bingo
      const winner = await game.playRankedUntilBingo(9);
      
      // Assertions
      expect(winner).toBeTruthy();
      
      // Verify backend reports game finished
      const { getGameState } = await import('./helpers');
      const backendState = await getGameState(game.roomCode);
      expect(backendState.status).toBe('finished');
      
    } finally {
      await game.cleanup();
    }
  });

  test('should handle voting phase in ranked mode', async ({ browser }) => {
    const config: GameConfig = {
      players: [
        { name: 'HostPlayer', role: 'host' },
        { name: 'Producer2', role: 'producer' },
        { name: 'Spectator1', role: 'spectator' },
        { name: 'Spectator2', role: 'spectator' },
        { name: 'Spectator3', role: 'spectator' }
      ],
      audioFilePath
    };

    const game = new GameOrchestrator(browser, audioFilePath);
    
    try {
      await game.setup(config);
      await game.allPlayersReady();
      await game.startGame();
      
      // Play one ranked round with voting
      const isFinished = await game.playRankedRound();
      
      // Should not be finished after just one round
      expect(isFinished).toBe(false);
      
    } finally {
      await game.cleanup();
    }
  });
});
