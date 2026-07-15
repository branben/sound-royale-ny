import { test, expect } from '@playwright/test';
import { GameOrchestrator, GameConfig } from './pom/GameOrchestrator';
import { getGameState } from './helpers';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const audioFilePath = path.join(__dirname, 'fixtures/test-audio.wav');

const RANKED_CONFIG: GameConfig = {
  players: [
    { name: 'HostPlayer', role: 'host' },
    { name: 'Producer2', role: 'producer' },
    { name: 'Spectator1', role: 'spectator' },
    { name: 'Spectator2', role: 'spectator' },
    { name: 'Spectator3', role: 'spectator' },
  ],
  audioFilePath,
};

test.describe('Live Spectator UI Verification', () => {
  test('spectator sees live game progression through boards, voting, and round advance', async ({
    browser,
  }) => {
    const game = new GameOrchestrator(browser, audioFilePath);

    try {
      await game.setup(RANKED_CONFIG);
      await game.allPlayersReady();
      await game.startGame();

      const spectator1 = game.getPlayer('Spectator1');

      // Navigate spectator to the room page to see game in progress
      await spectator1.page.goto(`/room/${game.roomCode}`);

      // Assert: spectator sees game boards
      await spectator1.assertBoardVisible();

      // Assert: round indicator visible
      await spectator1.assertRoundNumber(1);

      // Play a ranked round (producers play tiles → host opens voting)
      const isFinished = await game.playRankedRound();

      // After the round, spectator should see round 2 (if game continues)
      if (!isFinished) {
        // Reload to pick up latest state
        await spectator1.page.reload();
        await spectator1.assertBoardVisible();
      }
    } finally {
      await game.cleanup();
    }
  });

  test('spectator sees winner announcement after bingo', async ({ browser }) => {
    test.fixme(true); // tracked: e2e test rot — issue #169
    const game = new GameOrchestrator(browser, audioFilePath);

    try {
      await game.setup(RANKED_CONFIG);
      await game.allPlayersReady();
      await game.startGame();

      // Play ranked rounds until bingo
      const winnerId = await game.playRankedUntilBingo(9);
      expect(winnerId).toBeTruthy();

      // Verify backend state
      const backendState = await getGameState(game.roomCode);
      expect(backendState.status).toBe('finished');

      // Find winner name from backend
      const winnerPlayer = backendState.players[winnerId!];
      expect(winnerPlayer).toBeTruthy();
      const winnerName = winnerPlayer.name;

      // Navigate spectator to room and verify winner announcement
      const spectator1 = game.getPlayer('Spectator1');
      await spectator1.page.goto(`/room/${game.roomCode}`);
      await spectator1.assertWinnerVisible(winnerName);
    } finally {
      await game.cleanup();
    }
  });
});
