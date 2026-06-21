import { useEffect, useMemo, useState } from 'react';
import { Clock, Disc3, Radio, Vote, Timer } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { GENRES } from '@/types/game';
import { cn } from '@/lib/utils';
import { transitions } from '@/lib/motion';

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

  return (
    <section
      data-testid="round-stage"
      className={cn(
        'rounded-lg border border-zinc-700 bg-zinc-900 p-2.5 md:p-3',
      )}
    >
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span className="relative overflow-hidden rounded-full border border-zinc-700 bg-zinc-800 px-2.5 py-0.5 font-medium">
              <AnimatePresence mode="wait">
                <motion.span
                  key={roundNumber}
                  initial={{ y: 10, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: -10, opacity: 0 }}
                  transition={transitions.spring}
                  className="block"
                >
                  Round {roundNumber}
                </motion.span>
              </AnimatePresence>
            </span>
            <span
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold transition-all',
                    votingOpen
                      ? 'bg-green-500/10 border border-green-500/30 text-green-400'
                      : 'bg-zinc-800 border border-zinc-700 text-zinc-400',
                  )}
            >
              {votingOpen ? (
                <AnimatePresence mode="wait">
                  <motion.span
                    key="voting-open"
                    initial={{ x: 20, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    exit={{ x: -20, opacity: 0 }}
                    transition={transitions.spring}
                    className="inline-flex items-center gap-1"
                  >
                    <Vote className="h-3.5 w-3.5" />
                    Voting Open
                  </motion.span>
                </AnimatePresence>
              ) : (
                <>
                  <Timer className="h-3.5 w-3.5" />
                  {spectatorCount >= 3 ? 'Ranked voting' : 'Casual mode'}
                </>
              )}
            </span>
            <AnimatePresence>
              {votingOpen && votesRecorded > 0 && (
                <motion.span
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.8, opacity: 0 }}
                  transition={transitions.springBouncy}
                  className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-primary"
                >
                  <Vote className="h-3.5 w-3.5" />
                  {votesRecorded} votes
                </motion.span>
              )}
            </AnimatePresence>
          </div>

          <div className="flex min-h-20 items-center gap-4">
            <div
              className={cn(
                'flex h-16 w-16 shrink-0 items-center justify-center rounded-full border border-border bg-card',
                isRouletting && 'animate-spin',
              )}
            >
              <Disc3 className="h-6 w-6 text-zinc-500" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium uppercase text-muted-foreground">Active Genre</p>
              <AnimatePresence mode="wait">
                <motion.h2
                  key={displayGenre}
                  initial={{ y: 20, opacity: 0, scale: 0.9 }}
                  animate={{ y: 0, opacity: 1, scale: 1 }}
                  exit={{ y: -20, opacity: 0 }}
                  transition={transitions.springBouncy}
                    className={cn(
                      'break-words text-2xl font-bold leading-tight text-zinc-100 md:text-3xl',
                    )}
                >
                  {displayGenre}
                </motion.h2>
              </AnimatePresence>
            </div>
          </div>
        </div>

          <div className="grid gap-2 sm:grid-cols-2 lg:w-48 lg:grid-cols-1">
            <div className="rounded-lg border border-zinc-700 bg-zinc-800 p-2.5">
              <div className="mb-0.5 flex items-center gap-1.5 text-xs text-zinc-500">
                <Clock className="h-3 w-3" />
                Time
              </div>
              <div className="font-mono text-xl font-bold text-zinc-100">
                {formattedTime ?? '--:--'}
              </div>
            </div>
            <div
              className={cn(
                'rounded-lg border p-2.5',
                votingOpen ? 'border-green-500/30 bg-green-500/5' : 'border-zinc-700 bg-zinc-800',
              )}
            >
              <div className="mb-0.5 flex items-center gap-1.5 text-xs text-zinc-500">
                <Vote className="h-3 w-3" />
                {votingOpen ? 'Vote Status' : 'Round Mode'}
              </div>
              <div className="text-xs font-medium text-zinc-300">
              {votingOpen ? (
                <AnimatePresence mode="wait">
                  <motion.span
                    key={votesRecorded}
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.8, opacity: 0 }}
                    transition={transitions.springBouncy}
                    className="text-primary font-semibold"
                  >
                    {votesRecorded} votes
                  </motion.span>
                </AnimatePresence>
              ) : spectatorCount >= 3 ? (
                `${spectatorCount} spectators voting`
              ) : (
                `${spectatorCount}/3 for voting`
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
