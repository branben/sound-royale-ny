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
  const [rouletteIndex, setRouletteIndex] = useState(0);
  const [isRouletting, setIsRouletting] = useState(false);
  const [fallbackTimeRemaining, setFallbackTimeRemaining] = useState<number | null>(null);
  const [votingJustOpened, setVotingJustOpened] = useState(false);

  // Flash animation when voting opens
  useEffect(() => {
    if (votingOpen && !votingJustOpened) {
      setVotingJustOpened(true);
      const timeoutId = setTimeout(() => setVotingJustOpened(false), 2000);
      return () => clearTimeout(timeoutId);
    }
  }, [votingOpen, votingJustOpened]);

  useEffect(() => {
    if (!genre) return;

    setIsRouletting(true);
    setRouletteIndex(0);

    const intervalId = window.setInterval(() => {
      setRouletteIndex(prev => (prev + 1) % GENRES.length);
    }, 90);

    const timeoutId = window.setTimeout(() => {
      window.clearInterval(intervalId);
      setIsRouletting(false);
    }, 1200);

    return () => {
      window.clearInterval(intervalId);
      window.clearTimeout(timeoutId);
    };
  }, [genre, roundNumber]);

  useEffect(() => {
    if (!timerEndsAt || timeRemaining !== null && timeRemaining !== undefined) {
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

  const displayGenre = isRouletting ? GENRES[rouletteIndex] : genre || 'Waiting';
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
        "rounded-xl border border-border bg-card p-5 md:p-6",
        votingJustOpened && "ring-2 ring-primary"
      )}
    >
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span className="relative overflow-hidden rounded-full border border-muted bg-muted px-3 py-1 font-medium">
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
            <span className={cn(
              "inline-flex items-center gap-1 rounded-full px-3 py-1 font-semibold transition-all",
              votingOpen
                ? "bg-primary/10 border border-primary/40 text-primary"
                : "bg-muted border border-border text-muted-foreground"
            )}>
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
            <div className={cn(
              "flex h-16 w-16 shrink-0 items-center justify-center rounded-full border border-border bg-card",
              isRouletting && "animate-spin-slow"
            )}>
              <Disc3 className="h-8 w-8 text-muted-foreground" />
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
                    "break-words text-4xl font-bold leading-tight text-foreground md:text-5xl",
                    isRouletting && "text-primary"
                  )}
                >
                  {displayGenre}
                </motion.h2>
              </AnimatePresence>
            </div>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:w-80 lg:grid-cols-1">
          <div className="rounded-lg border border-muted/70 bg-muted/70 p-4">
            <div className="mb-1 flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="h-4 w-4 text-primary" />
              Time Remaining
            </div>
            <div className="font-mono text-3xl font-bold text-foreground">
              {formattedTime ?? '--:--'}
            </div>
          </div>
          <div className={cn(
            "rounded-lg border p-4 transition-all",
            votingOpen ? "border-primary/40 bg-primary/5" : "border-border bg-muted"
          )}>
            <div className="mb-1 flex items-center gap-2 text-sm text-muted-foreground">
              <Vote className={cn("h-4 w-4", votingOpen ? "text-primary" : "text-primary")} />
              {votingOpen ? 'Vote Status' : 'Round Mode'}
            </div>
            <div className="text-sm font-medium text-foreground">
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
                    {votesRecorded} votes recorded
                  </motion.span>
                </AnimatePresence>
              ) : (
                spectatorCount >= 3 ? `${spectatorCount} spectators can vote` : `${spectatorCount}/3 spectators for voting`
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
