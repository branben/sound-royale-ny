import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Clock, Play, Pause } from 'lucide-react';

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
    <div className={cn(
      'flex flex-col items-center gap-2 p-3 rounded-lg bg-card/80 border border-border/50',
      'backdrop-blur-sm transition-all duration-300',
      className
    )}>
      <div className="flex items-center gap-2">
        <div className={cn(
          'relative flex items-center gap-2',
          isActive && 'animate-pulse-subtle'
        )}>
          <Clock className={cn(
            'h-4 w-4 transition-all duration-300',
            isActive ? 'text-primary' : 'text-muted-foreground'
          )} />
          <span className={cn(
            'text-lg font-mono font-semibold transition-all duration-300',
            isActive && 'text-primary'
          )}>
            {minutes.toString().padStart(2, '0')}:{seconds.toString().padStart(2, '0')}
          </span>
          {isActive && (
            <button
              onClick={togglePause}
              className={cn(
                'p-1 rounded-full transition-all duration-200',
                'hover:bg-background/50',
                isActive && 'ring-2 ring-primary/30'
              )}
            >
              {isPaused ? 
                <Play className="h-3 w-3 text-primary" /> : 
                <Pause className="h-3 w-3 text-primary" />
              }
            </button>
          )}
        </div>
      </div>
      
      <div className="relative w-full h-2 bg-background/50 rounded-full overflow-hidden">
        <div className="relative h-full">
          <div 
            className={cn(
              'h-full transition-all duration-1000 ease-out',
              timeLeft <= 10 && timeLeft > 5 && 'bg-yellow-500',
              timeLeft <= 5 && 'bg-red-500 animate-pulse-subtle',
              timeLeft > 10 && 'bg-primary'
            )}
            style={{ width: `${progress}%` }}
          />
          {isActive && (
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer" />
          )}
        </div>
      </div>
      
      {timeLeft <= 10 && timeLeft > 0 && (
        <span className={cn(
          'text-xs font-bold animate-bounce-in',
          timeLeft <= 5 && 'text-red-500',
          timeLeft > 5 && 'text-yellow-500'
        )}>
          {timeLeft <= 5 ? 'TIME UP!' : 'Almost done!'}
        </span>
      )}
    </div>
  );
}