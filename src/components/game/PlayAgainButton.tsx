import React from 'react';
import { Button } from '@/components/ui/button';
import { RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PlayAgainButtonProps {
  onPlayAgain: () => void;
  disabled?: boolean;
  className?: string;
}

export const PlayAgainButton: React.FC<PlayAgainButtonProps> = ({
  onPlayAgain,
  disabled = false,
  className
}) => {
  return (
    <Button
      data-testid="play-again"
      onClick={onPlayAgain}
      disabled={disabled}
      className={cn(
        "flex items-center gap-2 px-6 py-3 bg-primary hover:opacity-90 transition-all",
        className
      )}
    >
      <RotateCcw className="h-5 w-5" />
      <span className="font-semibold">Play Again</span>
    </Button>
  );
};
