import { useState } from 'react';
import { Player } from '@/types/game';
import { gameApi } from '@/services/api';
import { toast } from 'sonner';
import { Vote, CheckCircle2, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface VotingPanelProps {
  roomId: string;
  playerSecret: string;
  producers: Player[];
  currentGenre: string;
  votingOpen: boolean;
  votesRecorded: number;
  spectatorCount: number;
  className?: string;
}

export function VotingPanel({
  roomId,
  playerSecret,
  producers,
  currentGenre,
  votingOpen,
  votesRecorded,
  spectatorCount,
  className,
}: VotingPanelProps) {
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [isVoting, setIsVoting] = useState(false);
  const [hasVoted, setHasVoted] = useState(false);

  const isRanked = spectatorCount >= 3;

  const handleVote = async (producerId: string) => {
    if (!votingOpen || hasVoted || isVoting) return;

    setSelectedPlayerId(producerId);
    setIsVoting(true);

    try {
      await gameApi.castVote(roomId, playerSecret, producerId);
      setHasVoted(true);
      toast.success('Vote submitted!');
    } catch (error: unknown) {
      const message = error instanceof Error 
        ? error.message 
        : typeof error === 'object' && error !== null && 'message' in error
          ? String((error as { message: unknown }).message)
          : 'Unknown error';
      console.error('Vote error:', message);
      toast.error('Failed to submit vote. Please try again.');
    } finally {
      setIsVoting(false);
      setSelectedPlayerId(null);
    }
  };

  if (!votingOpen) {
    return (
      <div data-testid="voting-panel" className={cn('rounded-xl border border-border/30 bg-card/50 p-4 backdrop-blur-sm', className)}>
        <div className="flex items-center gap-2 mb-3">
          <Vote className="h-5 w-5 text-muted-foreground" />
          <h3 className="font-semibold text-foreground">Voting</h3>
        </div>
        <p className="text-sm text-muted-foreground">
          {!isRanked
            ? `Waiting for more spectators to join (${spectatorCount}/3 for ranked mode)`
            : 'Waiting for producers to finish their beats...'}
        </p>
      </div>
    );
  }

  return (
    <div data-testid="voting-panel" className={cn('rounded-xl border border-primary/30 bg-card/50 p-4 backdrop-blur-sm', className)}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Vote className="h-5 w-5 text-primary" />
          <h3 className="font-semibold text-foreground">Vote for the Best Beat</h3>
        </div>
        <div className="text-sm text-muted-foreground">
          {votesRecorded}/{spectatorCount} votes
        </div>
      </div>

      <p className="text-sm text-muted-foreground mb-4">
        Genre: <span className="text-primary font-medium">{currentGenre}</span>
      </p>

      {hasVoted ? (
        <div className="flex items-center gap-2 text-green-500 justify-center py-4">
          <CheckCircle2 className="h-5 w-5" />
          <span className="font-medium">Vote submitted!</span>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {producers.map((producer) => (
            <button
              key={producer.id}
              onClick={() => handleVote(producer.id)}
              disabled={isVoting}
              className={cn(
                'flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all',
                'hover:border-primary/50 hover:bg-primary/5',
                'disabled:opacity-50 disabled:cursor-not-allowed',
                selectedPlayerId === producer.id
                  ? 'border-primary bg-primary/10'
                  : 'border-border'
              )}
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/20">
                <span className="text-lg font-bold text-primary">
                  {producer.name.charAt(0)}
                </span>
              </div>
              <div className="text-center">
                <p className="font-medium text-foreground">{producer.name}</p>
                {producer.eloRating && (
                  <p className="text-xs text-muted-foreground">
                    ELO: {producer.eloRating}
                  </p>
                )}
              </div>
              {isVoting && selectedPlayerId === producer.id && (
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
              )}
            </button>
          ))}
        </div>
      )}

      {!isRanked && (
        <p className="text-xs text-muted-foreground mt-3 text-center">
          Casual mode - votes are for fun only
        </p>
      )}
    </div>
  );
}
