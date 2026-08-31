import { useRef, useEffect, useState, useCallback } from 'react';
import WaveSurfer from 'wavesurfer.js';
import { Play, Pause } from 'lucide-react';
import { cn } from '@/lib/utils';

interface WaveformProps {
  url: string;
  height?: number;
  waveColor?: string;
  progressColor?: string;
  cursorColor?: string;
  compact?: boolean;
  onReady?: (duration: number) => void;
  onPlay?: () => void;
  onPause?: () => void;
  onFinish?: () => void;
  onTimeUpdate?: (currentTime: number) => void;
  className?: string;
  accentColor?: string;
}

export function Waveform({
  url,
  height = 64,
  waveColor = '#52525b',
  progressColor = '#3b82f6',
  cursorColor = '#fafafa',
  compact = false,
  onReady,
  onPlay,
  onPause,
  onFinish,
  onTimeUpdate,
  className,
  accentColor,
}: WaveformProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  useEffect(() => {
    if (!containerRef.current) return;

    const ws = WaveSurfer.create({
      container: containerRef.current,
      url,
      height: compact ? 32 : height,
      waveColor,
      progressColor: accentColor || progressColor,
      cursorColor: compact ? 'transparent' : cursorColor,
      cursorWidth: compact ? 0 : 2,
      barWidth: compact ? 2 : 3,
      barGap: compact ? 1 : 2,
      barRadius: compact ? 1 : 2,
      normalize: true,
      hideScrollbar: true,
    });

    wavesurferRef.current = ws;

    ws.on('ready', (dur: number) => {
      setIsReady(true);
      setDuration(dur);
      onReady?.(dur);
    });

    ws.on('play', () => {
      setIsPlaying(true);
      onPlay?.();
    });

    ws.on('pause', () => {
      setIsPlaying(false);
      onPause?.();
    });

    ws.on('finish', () => {
      setIsPlaying(false);
      onFinish?.();
    });

    ws.on('timeupdate', (time: number) => {
      setCurrentTime(time);
      onTimeUpdate?.(time);
    });

    ws.on('error', (err: Error) => {
      console.error('WaveSurfer error:', err);
    });

    return () => {
      ws.destroy();
      wavesurferRef.current = null;
      setIsReady(false);
      setIsPlaying(false);
    };
  }, [url, height, waveColor, progressColor, cursorColor, accentColor, compact]);

  const handlePlayPause = useCallback(() => {
    wavesurferRef.current?.playPause();
  }, []);

  const handleSeek = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!wavesurferRef.current || !duration) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const progress = x / rect.width;
      wavesurferRef.current.seekTo(Math.max(0, Math.min(1, progress)));
    },
    [duration],
  );

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (compact) {
    return (
      <div className={cn('flex items-center gap-2', className)}>
        <button
          onClick={handlePlayPause}
          disabled={!isReady}
          className={cn(
            'flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition-colors',
            'bg-primary text-primary-foreground hover:bg-primary/90',
            'disabled:opacity-50 disabled:cursor-not-allowed',
          )}
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3 ml-0.5" />}
        </button>

        <div
          ref={containerRef}
          className="flex-1 cursor-pointer rounded bg-zinc-900/50"
          onClick={handleSeek}
          role="slider"
          aria-label="Audio position"
          aria-valuenow={Math.floor(currentTime)}
          aria-valuemax={Math.floor(duration)}
          tabIndex={0}
        />
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div className="flex items-center gap-3">
        <button
          onClick={handlePlayPause}
          disabled={!isReady}
          className={cn(
            'flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors',
            'bg-primary text-primary-foreground hover:bg-primary/90',
            'disabled:opacity-50 disabled:cursor-not-allowed',
          )}
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5 ml-0.5" />}
        </button>

        <div
          ref={containerRef}
          className="flex-1 cursor-pointer rounded-md bg-zinc-900/50"
          onClick={handleSeek}
          role="slider"
          aria-label="Audio position"
          aria-valuenow={Math.floor(currentTime)}
          aria-valuemax={Math.floor(duration)}
          tabIndex={0}
        />

        <span className="text-xs text-zinc-400 tabular-nums font-mono min-w-[40px] text-right">
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>
      </div>
    </div>
  );
}
