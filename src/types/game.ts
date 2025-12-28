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

export interface Player {
  id: string;
  name: string;
  avatar?: string;
  board: BoardData;
}

export interface GameState {
  gameId: string;
  status: 'lobby' | 'playing' | 'finished';
  players: Record<string, Player>;
  currentRound: number;
  winner?: string;
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
