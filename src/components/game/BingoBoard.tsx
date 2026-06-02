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
}

export const BingoBoard = memo(function BingoBoard({
  playerId,
  playerName,
  isDiscordVerified,
  discordUsername,
  boardData,
  onTileClick,
  isInteractive = false,
  isTileInteractive,
  className
}: BingoBoardProps) {
  const completedCount = boardData.tiles.filter(t => t.status === 'complete').length;
  const pendingCount = boardData.tiles.filter(t => t.status === 'pending').length;
  const prevCompletedRef = useRef(completedCount);
  const [shudder, setShudder] = useState(false);

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
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/20 border border-primary/30 text-primary">
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
                tile.status === 'pending' && 'bg-primary',
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
          />
        ))}
      </div>
    </motion.div>
  );
});
