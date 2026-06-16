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
  isVerified?: boolean;
  isDiscordVerified?: boolean;
  discordUsername?: string;
  discordAvatarUrl?: string;
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
  isCheckedIn?: boolean;
  currentTitle?: 'NONE' | 'JACKPOT' | 'SWEEPER' | 'CHECKED_IN';
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
  winner?: string;
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

export type ThemeId = 'classic' | 'weekly' | 'monthly' | 'phonk' | 'trap' | 'lofi' | 'house' | 'electronic' | 'custom';

export interface Theme {
  id: string;
  name: string;
  description: string;
  genres: string[];
  bonusMultiplier: number;
}

export interface ThemeRotation {
  key: 'classic' | 'weekly' | 'monthly';
  name: string;
  description: string;
  genres: string[];
  created_at?: string;
  updated_at?: string;
}

export const THEMES: Theme[] = [
  {
    id: 'classic',
    name: 'Classic',
    description: 'theme by @1120cooks',
    genres: [...GENRES],
    bonusMultiplier: 1.0,
  },
  {
    id: 'weekly',
    name: 'Weekly Rotation',
    description: 'theme by @1120cooks',
    genres: [...GENRES],
    bonusMultiplier: 1.0,
  },
  {
    id: 'monthly',
    name: 'Monthly Rotation',
    description: 'theme by @1120cooks',
    genres: [...GENRES],
    bonusMultiplier: 1.0,
  },
];

export interface BackendTile {
  id: string;
  genre: string;
  status: TileStatus;
  audio_url?: string;
}

export interface BackendPlayer {
  id: string;
  name?: string;
  player_name?: string;
  avatar?: string;
  is_discord_verified?: boolean;
  discord_username?: string;
  discord_avatar_url?: string;
  board?: BoardData;
  tiles?: BackendTile[];
  player_secret?: string;
  is_connected?: boolean;
  is_spectator?: boolean;
  is_host?: boolean;
  is_ready?: boolean;
  elo_rating?: number;
  elo_wins?: number;
  elo_losses?: number;
  elo_matches?: number;
  is_checked_in?: boolean;
  current_title?: 'NONE' | 'JACKPOT' | 'SWEEPER' | 'CHECKED_IN';
  scoreInfo?: ScoreInfo;
}

export interface RoomResponse {
  code: string;
  status: 'lobby' | 'playing' | 'finished';
  players: BackendPlayer[];
  current_round: number;
  total_rounds?: number;
  theme?: string;
  custom_genres?: string[];
  bonus_multiplier?: number;
  winner?: string | { id: string } | null;
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

export interface GenrePerformance {
  genre: string;
  wins: number;
  total_rounds: number;
  win_rate: number;
  grade: 'S' | 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'N/A';
  is_legacy?: boolean;
}
