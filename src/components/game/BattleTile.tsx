import { useState } from 'react';
import { TileStatus } from '@/types/game';
import { cn } from '@/lib/utils';
import { Mic2, Upload, CheckCircle2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface BattleTileProps {
  genre: string;
  status: TileStatus;
  isInteractive: boolean;
  onUpload: () => void;
  className?: string;
}

export function BattleTile({ genre, status, isInteractive, onUpload, className }: BattleTileProps) {
  const isEmpty = status === 'empty';
  const isPending = status === 'pending';
  const isComplete = status === 'complete';

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-xl border-2 transition-all duration-500',
        isEmpty && 'border-dashed border-primary/30 bg-card/50',
        isPending && 'border-primary bg-primary/10 ',
        isComplete && 'border-green-500 bg-green-500/10',
        className,
      )}
    >
      {/* Animated background gradient */}
      <div
        className={cn(
          'absolute inset-0 opacity-0 transition-opacity duration-500',
          isInteractive && isEmpty && 'bg-primary/10',
        )}
      />

      <div className="relative z-10 flex flex-col items-center justify-center p-8 min-h-[300px] gap-4">
        {/* Genre icon */}
        <div
          className={cn(
            'flex h-20 w-20 items-center justify-center rounded-full transition-all duration-300',
            isEmpty && 'bg-primary/20 border-2 border-primary/30',
            isPending && 'bg-primary/20 border-2 border-primary/30',
            isComplete && 'bg-green-500/20 border-2 border-green-500/30',
          )}
        >
          {isPending ? (
            <Loader2 className="h-10 w-10 text-primary animate-spin" />
          ) : isComplete ? (
            <CheckCircle2 className="h-10 w-10 text-green-500" />
          ) : (
            <Mic2 className="h-10 w-10 text-primary" />
          )}
        </div>

        {/* Genre label */}
        <div className="text-center">
          <h3 className="text-2xl font-bold text-foreground font-['Poppins'] uppercase tracking-wider">
            {genre}
          </h3>
          <p className="text-sm text-foreground/60 mt-1">
            {isEmpty && 'Your beat for this round'}
            {isPending && 'Uploading...'}
            {isComplete && 'Submitted!'}
          </p>
        </div>

        {/* Upload button */}
        {isInteractive && isEmpty && (
          <Button onClick={onUpload} className="mt-4 gap-2 bg-primary hover:bg-primary/80">
            <Upload className="h-4 w-4" />
            Upload Your Beat
          </Button>
        )}

        {/* Status indicator */}
        {isPending && (
          <div className="flex items-center gap-2 text-primary">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm font-medium">Uploading audio...</span>
          </div>
        )}
      </div>

      {/* Corner decorations */}
      <div
        className={cn(
          'absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 rounded-tl-lg transition-colors',
          isEmpty && 'border-primary/30',
          isPending && 'border-primary',
          isComplete && 'border-green-500',
        )}
      />
      <div
        className={cn(
          'absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 rounded-tr-lg transition-colors',
          isEmpty && 'border-primary/30',
          isPending && 'border-primary',
          isComplete && 'border-green-500',
        )}
      />
      <div
        className={cn(
          'absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 rounded-bl-lg transition-colors',
          isEmpty && 'border-primary/30',
          isPending && 'border-primary',
          isComplete && 'border-green-500',
        )}
      />
      <div
        className={cn(
          'absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 rounded-br-lg transition-colors',
          isEmpty && 'border-primary/30',
          isPending && 'border-primary',
          isComplete && 'border-green-500',
        )}
      />
    </div>
  );
}
