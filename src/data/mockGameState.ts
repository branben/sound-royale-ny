import { GameState, GENRES } from '@/types/game';

const createBoard = () => ({
  tiles: GENRES.map((genre, index) => ({
    id: `tile-${index}`,
    genre,
    status: 'empty' as const,
    audioUrl: undefined,
  })),
});

export const mockGameState: GameState = {
  gameId: 'game-001',
  status: 'playing',
  currentRound: 1,
  players: {
    player_1: {
      id: 'player_1',
      name: 'Producer A',
      avatar: undefined,
      board: {
        tiles: GENRES.map((genre, index) => ({
          id: `p1-tile-${index}`,
          genre,
          status: index === 0 ? 'complete' : index === 4 ? 'pending' : 'empty',
          audioUrl: index === 0 ? 'https://example.com/audio1.mp3' : undefined,
        })),
      },
    },
    player_2: {
      id: 'player_2',
      name: 'Producer B',
      avatar: undefined,
      board: {
        tiles: GENRES.map((genre, index) => ({
          id: `p2-tile-${index}`,
          genre,
          status: index === 2 ? 'complete' : 'empty',
          audioUrl: index === 2 ? 'https://example.com/audio2.mp3' : undefined,
        })),
      },
    },
  },
};
