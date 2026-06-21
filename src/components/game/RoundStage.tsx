import { useEffect, useMemo, useState } from 'react';
import { Vote } from 'lucide-react';
import { cn } from '@/lib/utils';

interface RoundStageProps {
  roundNumber: number;
  genre?: string;
  timeRemaining?: number | null;
  timerEndsAt?: string | null;
  votingOpen?: boolean;
  spectatorCount: number;
  votesRecorded?: number;
}

export function RoundStage({
  roundNumber,
  genre,
  timeRemaining,
  timerEndsAt,
  votingOpen = false,
  spectatorCount,
  votesRecorded = 0,
}: RoundStageProps) {
  const [fallbackTimeRemaining, setFallbackTimeRemaining] = useState<number | null>(null);

  useEffect(() => {
    if (!timerEndsAt || (timeRemaining !== null && timeRemaining !== undefined)) {
      setFallbackTimeRemaining(null);
      return;
    }

    const updateFallback = () => {
      const secondsLeft = Math.ceil((new Date(timerEndsAt).getTime() - Date.now()) / 1000);
      setFallbackTimeRemaining(Math.max(0, secondsLeft));
    };

    updateFallback();
    const intervalId = window.setInterval(updateFallback, 1000);
    return () => window.clearInterval(intervalId);
  }, [timerEndsAt, timeRemaining]);

  const displayGenre = genre || 'Waiting';
  const formattedTime = useMemo(() => {
    const rawTime = timeRemaining ?? fallbackTimeRemaining;
    if (rawTime === null || rawTime === undefined) return null;
    const safeTime = Math.max(0, rawTime);
    const mins = Math.floor(safeTime / 60);
    const secs = safeTime % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }, [fallbackTimeRemaining, timeRemaining]);

  const isRouletting = !genre;

  return (
    <section data-testid="round-stage" className="border-b border-zinc-700/50 pb-3 mb-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-xs text-zinc-500 uppercase tracking-wider">
            Round {roundNumber}
          </span>
          <span className="text-lg font-semibold text-zinc-100">{displayGenre}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-mono text-lg tabular-nums text-zinc-100">
            {formattedTime ?? '--:--'}
          </span>
          {votingOpen && (
            <span className="inline-flex items-center gap-1 rounded-full bg-green-500/15 px-2 py-0.5 text-xs font-medium text-green-400">
              Vote open
            </span>
          )}
          {!votingOpen && spectatorCount >= 3 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-zinc-800 px-2 py-0.5 text-xs font-medium text-zinc-400">
              Ranked voting
            </span>
          )}
          {!votingOpen && spectatorCount < 3 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-zinc-800 px-2 py-0.5 text-xs font-medium text-zinc-400">
              Casual mode
            </span>
          )}
        </div>
      </div>
      {votingOpen && votesRecorded > 0 && (
        <div className="mt-2 flex items-center gap-1.5">
          <Vote className="h-3.5 w-3.5 text-green-400" />
          <span className="text-xs text-green-400 font-medium tabular-nums">
            {votesRecorded} vote{votesRecorded !== 1 ? 's' : ''}
          </span>
        </div>
      )}
    </section>
  );
}
