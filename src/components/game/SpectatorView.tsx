import { useState, useMemo, memo, forwardRef } from 'react';
import { useGame } from '@/context/useGame';
import { useUser } from '@/context/UserContext';
import { BingoBoard } from './BingoBoard';
import { VotingPanel } from './VotingPanel';
import { WinnerAnnouncement } from './WinnerAnnouncement';
import { GameOverScreen } from './GameOverScreen';
import { Player } from '@/types/game';
import { cn } from '@/lib/utils';
import { usePlayerColors } from '@/hooks/usePlayerColors';
import { Trophy, Eye, Vote, Users } from 'lucide-react';
import { DiscordVerifiedIcon } from './DiscordVerifiedIcon';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';

interface SpectatorViewProps {
  bingoBoardRefs?: React.MutableRefObject<(HTMLDivElement | null)[]>;
}

const PLAYER_BAR = ['bg-player-1', 'bg-player-2', 'bg-player-3', 'bg-player-4'] as const;

const PLAYER_RING = [
  'ring-player-1/70',
  'ring-player-2/70',
  'ring-player-3/70',
  'ring-player-4/70',
] as const;

export const SpectatorView = memo(
  forwardRef(function SpectatorView(
    { bingoBoardRefs }: SpectatorViewProps,
    ref: React.ForwardedRef<HTMLDivElement>,
  ) {
    const { gameState } = useGame();
    const { userSession } = useUser();
    const playerColors = usePlayerColors(gameState.players);
    const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);

    const players = Object.values(gameState.players);
    const isSpectatorPlayer = (player: Player) =>
      player.isSpectator || player.name?.startsWith('Spectator ');
    const producers = players.filter((player) => !isSpectatorPlayer(player));
    const spectators = players.filter(isSpectatorPlayer);
    const isCurrentUserSpectator = spectators.some((p) => p.id === userSession.playerId);

    const leaderboard = useMemo(() => {
      return Object.values(gameState.players)
        .filter((player) => !isSpectatorPlayer(player))
        .map((player) => {
          const totalTiles = player.board.tiles.length;
          const completeTiles = player.board.tiles.filter((t) => t.status === 'complete').length;
          const pendingTiles = player.board.tiles.filter((t) => t.status === 'pending').length;
          const progress = totalTiles > 0 ? Math.round((completeTiles / totalTiles) * 100) : 0;
          return {
            player,
            completeTiles,
            pendingTiles,
            progress,
          };
        })
        .sort((a, b) => b.progress - a.progress);
    }, [gameState.players]);

    return (
      <div ref={ref} className="flex flex-col h-full">
        {/* Status bar */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
              <Eye className="h-3 w-3" />
              Spectating
            </span>
            {gameState.roundState?.votingOpen && (
              <span className="inline-flex items-center gap-1 rounded-full bg-green-500/15 px-2 py-0.5 text-xs font-medium text-green-400">
                <Vote className="h-3 w-3" />
                Vote open
              </span>
            )}
          </div>
          <span className="text-xs text-zinc-500 tabular-nums">
            {producers.length} player{producers.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Player boards — accordion */}
        {producers.length === 0 ? (
          <div className="flex flex-col items-center py-8 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-dashed border-zinc-600 mb-3">
              <Users className="h-6 w-6 text-zinc-600" />
            </div>
            <p className="text-sm text-zinc-400">No players yet</p>
            <p className="text-xs text-zinc-500">Waiting for producers to join</p>
          </div>
        ) : (
          <Accordion
            type="single"
            collapsible
            defaultValue={producers[0]?.id}
            className="flex flex-col gap-2"
          >
            {producers.map((player) => {
              const colorIndex = playerColors.get(player.id) ?? 0;
              const entry = leaderboard.find((e) => e.player.id === player.id);
              return (
                <AccordionItem key={player.id} value={player.id} className="border-none">
                  <AccordionTrigger className="rounded-lg bg-zinc-800 px-4 py-3 hover:bg-zinc-700 hover:translate-x-0.5 data-[state=open]:bg-zinc-700 data-[state=open]:rounded-b-none transition-all duration-150">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div
                        className={cn(
                          'flex h-9 w-9 items-center justify-center rounded-full',
                          `bg-player-${colorIndex + 1}/20`,
                          `border border-player-${colorIndex + 1}/40`,
                        )}
                      >
                        <span className={`text-sm font-bold text-player-${colorIndex + 1}`}>
                          {player.name.charAt(0)}
                        </span>
                      </div>
                      <div className="min-w-0 flex-1 text-left">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-zinc-100 truncate">
                            {player.name}
                          </p>
                          {player.isDiscordVerified && (
                            <DiscordVerifiedIcon username={player.discordUsername} />
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <div className="flex-1 h-1 rounded-full bg-zinc-700 overflow-hidden max-w-[5rem]">
                            <div
                              className={`h-full rounded-full bg-player-${colorIndex + 1} transition-all duration-300`}
                              style={{ width: `${entry?.progress ?? 0}%` }}
                            />
                          </div>
                          <span className="text-xs text-zinc-500 tabular-nums">
                            {entry?.completeTiles ?? 0}/9
                          </span>
                        </div>
                      </div>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="rounded-b-lg bg-zinc-900 px-2 pb-3 pt-1">
                    <BingoBoard
                      ref={(el) => {
                        if (bingoBoardRefs && bingoBoardRefs.current) {
                          const idx = producers.findIndex((p) => p.id === player.id);
                          bingoBoardRefs.current[idx] = el;
                        }
                      }}
                      playerId={player.id}
                      playerName={player.name}
                      isDiscordVerified={player.isDiscordVerified}
                      discordUsername={player.discordUsername}
                      boardData={player.board}
                      isInteractive={false}
                      playerColorIndex={colorIndex}
                    />
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        )}

        {/* Voting panel — below boards */}
        {isCurrentUserSpectator && userSession.playerSecret && gameState.roundState && (
          <div className="mt-3">
            <VotingPanel
              roomId={gameState.roomCode || gameState.gameId}
              playerSecret={userSession.playerSecret}
              producers={producers}
              currentGenre={gameState.roundState.currentTileGenre || 'Unknown'}
              votingOpen={gameState.roundState.votingOpen || false}
              votesRecorded={gameState.roundState.votesRecorded || 0}
              spectatorCount={gameState.spectatorCount || spectators.length}
            />
          </div>
        )}

        {/* Winner Announcement */}
        {gameState.status === 'finished' && gameState.winner && (
          <WinnerAnnouncement
            winnerName={players.find((p) => p.id === gameState.winner)?.name || 'Unknown'}
            score={players.find((p) => p.id === gameState.winner)?.scoreInfo?.score}
            eloDeltas={gameState.eloDeltas}
            isVisible={true}
          />
        )}

        {/* Game Over Screen (shown only when finished without a winner) */}
        {gameState.status === 'finished' && !gameState.winner && (
          <GameOverScreen
            isVisible={true}
            onReturnToLobby={() => (window.location.href = '/')}
            onPlayAgain={() => (window.location.href = '/')}
            totalScore={players[0]?.scoreInfo?.score}
          />
        )}
      </div>
    );
  }),
);
