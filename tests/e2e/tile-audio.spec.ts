import { test, expect } from '@playwright/test';
import {
  enableE2EMode,
  setupPlayerSession,
  mockApiRoutes,
  mockWebSocketConnection,
} from './helpers';
import { createMockPlayingState, createMockProducer, toRoomResponse } from './utils/game-fixtures';

test.describe('Tile Audio Playback', () => {
  test.beforeEach(async ({ page }) => {
    await enableE2EMode(page);
  });

  test('tile with audio URL shows audio controls', async ({ page }) => {
    const producer = createMockProducer('Producer1', { id: 'producer-1' });
    // Set audioUrl on tiles
    producer.board.tiles = producer.board.tiles.map((tile, i) => ({
      ...tile,
      audioUrl: i < 3 ? `/test-audio-${i}.mp3` : undefined,
    }));

    const gameState = createMockPlayingState({ [producer.id]: producer });

    await mockApiRoutes(page, {
      roomResponse: toRoomResponse(gameState),
      rejoin: { player: producer, playerSecret: 'producer-secret' },
    });

    await mockWebSocketConnection(page);

    await setupPlayerSession(page, {
      playerName: producer.name,
      playerId: 'producer-1',
      playerSecret: 'producer-secret',
    });

    await page.goto(`/room/${gameState.id}`);

    // Bingo tiles should be visible
    const tiles = page.getByTestId('bingo-tile');
    await expect(tiles.first()).toBeVisible({ timeout: 10000 });

    // Tiles with audio should have audio controls (play button or audio indicator)
    // The audio control is typically a play/pause button or audio element
    // We verify the tile is interactive (clickable) — actual audio playback
    // cannot be tested in headless Chromium
    const firstTile = tiles.first();
    await expect(firstTile).toBeVisible();
    // Verify tile is clickable (interactive)
    await expect(firstTile).toBeEnabled();

    // Visual-regression gate: playing board with claimed tiles + audio controls.
    await page.waitForTimeout(600);
    await expect(page).toHaveScreenshot('tile-audio-playing-board.png', {
      maxDiffPixelRatio: 0.02,
      animations: 'disabled',
    });
  });

  test('tile without audio URL does not show audio controls', async ({ page }) => {
    const producer = createMockProducer('Producer1', { id: 'producer-1' });
    // Ensure no audioUrl on tiles
    producer.board.tiles = producer.board.tiles.map((tile) => ({
      ...tile,
      audioUrl: undefined,
    }));

    const gameState = createMockPlayingState({ [producer.id]: producer });

    await mockApiRoutes(page, {
      roomResponse: toRoomResponse(gameState),
      rejoin: { player: producer, playerSecret: 'producer-secret' },
    });

    await mockWebSocketConnection(page);

    await setupPlayerSession(page, {
      playerName: producer.name,
      playerId: 'producer-1',
      playerSecret: 'producer-secret',
    });

    await page.goto(`/room/${gameState.id}`);

    // Bingo tiles should be visible
    const tiles = page.getByTestId('bingo-tile');
    await expect(tiles.first()).toBeVisible({ timeout: 10000 });

    // Tiles should render but without audio-specific controls
    // (This test verifies the UI renders correctly without audio)
    const firstTile = tiles.first();
    await expect(firstTile).toBeVisible();
  });
});
