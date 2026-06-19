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
import { Trophy, Eye, Vote } from 'lucide-react';
import { DiscordVerifiedIcon } from './DiscordVerifiedIcon';

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
      <div className="min-h-screen overflow-x-hidden bg-background md:bg-background">
        <span className="bg-primary/90 text-primary-foreground text-xs font-bold uppercase tracking-[0.2em] px-3 py-1 rounded-full inline-block mb-4 md:hidden">
          Spectator View
        </span>
        {/* Main Content - Split Screen */}
        <main className="container mx-auto max-w-full px-0 py-2 md:p-8">
          <div className="mb-4 flex items-center justify-between md:hidden">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
              <Eye className="h-3 w-3" />
              Spectator
            </span>
            {gameState.roundState?.votingOpen && (
              <span className="inline-flex items-center gap-1 rounded-full bg-green-500/10 px-3 py-1 text-xs font-medium text-green-400">
                <Vote className="h-3 w-3" />
                Vote Open
              </span>
            )}
          </div>

          <div className="mb-6 hidden rounded-lg border border-border/30 bg-card/40 p-4 md:block">
            <div className="flex items-center gap-2 mb-3">
              <Trophy className="h-5 w-5 text-yellow-500" />
              <h3 className="text-lg font-bold uppercase tracking-wider text-foreground">
                Leaderboard
              </h3>
            </div>
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {leaderboard.map((entry, index) => (
                <div key={entry.player.id}>
                  <button
                    onClick={() => setSelectedPlayerId(entry.player.id)}
                    className={`grid w-full grid-cols-[2rem_minmax(0,1fr)_4rem] items-center gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-muted/40 ${
                      selectedPlayerId === entry.player.id
                        ? 'bg-primary/10 ring-1 ring-primary/50'
                        : ''
                    }`}
                  >
                    <span
                      className={`flex h-7 w-7 items-center justify-center rounded-full text-2xl font-bold ${
                        index === 0
                          ? 'bg-[#FFD700] text-black'
                          : index === 1
                            ? 'bg-[#C0C0C0] text-black'
                            : index === 2
                              ? 'bg-[#CD7F32] text-white'
                              : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {index + 1}
                    </span>
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-center gap-2">
                        <p
                          className={`truncate text-sm font-medium ${PLAYER_BAR[playerColors.get(entry.player.id) ?? 0]} `}
                        >
                          {entry.player.name}
                        </p>
                        {entry.player.isDiscordVerified && (
                          <DiscordVerifiedIcon username={entry.player.discordUsername} />
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${PLAYER_BAR[playerColors.get(entry.player.id) ?? 0]}`}
                            style={{ width: `${entry.progress}%` }}
                          />
                        </div>
                        <span className="text-xs text-muted-foreground">{entry.progress}%</span>
                      </div>
                    </div>
                    <div className="text-right text-base font-bold text-muted-foreground">
                      <div>
                        <span className="text-green-400">{entry.completeTiles}</span>/9
                      </div>
                      <div>{entry.pendingTiles} pending</div>
                    </div>
                  </button>
                  {index < leaderboard.length - 1 ? (
                    <div className="my-2 h-px bg-border/30" />
                  ) : null}
                </div>
              ))}
            </div>
          </div>

          {/* Voting Panel - Only show for spectators */}
          {isCurrentUserSpectator && userSession.playerSecret && gameState.roundState && (
            <div className="mb-6 hidden md:block">
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

          <div className="mb-4 flex items-center gap-2 overflow-x-auto pb-2">
            <span className="text-sm text-muted-foreground shrink-0">Jump to:</span>
            {producers.map((player) => {
              const colorIndex = playerColors.get(player.id) ?? 0;
              return (
                <button
                  key={player.id}
                  onClick={() => {
                    setSelectedPlayerId(player.id);
                    const playerIndex = producers.findIndex((p) => p.id === player.id);
                    if (bingoBoardRefs?.current[playerIndex]) {
                      bingoBoardRefs.current[playerIndex]?.scrollIntoView({
                        behavior: 'smooth',
                        block: 'center',
                      });
                    }
                  }}
                  className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-medium transition-colors ${
                    selectedPlayerId === player.id
                      ? `${PLAYER_BAR[colorIndex]} text-white`
                      : 'bg-muted text-muted-foreground hover:bg-muted/80'
                  }`}
                >
                  {player.name}
                </button>
              );
            })}
          </div>

          <div className="relative">
            <div className="grid min-w-0 gap-4 md:grid-cols-2">
              {producers.map((player, index) => {
                const colorIndex = playerColors.get(player.id) ?? 0;
                return (
                  <div
                    key={player.id}
                    className={cn(
                      'min-w-0',
                      selectedPlayerId === player.id && 'rounded-lg ring-2',
                      selectedPlayerId === player.id && PLAYER_RING[colorIndex],
                    )}
                  >
                    <BingoBoard
                      ref={(el) => {
                        if (bingoBoardRefs && bingoBoardRefs.current)
                          bingoBoardRefs.current[index] = el;
                      }}
                      playerId={player.id}
                      playerName={player.name}
                      isDiscordVerified={player.isDiscordVerified}
                      discordUsername={player.discordUsername}
                      boardData={player.board}
                      isInteractive={false}
                      playerColorIndex={colorIndex}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          {/* Mobile VS indicator */}
          <div className="my-4 flex items-center justify-center md:hidden">
            <div className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-border bg-card">
              <span className="text-lg font-bold text-primary">VS</span>
            </div>
          </div>
        </main>

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
