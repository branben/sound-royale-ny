import { GameState, GENRES } from '@/types/game';

const createBoard = () => ({
  tiles: GENRES.map((genre, index) => ({
    id: `tile-${index}`,
    genre,
    status: 'empty' as const,
    audioUrl: undefined
  }))
});

export const mockGameState: GameState = {
  gameId: 'game-001',
  roomCode: 'game-001',
  status: 'playing',
  currentRound: 1,
  players: {
    player_1: {
      id: 'player_1',
      name: 'TestPlayer',
      avatar: undefined,
      board: {
        tiles: GENRES.map((genre, index) => ({
          id: `p1-tile-${index}`,
          genre,
          status: index === 0 ? 'complete' : index === 4 ? 'pending' : 'empty',
          audioUrl: index === 0 ? 'https://example.com/audio1.mp3' : undefined
        }))
      },
      isConnected: true,
      eloRating: 1200,
      eloWins: 5,
      eloLosses: 3,
      eloMatches: 8,
      scoreInfo: {
        score: 300,
        base_score: 300,
        bonuses: [],
        lines: [
          { type: 'row', positions: [0, 1, 2] }
        ]
      }
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
          audioUrl: index === 2 ? 'https://example.com/audio2.mp3' : undefined
        }))
      },
      isConnected: true,
      eloRating: 1150,
      eloWins: 3,
      eloLosses: 5,
      eloMatches: 8
    }
  }
};
