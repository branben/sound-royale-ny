import { useEffect, useMemo, useState } from 'react';
import { Clock, Disc3, Radio, Vote, Timer } from 'lucide-react';
import { GENRES } from '@/types/game';
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
        "rounded-xl border border-[#7C3AED]/30 bg-[#111126]/90 p-5 shadow-[0_0_40px_rgba(124,58,237,0.18)] backdrop-blur-xl md:p-6",
        votingJustOpened && "animate-pulse ring-2 ring-[#F43F5E]"
      )}
    >
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2 text-sm text-[#A5B4FC]">
            <span className="rounded-full border border-[#7C3AED]/30 bg-[#7C3AED]/15 px-3 py-1 font-medium">
              Round {roundNumber}
            </span>
            <span className={cn(
              "inline-flex items-center gap-1 rounded-full px-3 py-1 font-semibold transition-all",
              votingOpen
                ? "bg-[#F43F5E]/20 border border-[#F43F5E]/50 text-[#F43F5E]"
                : "bg-[#0F172A]/70 border border-[#7C3AED]/30 text-[#A78BFA]"
            )}>
              {votingOpen ? (
                <>
                  <Vote className="h-3.5 w-3.5" />
                  Voting Open
                </>
              ) : (
                <>
                  <Timer className="h-3.5 w-3.5" />
                  {spectatorCount >= 3 ? 'Ranked voting' : 'Casual mode'}
                </>
              )}
            </span>
            {votingOpen && votesRecorded > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-[#7C3AED]/20 px-3 py-1 text-[#A78BFA]">
                <Vote className="h-3.5 w-3.5" />
                {votesRecorded} votes
              </span>
            )}
          </div>

          <div className="flex min-h-20 items-center gap-4">
            <div className={cn(
              "flex h-16 w-16 shrink-0 items-center justify-center rounded-full border border-[#A855F7]/50 bg-[#7C3AED]/20",
              isRouletting && "animate-spin-slow"
            )}>
              <Disc3 className="h-8 w-8 text-[#C084FC]" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium uppercase text-[#94A3B8]">Active Genre</p>
              <h2
                className={cn(
                  "break-words text-4xl font-bold leading-tight text-white md:text-5xl",
                  isRouletting && "text-[#C084FC]"
                )}
              >
                {displayGenre}
              </h2>
            </div>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:w-80 lg:grid-cols-1">
          <div className="rounded-lg border border-[#334155]/70 bg-[#0F172A]/70 p-4">
            <div className="mb-1 flex items-center gap-2 text-sm text-[#94A3B8]">
              <Clock className="h-4 w-4 text-[#A855F7]" />
              Time Remaining
            </div>
            <div className="font-mono text-3xl font-bold text-white">
              {formattedTime ?? '--:--'}
            </div>
          </div>
          <div className={cn(
            "rounded-lg border p-4 transition-all",
            votingOpen ? "border-[#F43F5E]/50 bg-[#F43F5E]/10" : "border-[#334155]/70 bg-[#0F172A]/70"
          )}>
            <div className="mb-1 flex items-center gap-2 text-sm text-[#94A3B8]">
              <Vote className={cn("h-4 w-4", votingOpen ? "text-[#F43F5E]" : "text-[#A855F7]")} />
              {votingOpen ? 'Vote Status' : 'Round Mode'}
            </div>
            <div className="text-sm font-medium text-white">
              {votingOpen ? (
                <span className="text-[#F43F5E] font-semibold">{votesRecorded} votes recorded</span>
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
