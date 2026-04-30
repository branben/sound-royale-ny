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
