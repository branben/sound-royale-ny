import { memo, useEffect, useState, useRef, forwardRef, type ForwardedRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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
  isPlayersTurn?: boolean; // Added for 'Your Turn' badge
  playerColorIndex?: number; // 0-3, maps to player color palette
}

// Player color accent lookup — complete strings so Tailwind's scanner finds them
const PLAYER_ACCENT = [
  { bg: 'bg-player-1/20', border: 'border-player-1/30', text: 'text-player-1', dot: 'bg-player-1' },
  { bg: 'bg-player-2/20', border: 'border-player-2/30', text: 'text-player-2', dot: 'bg-player-2' },
  { bg: 'bg-player-3/20', border: 'border-player-3/30', text: 'text-player-3', dot: 'bg-player-3' },
  { bg: 'bg-player-4/20', border: 'border-player-4/30', text: 'text-player-4', dot: 'bg-player-4' },
] as const;

export const BingoBoard = memo(
  forwardRef(function BingoBoard(
    {
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
      isPlayersTurn, // Added to destructuring
    }: BingoBoardProps,
    ref: ForwardedRef<HTMLDivElement>,
  ) {
    const completedCount = boardData.tiles.filter((t) => t.status === 'complete').length;
    const pendingCount = boardData.tiles.filter((t) => t.status === 'pending').length;
    const prevCompletedRef = useRef(completedCount);
    const [shudder, setShudder] = useState(false);

    const accent =
      playerColorIndex !== undefined && playerColorIndex < PLAYER_ACCENT.length
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
        ref={ref}
        data-testid="game-board"
        animate={shudder ? { x: [0, -4, 4, -2, 2, 0] } : { x: 0 }}
        transition={{ duration: 0.3 }}
        className={cn(
          'flex flex-col gap-4 rounded-xl border border-border bg-card p-4',
          accent ? `border-l-4 ${accent.border}` : '', // Added conditional left border
          'shadow-lg',
          className,
        )}
      >
        <div className="flex min-w-0 items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div
              className={cn(
                'flex h-14 w-14 items-center justify-center rounded-full border',
                accent
                  ? `${accent.bg} ${accent.border} ${accent.text}`
                  : 'bg-primary/20 border-primary/30 text-primary',
              )}
            >
              <span className="text-2xl font-bold font-['Righteous']">{playerName.charAt(0)}</span>
            </div>
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-2">
                <h3 className="truncate text-lg font-bold text-foreground font-['Poppins']">
                  {playerName}
                </h3>
                {isDiscordVerified && <DiscordVerifiedIcon username={discordUsername} />}
                {isPlayersTurn &&
                  accent && ( // 'YOUR TURN' badge
                    <AnimatePresence>
                      <motion.span
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -10 }}
                        transition={{ duration: 0.2 }}
                        className={cn(
                          'ml-2 rounded-full px-3 py-1 text-xs font-bold uppercase',
                          accent.bg,
                          accent.text,
                        )}
                      >
                        Your Turn
                      </motion.span>
                    </AnimatePresence>
                  )}
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
                  'h-3 w-3 rounded-full transition-colors',
                  tile.status === 'empty' && 'bg-muted/50',
                  tile.status === 'pending' && (accent ? `${accent.dot}` : 'bg-primary'),
                  tile.status === 'complete' && 'bg-green-500',
                )}
              />
            ))}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
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
  }),
);
