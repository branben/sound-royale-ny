import { test, expect } from '@playwright/test';
import { GameOrchestrator, GameConfig } from './pom/GameOrchestrator';
import { getGameState } from './helpers';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const audioFilePath = path.join(__dirname, 'fixtures/test-audio.wav');

const CONFIG: GameConfig = {
  players: [
    { name: 'HostPlayer', role: 'host' },
    { name: 'Producer2', role: 'producer' },
    { name: 'Spectator1', role: 'spectator' },
  ],
  audioFilePath,
};

test.describe('Live Golden User Flow', () => {
  test('host, producer, and spectator all see game board after start', async ({ browser }) => {
    test.setTimeout(120000);

    const game = new GameOrchestrator(browser, audioFilePath);

    try {
      await game.setup(CONFIG);
      await game.allPlayersReady();
      await game.startGame();

      const host = game.getPlayer('HostPlayer');
      const producer = game.getPlayer('Producer2');
      const spectator1 = game.getPlayer('Spectator1');

      // Navigate all players to room page
      await host.page.goto(`/room/${game.roomCode}`);
      await producer.page.goto(`/room/${game.roomCode}`);
      await spectator1.page.goto(`/room/${game.roomCode}`);

      // Assert: host and producer see game board
      await host.assertBoardVisible();
      await producer.assertBoardVisible();

      // Assert: spectator sees game board (SpectatorView renders BingoBoard for each producer)
      await spectator1.assertBoardVisible();

      // Verify backend state
      const backendState = await getGameState(game.roomCode);
      expect(backendState.status).toBe('playing');
    } finally {
      await game.cleanup();
    }
  });
});
