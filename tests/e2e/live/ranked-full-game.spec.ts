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
        { name: 'Spectator3', role: 'spectator' },
      ],
      audioFilePath,
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
        { name: 'Spectator3', role: 'spectator' },
      ],
      audioFilePath,
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

  test('enforces >=3 spectator gate for ranked voting', async ({ browser }) => {
    const { getGameState } = await import('./helpers');

    // Below threshold: 2 spectators -> voting blocked.
    const below = new GameOrchestrator(browser, audioFilePath);
    try {
      await below.setup({
        players: [
          { name: 'HostPlayer', role: 'host' },
          { name: 'Producer2', role: 'producer' },
          { name: 'Spectator1', role: 'spectator' },
          { name: 'Spectator2', role: 'spectator' },
        ],
        audioFilePath,
      });
      await below.allPlayersReady();
      await below.startGame();
      await below.playCasualRound(true); // play tiles, do not advance

      // Backend rejects open_voting with <3 spectators — assert the rejection
      // via the framework instead of a manual try/catch flag.
      await expect(below.getPlayer('HostPlayer').openVoting()).rejects.toThrow();

      const belowState = await getGameState(below.roomCode);
      expect(belowState.roundState?.votingOpen).toBe(false);

      // UI reflects the gate: voting panel shows the waiting message.
      const belowPanel = below.getPlayer('Spectator1').page.getByTestId('voting-panel');
      await expect(belowPanel).toContainText('Waiting for more spectators');
    } finally {
      await below.cleanup();
    }

    // At threshold: 3 spectators -> voting opens.
    const at = new GameOrchestrator(browser, audioFilePath);
    try {
      await at.setup({
        players: [
          { name: 'HostPlayer', role: 'host' },
          { name: 'Producer2', role: 'producer' },
          { name: 'Spectator1', role: 'spectator' },
          { name: 'Spectator2', role: 'spectator' },
          { name: 'Spectator3', role: 'spectator' },
        ],
        audioFilePath,
      });
      await at.allPlayersReady();
      await at.startGame();
      await at.playCasualRound(true);

      await at.getPlayer('HostPlayer').openVoting();

      const atState = await getGameState(at.roomCode);
      expect(atState.roundState?.votingOpen).toBe(true);

      // UI reflects an active voting session.
      const atPanel = at.getPlayer('Spectator1').page.getByTestId('voting-panel');
      await expect(atPanel).toContainText(/Vote:/);
    } finally {
      await at.cleanup();
    }
  });
});
