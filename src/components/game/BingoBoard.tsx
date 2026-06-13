import { memo, useEffect, useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { BoardData } from '@/types/game';
import { BingoTile } from './BingoTile';
import { cn } from '@/lib/utils';
import { DiscordVerifiedIcon } from './DiscordVerifiedIcon';

interface BingoBoardProps {
  playerId: string;
  playerName: string;
  isDiscordVerified?: boolean;
  discordUsername?: string;
  boardData: BoardData;
  onTileClick?: (tileId: string) => void;
  isInteractive?: boolean;
  isTileInteractive?: (tileId: string) => boolean;
  className?: string;
  playerColorIndex?: number; // 0-3, maps to player color palette
}

// Player color accent lookup — complete strings so Tailwind's scanner finds them
const PLAYER_ACCENT = [
  { bg: 'bg-player-1/20', border: 'border-player-1/30', text: 'text-player-1', dot: 'bg-player-1' },
  { bg: 'bg-player-2/20', border: 'border-player-2/30', text: 'text-player-2', dot: 'bg-player-2' },
  { bg: 'bg-player-3/20', border: 'border-player-3/30', text: 'text-player-3', dot: 'bg-player-3' },
  { bg: 'bg-player-4/20', border: 'border-player-4/30', text: 'text-player-4', dot: 'bg-player-4' },
] as const;

export const BingoBoard = memo(function BingoBoard({
  playerId,
  playerName,
  isDiscordVerified,
  discordUsername,
  boardData,
  onTileClick,
  isInteractive = false,
  isTileInteractive,
  className,
  playerColorIndex,
}: BingoBoardProps) {
  const completedCount = boardData.tiles.filter(t => t.status === 'complete').length;
  const pendingCount = boardData.tiles.filter(t => t.status === 'pending').length;
  const prevCompletedRef = useRef(completedCount);
  const [shudder, setShudder] = useState(false);

  const accent = playerColorIndex !== undefined && playerColorIndex < PLAYER_ACCENT.length
    ? PLAYER_ACCENT[playerColorIndex]
    : null;

  useEffect(() => {
    if (completedCount > prevCompletedRef.current && completedCount >= 5) {
      setShudder(true);
      const t = setTimeout(() => setShudder(false), 300);
      prevCompletedRef.current = completedCount;
      return () => clearTimeout(t);
    }
    prevCompletedRef.current = completedCount;
  }, [completedCount]);

  return (
    <motion.div 
      data-testid="game-board"
      animate={shudder ? { x: [0, -4, 4, -2, 2, 0] } : { x: 0 }}
      transition={{ duration: 0.3 }}
      className={cn(
        'flex flex-col gap-4 rounded-xl border border-border bg-card p-4',
        'shadow-lg',
        className
      )}
    >
      <div className="flex min-w-0 items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className={cn(
            'flex h-10 w-10 items-center justify-center rounded-full border',
            accent ? `${accent.bg} ${accent.border} ${accent.text}` : 'bg-primary/20 border-primary/30 text-primary'
          )}>
            <span className="text-lg font-bold font-['Righteous']">{playerName.charAt(0)}</span>
          </div>
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <h3 className="truncate font-semibold text-foreground font-['Poppins']">{playerName}</h3>
              {isDiscordVerified && <DiscordVerifiedIcon username={discordUsername} />}
            </div>
            <p className="text-xs text-foreground/60">
              {completedCount}/9 complete
              {pendingCount > 0 && ` • ${pendingCount} pending`}
            </p>
          </div>
        </div>
        
        <div className="flex max-w-[5rem] shrink-0 flex-wrap justify-end gap-1 sm:max-w-none sm:flex-nowrap">
          {boardData.tiles.map((tile) => (
            <motion.div
              key={tile.id}
              layout
              className={cn(
                'h-2 w-2 rounded-full transition-colors',
                tile.status === 'empty' && 'bg-muted/50',
                tile.status === 'pending' && (accent ? `${accent.dot}` : 'bg-primary'),
                tile.status === 'complete' && 'bg-green-500'
              )}
            />
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {boardData.tiles.map((tile) => (
          <BingoTile
            key={tile.id}
            tile={tile}
            onClick={() => onTileClick?.(tile.id)}
            isInteractive={isInteractive && (isTileInteractive?.(tile.id) ?? true)}
            isActiveRoundTile={isTileInteractive?.(tile.id)}
            playerColorIndex={playerColorIndex}
          />
        ))}
      </div>
    </motion.div>
  );
});
