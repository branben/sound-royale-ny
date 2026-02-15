import { useState, useRef, useEffect } from 'react';
import { Tile } from '@/types/game';
import { cn } from '@/lib/utils';
import { Music, Loader2, Check, Play, Pause } from 'lucide-react';

interface BingoTileProps {
  tile: Tile;
  onClick: () => void;
  isInteractive?: boolean;
}

export function BingoTile({ tile, onClick, isInteractive = false }: BingoTileProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (tile.audioUrl) {
      audioRef.current = new Audio(tile.audioUrl);
      audioRef.current.addEventListener('ended', () => setIsPlaying(false));
    }
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, [tile.audioUrl]);

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
    empty: 'bg-[#334155]/30 border-[#64748B]/30 hover:border-[#7C3AED]/50 hover:shadow-[0_0_15px_rgba(124,58,237,0.2)]',
    pending: 'bg-[#F43F5E]/10 border-[#F43F5E]/60 shadow-[0_0_20px_rgba(244,63,94,0.4)] animate-pulse',
    complete: 'bg-[#10B981]/15 border-[#10B981]/60 shadow-[0_0_20px_rgba(16,185,129,0.4)]'
  };

  const iconStyles = {
    empty: 'text-[#64748B]',
    pending: 'text-[#F43F5E]',
    complete: 'text-[#10B981]'
  };

  return (
    <button
      onClick={onClick}
      disabled={!isInteractive && tile.status !== 'empty'}
      className={cn(
        'relative aspect-square w-full rounded-lg border-2 backdrop-blur-sm transition-all duration-300',
        'flex flex-col items-center justify-center gap-2 p-2',
        'group cursor-pointer',
        statusStyles[tile.status],
        isInteractive && tile.status === 'empty' && 'hover:scale-[1.02] hover:shadow-lg hover:shadow-primary/20'
      )}
    >
      {/* Status Icon */}
      <div className={cn(
        'flex h-10 w-10 items-center justify-center rounded-full',
        'bg-background/50 backdrop-blur-sm transition-all duration-300',
        tile.status === 'pending' && 'animate-spin-slow'
      )}>
        {tile.status === 'empty' && (
          <Music className={cn('h-5 w-5', iconStyles.empty)} />
        )}
        {tile.status === 'pending' && (
          <Loader2 className={cn('h-5 w-5', iconStyles.pending)} />
        )}
        {tile.status === 'complete' && (
          <Check className={cn('h-5 w-5', iconStyles.complete)} />
        )}
      </div>

      {tile.audioUrl && (
        <button
          onClick={handlePlayClick}
          className={cn(
            'absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full',
            'bg-primary/80 hover:bg-primary transition-colors',
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

      <span className={cn(
        'text-xs font-semibold uppercase tracking-wider font-["Poppins"]',
        tile.status === 'empty' && 'text-[#64748B]',
        tile.status === 'pending' && 'text-[#F43F5E]',
        tile.status === 'complete' && 'text-[#10B981]'
      )}>
        {tile.genre}
      </span>

      {tile.status === 'complete' && (
        <div className="absolute inset-0 rounded-lg bg-[#10B981]/20 blur-md" />
      )}
    </button>
  );
}
