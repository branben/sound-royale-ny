import { test, expect } from '@playwright/test';
import { GameOrchestrator, GameConfig } from './pom/GameOrchestrator';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const audioFilePath = path.join(__dirname, 'fixtures/test-audio.wav');

test.describe('Live E2E — Casual Mode (2 Players)', () => {
  test('should play full casual game to bingo', async ({ browser }) => {
    test.fixme(true); // tracked: e2e test rot — issue #169
    const config: GameConfig = {
      players: [
        { name: 'HostPlayer', role: 'host' },
        { name: 'Player2', role: 'producer' },
      ],
      audioFilePath,
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
        { name: 'Player2', role: 'producer' },
      ],
      audioFilePath,
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

  test('casual round ends on time-up with no spectator voting', async ({ browser }) => {
    test.fixme(true); // tracked: e2e test rot — issue #169
    const { getGameState } = await import('./helpers');
    const config: GameConfig = {
      players: [
        { name: 'HostPlayer', role: 'host' },
        { name: 'Player2', role: 'producer' },
      ],
      audioFilePath,
    };

    const game = new GameOrchestrator(browser, audioFilePath);

    try {
      await game.setup(config);
      await game.allPlayersReady();
      await game.startGame();

      // Play one casual round (0 spectators -> match_type CASUAL).
      await game.playCasualRound();

      const state = await getGameState(game.roomCode);
      // Backend gates voting on spectator_count >= 3; casual has none.
      expect(state.roundState?.votingOpen).toBe(false);

      // UI reflects the gate: panel shows the "waiting" message, never "Vote: <genre>".
      const panel = game.getPlayer('HostPlayer').page.getByTestId('voting-panel');
      await expect(panel).toContainText('Waiting for more spectators');
      await expect(panel).not.toContainText(/Vote:/);
    } finally {
      await game.cleanup();
    }
  });

  test('casual results do not affect ELO or ranked leaderboard', async ({ browser }) => {
    const { getGameState } = await import('./helpers');
    const config: GameConfig = {
      players: [
        { name: 'HostPlayer', role: 'host' },
        { name: 'Player2', role: 'producer' },
      ],
      audioFilePath,
    };

    const game = new GameOrchestrator(browser, audioFilePath);

    try {
      await game.setup(config);
      await game.allPlayersReady();
      await game.startGame();

      const before = await getGameState(game.roomCode);
      const eloBefore = Object.fromEntries(
        Object.entries(before.players).map(([id, p]) => [id, (p as any).eloRating]),
      );

      // Play several casual rounds (0 spectators -> CASUAL, ELO gated off at views.py:1751).
      for (let i = 0; i < 3; i++) {
        await game.playCasualRound();
      }

      const after = await getGameState(game.roomCode);
      for (const [id, rating] of Object.entries(eloBefore)) {
        const afterRating = (after.players[id] as any).eloRating;
        expect(afterRating).toBe(rating); // ELO unchanged after casual play
      }
    } finally {
      await game.cleanup();
    }
  });
});
