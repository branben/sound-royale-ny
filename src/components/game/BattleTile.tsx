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

export function BattleTile({
  genre,
  status,
  isInteractive,
  onUpload,
  className
}: BattleTileProps) {
  const isEmpty = status === 'empty';
  const isPending = status === 'pending';
  const isComplete = status === 'complete';

  return (
    <div className={cn(
      'relative overflow-hidden rounded-xl border-2 transition-all duration-500',
      isEmpty && 'border-dashed border-[#7C3AED]/30 bg-[#1A1A2E]/50',
      isPending && 'border-[#F43F5E] bg-[#F43F5E]/10 shadow-[0_0_30px_rgba(244,63,94,0.3)]',
      isComplete && 'border-[#10B981] bg-[#10B981]/10 shadow-[0_0_30px_rgba(16,185,129,0.3)]',
      className
    )}>
      {/* Animated background gradient */}
      <div className={cn(
        'absolute inset-0 opacity-0 transition-opacity duration-500',
        isInteractive && isEmpty && 'bg-gradient-to-br from-[#7C3AED]/20 to-transparent animate-pulse'
      )} />

      <div className="relative z-10 flex flex-col items-center justify-center p-8 min-h-[300px] gap-4">
        {/* Genre icon */}
        <div className={cn(
          'flex h-20 w-20 items-center justify-center rounded-full transition-all duration-300',
          isEmpty && 'bg-[#7C3AED]/20 border-2 border-[#7C3AED]/30',
          isPending && 'bg-[#F43F5E]/20 border-2 border-[#F43F5E]/30',
          isComplete && 'bg-[#10B981]/20 border-2 border-[#10B981]/30'
        )}>
          {isPending ? (
            <Loader2 className="h-10 w-10 text-[#F43F5E] animate-spin" />
          ) : isComplete ? (
            <CheckCircle2 className="h-10 w-10 text-[#10B981]" />
          ) : (
            <Mic2 className="h-10 w-10 text-[#7C3AED]" />
          )}
        </div>

        {/* Genre label */}
        <div className="text-center">
          <h3 className="text-2xl font-bold text-[#E2E8F0] font-['Poppins'] uppercase tracking-wider">
            {genre}
          </h3>
          <p className="text-sm text-[#E2E8F0]/60 mt-1">
            {isEmpty && 'Your beat for this round'}
            {isPending && 'Uploading...'}
            {isComplete && 'Submitted!'}
          </p>
        </div>

        {/* Upload button */}
        {isInteractive && isEmpty && (
          <Button
            onClick={onUpload}
            className="mt-4 gap-2 bg-[#7C3AED] hover:bg-[#7C3AED]/80"
          >
            <Upload className="h-4 w-4" />
            Upload Your Beat
          </Button>
        )}

        {/* Status indicator */}
        {isPending && (
          <div className="flex items-center gap-2 text-[#F43F5E]">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm font-medium">Uploading audio...</span>
          </div>
        )}
      </div>

      {/* Corner decorations */}
      <div className={cn(
        'absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 rounded-tl-lg transition-colors',
        isEmpty && 'border-[#7C3AED]/30',
        isPending && 'border-[#F43F5E]',
        isComplete && 'border-[#10B981]'
      )} />
      <div className={cn(
        'absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 rounded-tr-lg transition-colors',
        isEmpty && 'border-[#7C3AED]/30',
        isPending && 'border-[#F43F5E]',
        isComplete && 'border-[#10B981]'
      )} />
      <div className={cn(
        'absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 rounded-bl-lg transition-colors',
        isEmpty && 'border-[#7C3AED]/30',
        isPending && 'border-[#F43F5E]',
        isComplete && 'border-[#10B981]'
      )} />
      <div className={cn(
        'absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 rounded-br-lg transition-colors',
        isEmpty && 'border-[#7C3AED]/30',
        isPending && 'border-[#F43F5E]',
        isComplete && 'border-[#10B981]'
      )} />
    </div>
  );
}
