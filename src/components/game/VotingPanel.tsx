import { useState } from 'react';
import { Player } from '@/types/game';
import { gameApi } from '@/services/api';
import { toast } from 'sonner';
import { Vote, CheckCircle2, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { hover, transitions } from '@/lib/motion';
import { usePlayerColors } from '@/hooks/usePlayerColors';
import { useGame } from '@/context/useGame';

interface VotingPanelProps {
  roomId: string;
  playerSecret: string;
  currentPlayerId?: string;
  producers: Player[];
  currentGenre: string;
  votingOpen: boolean;
  votesRecorded: number;
  spectatorCount: number;
  isSpectator?: boolean;
  className?: string;
}

export function VotingPanel({
  roomId,
  playerSecret,
  currentPlayerId,
  producers,
  currentGenre,
  votingOpen,
  votesRecorded,
  spectatorCount,
  isSpectator = false,
  className,
}: VotingPanelProps) {
  const { gameState } = useGame();
  const playerColors = usePlayerColors(gameState.players);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [isVoting, setIsVoting] = useState(false);
  const [hasVoted, setHasVoted] = useState(false);

  const isRanked = spectatorCount >= 3;

  const playerCardColor = (playerId: string) => {
    const idx = playerColors.get(playerId) ?? 0;
    return {
      bg: [`bg-player-1/20`, `bg-player-2/20`, `bg-player-3/20`, `bg-player-4/20`][idx],
      text: [`text-player-1`, `text-player-2`, `text-player-3`, `text-player-4`][idx],
      borderHover: [
        `hover:border-player-1/50`,
        `hover:border-player-2/50`,
        `hover:border-player-3/50`,
        `hover:border-player-4/50`,
      ][idx],
      bgHover: [
        `hover:bg-player-1/5`,
        `hover:bg-player-2/5`,
        `hover:bg-player-3/5`,
        `hover:bg-player-4/5`,
      ][idx],
      borderSelected: [`border-player-1`, `border-player-2`, `border-player-3`, `border-player-4`][
        idx
      ],
      bgSelected: [`bg-player-1/10`, `bg-player-2/10`, `bg-player-3/10`, `bg-player-4/10`][idx],
    };
  };

  const handleVote = async (producerId: string) => {
    if (!votingOpen || hasVoted || isVoting) return;

    setSelectedPlayerId(producerId);
    setIsVoting(true);

    try {
      await gameApi.castVote(roomId, playerSecret, producerId);
      setHasVoted(true);
      toast.success('Vote submitted!');
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: string } }; message?: string };
      const message =
        err.response?.data?.error ||
        (error instanceof Error ? error.message : null) ||
        'Failed to submit vote';
      console.error('Vote error:', message);
      toast.error(message);
    } finally {
      setIsVoting(false);
      setSelectedPlayerId(null);
    }
  };

  if (!votingOpen) {
    return (
      <div
        data-testid="voting-panel"
        className={cn('rounded-xl border border-border bg-card p-4', className)}
      >
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
    <div
      data-testid="voting-panel"
      className={cn('rounded-xl border border-primary/30 bg-card p-4', className)}
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xl font-bold uppercase tracking-wider text-primary">
          Vote: {currentGenre}
        </h3>
        <div className="text-sm text-muted-foreground" data-testid="vote-count-display">
          {votesRecorded}/{spectatorCount} votes
        </div>
      </div>

      <p className="text-sm text-muted-foreground mb-4">
        Genre: <span className="text-primary font-medium">{currentGenre}</span>
      </p>

      {hasVoted ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={transitions.spring}
          className="flex items-center gap-2 text-green-500 justify-center py-4"
        >
          <CheckCircle2 className="h-6 w-6" />
          <span className="font-bold text-lg">Vote submitted!</span>
        </motion.div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {producers
            .filter((producer) => !(isSpectator && producer.id === currentPlayerId))
            .map((producer) => {
              const card = playerCardColor(producer.id);
              return (
                <motion.button
                  key={producer.id}
                  onClick={() => handleVote(producer.id)}
                  disabled={isVoting}
                  whileHover={{ scale: 1.04 }}
                  whileTap={{ scale: 0.95 }}
                  transition={transitions.spring}
                  className={cn(
                    'flex flex-col items-center gap-2 p-6 rounded-lg border-2 transition-colors',
                    card.borderHover,
                    card.bgHover,
                    'disabled:opacity-50 disabled:cursor-not-allowed',
                    selectedPlayerId === producer.id
                      ? card.borderSelected + ' ' + card.bgSelected + ' scale-[1.02]'
                      : 'border-border',
                  )}
                >
                  <div
                    className={cn(
                      'flex h-12 w-12 items-center justify-center rounded-full',
                      card.bg,
                    )}
                  >
                    <span className={cn('text-lg font-bold', card.text)}>
                      {producer.name.charAt(0)}
                    </span>
                  </div>
                  <div className="text-center">
                    <p className="font-medium text-foreground text-lg font-bold">{producer.name}</p>
                    {producer.eloRating && (
                      <p className="text-xs text-muted-foreground">ELO: {producer.eloRating}</p>
                    )}
                  </div>
                  {isVoting && selectedPlayerId === producer.id && (
                    <Loader2 className={cn('h-4 w-4 animate-spin', card.text)} />
                  )}
                </motion.button>
              );
            })}
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
