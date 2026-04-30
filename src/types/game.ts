export type TileStatus = 'empty' | 'pending' | 'complete';

export interface Tile {
  id: string;
  genre: string;
  status: TileStatus;
  audioUrl?: string;
}

export interface BoardData {
  tiles: Tile[];
}

export interface ScoreInfo {
  score: number;
  base_score: number;
  bonuses: Array<{
    type: string;
    points: number;
  }>;
  lines: Array<{
    type: string;
    positions: number[];
  }>;
}

export interface Player {
  id: string;
  name: string;
  avatar?: string;
  board: BoardData;
  playerSecret?: string;
  verifiedUserId?: string | null;
  isVerified?: boolean;
  isConnected?: boolean;
  isSpectator?: boolean;
  isHost?: boolean;
  isReady?: boolean;
  score?: number;
  eloRating?: number;
  eloWins?: number;
  eloLosses?: number;
  eloMatches?: number;
  scoreInfo?: ScoreInfo;
}

export interface Vote {
  id: string;
  voter: string;
  voterName: string;
  votedFor: string;
  votedForName: string;
}

export interface RoundState {
  roundNumber: number;
  currentTileGenre: string;
  timerDuration: number;
  timerEndsAt?: string;
  votingOpen: boolean;
  votesRecorded: number;
  votes?: Vote[];
  winner?: string | {
    id: string;
    name?: string;
  };
}

export interface EloDelta {
  playerId: string;
  playerName: string;
  previousElo: number;
  newElo: number;
  delta: number;
  isWinner: boolean;
}

export interface GameState {
  gameId: string;
  roomCode?: string;
  status: 'lobby' | 'playing' | 'finished';
  players: Record<string, Player>;
  currentRound: number;
  totalRounds?: number;
  winner?: string;
  roundState?: RoundState;
  spectatorCount?: number;
  eloDeltas?: EloDelta[];
}

export const GENRES = [
  'Phonk',
  'Trap',
  'Lo-Fi',
  'House',
  'Drill',
  'R&B',
  'EDM',
  'Jazz',
  'Ambient'
] as const;

export type Genre = typeof GENRES[number];

export interface Theme {
  id: string;
  name: string;
  description: string;
  genres: string[];
  bonusMultiplier: number;
}

export const THEMES: Theme[] = [
  {
    id: 'classic',
    name: 'Classic',
    description: 'Standard genre mix',
    genres: [...GENRES],
    bonusMultiplier: 1.0,
  },
  {
    id: 'phonk',
    name: 'Phonk Heavy',
    description: 'Dark and aggressive sounds',
    genres: ['Phonk', 'Trap', 'Drill', 'House', 'R&B'],
    bonusMultiplier: 1.2,
  },
  {
    id: 'trap',
    name: 'Trap',
    description: 'Atlanta trap beats',
    genres: ['Trap', 'Phonk', 'Drill', 'R&B', 'EDM'],
    bonusMultiplier: 1.15,
  },
  {
    id: 'lofi',
    name: 'Chill Vibes',
    description: 'Relaxed and atmospheric',
    genres: ['Lo-Fi', 'Ambient', 'Jazz', 'R&B', 'Phonk'],
    bonusMultiplier: 1.1,
  },
  {
    id: 'house',
    name: 'House',
    description: 'Dance and electronic beats',
    genres: ['House', 'EDM', 'Techno', 'Disco', 'Lo-Fi'],
    bonusMultiplier: 1.15,
  },
  {
    id: 'electronic',
    name: 'Electronic',
    description: 'EDM and energy',
    genres: ['EDM', 'House', 'Techno', 'Trance', 'Dubstep'],
    bonusMultiplier: 1.15,
  },
] as const;

export type ThemeId = typeof THEMES[number]['id'];

export interface RoomResponse {
  code: string;
  status: 'lobby' | 'playing' | 'finished';
  players: Array<{
    id: string;
    name: string;
    avatar?: string;
    tiles?: Array<{
      id: string;
      genre: string;
      status: TileStatus;
      audio_url?: string;
    }>;
    player_secret?: string;
    verified_user?: string | null;
    verifiedUserId?: string | null;
    isVerified?: boolean;
    is_connected?: boolean;
    is_spectator?: boolean;
    is_host?: boolean;
    is_ready?: boolean;
    elo_rating?: number;
    elo_wins?: number;
    elo_losses?: number;
    elo_matches?: number;
  }>;
  current_round: number;
  total_rounds?: number;
  theme?: string;
  custom_genres?: string[];
  bonus_multiplier?: number;
  winner?: string;
  elo_deltas?: Array<{
    player_id: string;
    player_name: string;
    previous_elo: number;
    new_elo: number;
    delta: number;
    is_winner: boolean;
  }>;
}

export interface CreateRoomResponse {
  room_code: string;
  player_id: string;
  player_secret: string;
}
