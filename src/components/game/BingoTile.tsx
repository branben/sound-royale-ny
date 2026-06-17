import { memo, useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Tile } from '@/types/game';
import { cn } from '@/lib/utils';
import { Music, Loader2, Check, Play, Pause } from 'lucide-react';
import { transitions, hover } from '@/lib/motion';

interface BingoTileProps {
  tile: Tile;
  onClick: () => void;
  isInteractive?: boolean;
  isActiveRoundTile?: boolean;
  playerColorIndex?: number;
}

// Complete tailwind class strings so Tailwind JIT scanner finds them
const TILE_ACCENT = [
  {
    ring: 'ring-player-1/70',
    pendingBg: 'bg-player-1/10',
    pendingBorder: 'border-player-1/60',
    pendingText: 'text-player-1',
    emptyHoverBorder: 'hover:border-player-1/50',
    playBtn: 'bg-player-1/80 hover:bg-player-1',
  },
  {
    ring: 'ring-player-2/70',
    pendingBg: 'bg-player-2/10',
    pendingBorder: 'border-player-2/60',
    pendingText: 'text-player-2',
    emptyHoverBorder: 'hover:border-player-2/50',
    playBtn: 'bg-player-2/80 hover:bg-player-2',
  },
  {
    ring: 'ring-player-3/70',
    pendingBg: 'bg-player-3/10',
    pendingBorder: 'border-player-3/60',
    pendingText: 'text-player-3',
    emptyHoverBorder: 'hover:border-player-3/50',
    playBtn: 'bg-player-3/80 hover:bg-player-3',
  },
  {
    ring: 'ring-player-4/70',
    pendingBg: 'bg-player-4/10',
    pendingBorder: 'border-player-4/60',
    pendingText: 'text-player-4',
    emptyHoverBorder: 'hover:border-player-4/50',
    playBtn: 'bg-player-4/80 hover:bg-player-4',
  },
] as const;

export const BingoTile = memo(function BingoTile({
  tile,
  onClick,
  isInteractive = false,
  isActiveRoundTile,
  playerColorIndex,
}: BingoTileProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [prevStatus, setPrevStatus] = useState(tile.status);
  const [justCompleted, setJustCompleted] = useState(false);
  const playCountRef = useRef(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const accent = playerColorIndex !== undefined && playerColorIndex < TILE_ACCENT.length
    ? TILE_ACCENT[playerColorIndex]
    : null;

  useEffect(() => {
    if (tile.audioUrl) {
      const audio = new Audio(tile.audioUrl);
      audioRef.current = audio;
      const onEnded = () => {
        setIsPlaying(false);
        playCountRef.current++;
      };
      audio.addEventListener('ended', onEnded);
      return () => {
        audio.removeEventListener('ended', onEnded);
        audio.pause();
        audioRef.current = null;
      };
    }
    return undefined;
  }, [tile.audioUrl]);

  useEffect(() => {
    if (prevStatus !== 'complete' && tile.status === 'complete') {
      setJustCompleted(true);
      const t = setTimeout(() => setJustCompleted(false), 600);
      return () => clearTimeout(t);
    }
    setPrevStatus(tile.status);
  }, [tile.status, prevStatus]);

  const handlePlayClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!audioRef.current || !tile.audioUrl) return;

    if (isPlaying) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setIsPlaying(false);
    } else {
      audioRef.current.play().catch(console.error);
      setIsPlaying(true);
    }
  };

  const statusStyles = {
    empty: cn(
      'bg-muted/30 border-muted-foreground/30',
      accent ? accent.emptyHoverBorder : 'hover:border-primary/50'
    ),
    pending: accent
      ? `${accent.pendingBg} ${accent.pendingBorder}`
      : 'bg-primary/10 border-primary/60',
    complete: 'bg-green-500/15 border-green-500/60',
  };

  const iconStyles = {
    empty: 'text-muted-foreground',
    pending: accent ? accent.pendingText : 'text-primary',
    complete: 'text-green-500',
  };

  return (
    <motion.button
      data-testid="bingo-tile"
      onClick={onClick}
      aria-disabled={!isInteractive}
      disabled={!isInteractive && !tile.audioUrl}
      layout
      whileHover={isInteractive && tile.status === 'empty' ? hover.medium : undefined}
      whileTap={isInteractive ? hover.tap : undefined}
      className={cn(
        'relative aspect-square w-full rounded-lg border-2 transition-colors duration-300',
        'flex flex-col items-center justify-center gap-2 p-2',
        'group',
        statusStyles[tile.status],
        !isInteractive && 'cursor-not-allowed opacity-45',
      )}
    >
      {isActiveRoundTile && tile.status === 'empty' && (
        <motion.div
          className={cn(
            'absolute inset-0 rounded-lg ring-2 ring-offset-2 ring-offset-card',
            accent ? accent.ring : 'ring-primary/70'
          )}
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 2, repeat: 3, ease: 'easeInOut' }}
        />
      )}

      <div className={cn(
        'flex h-10 w-10 items-center justify-center rounded-full',
        'bg-background/50 transition-colors duration-300',
      )}>
        <AnimatePresence mode="wait">
          {tile.status === 'empty' && (
            <motion.div
              key="empty"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.5, opacity: 0 }}
              transition={transitions.smooth}
            >
              <Music className={cn('h-5 w-5', iconStyles.empty)} />
            </motion.div>
          )}
          {tile.status === 'pending' && (
            <motion.div
              key="pending"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.5, opacity: 0 }}
              transition={transitions.smooth}
            >
              <Loader2 className={cn('h-5 w-5', iconStyles.pending)} />
            </motion.div>
          )}
          {tile.status === 'complete' && (
            <motion.div
              key="complete"
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.5, opacity: 0 }}
              transition={transitions.springBouncy}
            >
              <Check className={cn('h-5 w-5', iconStyles.complete)} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {tile.audioUrl && (
        <button
          onClick={handlePlayClick}
          className={cn(
            'absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full transition-colors',
            accent ? `${accent.playBtn}` : 'bg-primary/80 hover:bg-primary',
            isPlaying && 'animate-pulse'
          )}
        >
          {isPlaying ? (
            <Pause className="h-3 w-3 text-white" />
          ) : (
            <Play className="h-3 w-3 text-white" />
          )}
        </button>
      )}

      <motion.span
        className={cn(
          'text-xs font-semibold uppercase tracking-wider font-["Poppins"]',
          tile.status === 'empty' && 'text-muted-foreground',
          tile.status === 'pending' && (accent ? accent.pendingText : 'text-primary'),
          tile.status === 'complete' && 'text-green-500'
        )}
        animate={justCompleted ? { scale: [1, 1.15, 1] } : { scale: 1 }}
        transition={{ duration: 0.4 }}
      >
        {tile.genre}
      </motion.span>

      <AnimatePresence>
        {tile.status === 'complete' && (
          <motion.div
            className="absolute inset-0 rounded-lg bg-green-500/10"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3, delay: 0.1 }}
          />
        )}
      </AnimatePresence>

      {justCompleted && (
        <motion.div
          className="absolute inset-0 rounded-lg border-2 border-green-500/40"
          initial={{ scale: 0.8, opacity: 1 }}
          animate={{ scale: 1.3, opacity: 0 }}
          transition={{ duration: 0.5 }}
        />
      )}
    </motion.button>
  );
});
