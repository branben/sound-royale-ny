import { useMemo } from 'react';
import type { Player } from '@/types/game';

/**
 * Player color palette — assigned in join order, skipping spectators.
 * These match the CSS variables --player-1 through --player-4.
 */
export const PLAYER_COLOR_PALETTE = [
  { hsl: 'hsl(0, 84%, 60%)', hex: '#EF4444', name: 'red' },     /* Player 1 */
  { hsl: 'hsl(217, 91%, 60%)', hex: '#3B82F6', name: 'blue' },   /* Player 2 */
  { hsl: 'hsl(48, 96%, 53%)', hex: '#EAB308', name: 'yellow' },  /* Player 3 */
  { hsl: 'hsl(142, 71%, 45%)', hex: '#22C55E', name: 'green' },  /* Player 4 */
] as const;

export type PlayerColorIndex = 0 | 1 | 2 | 3;

/**
 * Derive a stable player → color mapping from a game state's players object.
 * Colors are assigned in the order producers appear (first joined = Player 1, etc.).
 * Spectators are excluded from the color pool.
 */
export function assignPlayerColors(
  players: Record<string, Player>
): Map<string, PlayerColorIndex> {
  const colorMap = new Map<string, PlayerColorIndex>();
  let colorIndex = 0;

  const entries = Object.values(players);
  // Sort by join order — isHost first (they joined first), then by id
  const sorted = [...entries].sort((a, b) => {
    if (a.isHost && !b.isHost) return -1;
    if (!a.isHost && b.isHost) return 1;
    return a.id.localeCompare(b.id);
  });

  for (const player of sorted) {
    if (player.isSpectator || player.name?.startsWith('Spectator ')) {
      continue; // spectators don't get a player color
    }
    if (colorIndex < PLAYER_COLOR_PALETTE.length) {
      colorMap.set(player.id, colorIndex as PlayerColorIndex);
      colorIndex++;
    }
  }

  return colorMap;
}

/**
 * Hook: returns a stable mapping of player IDs to their assigned color index.
 * Recalculates only when the players object changes.
 */
export function usePlayerColors(players: Record<string, Player>) {
  return useMemo(() => assignPlayerColors(players), [players]);
}

/**
 * Get the CSS variable name for a player color index.
 * Use this to set `style={{ '--player-color': `var(${getPlayerColorVar(0)})` }}`.
 */
export function getPlayerColorVar(index: PlayerColorIndex): string {
  return `--player-${index + 1}`;
}

/**
 * Get a Tailwind class for a player's border/accent color.
 * These map to the custom `player-{1|2|3|4}` colors defined in tailwind.config.ts.
 */
export function getPlayerBorderClass(index: PlayerColorIndex): string {
  return `border-player-${index + 1}`;
}

export function getPlayerBgClass(index: PlayerColorIndex, opacity: '10' | '20' = '20'): string {
  return `bg-player-${index + 1}/${opacity}`;
}

export function getPlayerTextClass(index: PlayerColorIndex): string {
  return `text-player-${index + 1}`;
}
