import { test, expect } from '@playwright/test';
import { GameOrchestrator, GameConfig } from './pom/GameOrchestrator';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const audioFilePath = path.join(__dirname, 'fixtures/test-audio.wav');

test.describe('Live E2E — Casual Mode (2 Players)', () => {
  test('should play full casual game to bingo', async ({ browser }) => {
    const config: GameConfig = {
      players: [
        { name: 'HostPlayer', role: 'host' },
        { name: 'Player2', role: 'producer' }
      ],
      audioFilePath
    };

    const game = new GameOrchestrator(browser, audioFilePath);
    
    try {
      // Setup: create room and join players
      await game.setup(config);
      
      // Both players mark ready
      await game.allPlayersReady();
      
      // Host starts game
      await game.startGame();
      
      // Play rounds until bingo
      const winner = await game.playUntilBingo(9);
      
      // Assertions
      expect(winner).toBeTruthy();
      
      // Verify backend reports game finished (winner already confirmed above)
      const { getGameState } = await import('./helpers');
      const backendState = await getGameState(game.roomCode);
      expect(backendState.status).toBe('finished');
      
    } finally {
      await game.cleanup();
    }
  });

  test('should handle tile submission for random genres', async ({ browser }) => {
    const config: GameConfig = {
      players: [
        { name: 'HostPlayer', role: 'host' },
        { name: 'Player2', role: 'producer' }
      ],
      audioFilePath
    };

    const game = new GameOrchestrator(browser, audioFilePath);
    
    try {
      await game.setup(config);
      await game.allPlayersReady();
      await game.startGame();
      
      // Play one round to verify genre matching works
      const isFinished = await game.playCasualRound();
      
      // Should not be finished after just one round
      expect(isFinished).toBe(false);
      
    } finally {
      await game.cleanup();
    }
  });
});
