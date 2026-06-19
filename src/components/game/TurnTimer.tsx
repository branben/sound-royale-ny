import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Clock, Play, Pause } from 'lucide-react';
import { transitions } from '@/lib/motion';

interface TurnTimerProps {
  duration: number;
  isActive: boolean;
  onTimeUp?: () => void;
  className?: string;
}

export function TurnTimer({ duration, isActive, onTimeUp, className }: TurnTimerProps) {
  const [timeLeft, setTimeLeft] = useState(duration);
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    if (!isActive || isPaused) return;

    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          onTimeUp?.();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isActive, isPaused, onTimeUp]);

  const progress = ((duration - timeLeft) / duration) * 100;
  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;

  const togglePause = () => {
    setIsPaused(!isPaused);
  };

  return (
    <motion.div
      data-testid="timer"
      className={cn(
        'flex flex-col items-center gap-2 p-3 rounded-lg bg-card/80 border border-border/50 transition-all duration-300',
        timeLeft <= 5 && 'border-red-500/50',
        className,
      )}
      layout
    >
      <div className="flex items-center gap-2">
        <Clock
          className={cn(
            'h-4 w-4 transition-all duration-300',
            isActive ? 'text-primary' : 'text-muted-foreground',
          )}
        />
        <span
          className={cn(
            'text-lg font-mono font-semibold transition-all duration-300',
            timeLeft <= 5 && 'text-red-500',
            isActive && 'text-primary',
          )}
        >
          {minutes.toString().padStart(2, '0')}:{seconds.toString().padStart(2, '0')}
        </span>
        {isActive && (
          <button
            onClick={togglePause}
            className={cn(
              'p-1 rounded-full transition-all duration-200',
              'hover:bg-background/50',
              isActive && 'ring-2 ring-primary/30',
            )}
          >
            {isPaused ? (
              <Play className="h-3 w-3 text-primary" />
            ) : (
              <Pause className="h-3 w-3 text-primary" />
            )}
          </button>
        )}
      </div>

      <div className="relative w-full h-2 bg-background/50 rounded-full overflow-hidden">
        <div
          className={cn(
            'h-full transition-all duration-1000 ease-out',
            timeLeft <= 10 && timeLeft > 5 && 'bg-yellow-500',
            timeLeft <= 5 && 'bg-red-500',
            timeLeft > 10 && 'bg-primary',
          )}
          style={{ width: `${progress}%` }}
        />
      </div>

      {timeLeft <= 10 && timeLeft > 0 && (
        <span
          className={cn(
            'text-xs font-bold',
            timeLeft <= 5 && 'text-red-500',
            timeLeft > 5 && 'text-yellow-500',
          )}
        >
          {timeLeft <= 5 ? 'Time up!' : 'Almost done!'}
        </span>
      )}
    </motion.div>
  );
}
