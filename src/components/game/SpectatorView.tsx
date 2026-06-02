import { useState, useMemo, createRef } from 'react';
import { useGame } from '@/context/useGame';
import { useUser } from '@/context/UserContext';
import { BingoBoard } from './BingoBoard';
import { VotingPanel } from './VotingPanel';
import { WinnerAnnouncement } from './WinnerAnnouncement';
import { GameOverScreen } from './GameOverScreen';
import { Player } from '@/types/game';
import { cn } from '@/lib/utils';
import { Trophy, Eye, Vote } from 'lucide-react';
import { DiscordVerifiedIcon } from './DiscordVerifiedIcon';

export function SpectatorView() {
  const { gameState } = useGame();
  const { userSession } = useUser();
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);

  const players = Object.values(gameState.players);
  const isSpectatorPlayer = (player: Player) =>
    player.isSpectator || player.name?.startsWith('Spectator ');
  const producers = players.filter(player => !isSpectatorPlayer(player));
  const spectators = players.filter(isSpectatorPlayer);
  const isCurrentUserSpectator = spectators.some(p => p.id === userSession.playerId);

  const boardRefs = useMemo(() => {
    return producers.reduce((acc, player) => {
      acc[player.id] = createRef<HTMLDivElement>();
      return acc;
    }, {} as Record<string, React.RefObject<HTMLDivElement>>);
  }, [producers]);

  const leaderboard = useMemo(() => {
    return Object.values(gameState.players).filter(player => !isSpectatorPlayer(player)).map(player => {
      const totalTiles = player.board.tiles.length;
      const completeTiles = player.board.tiles.filter(t => t.status === 'complete').length;
      const pendingTiles = player.board.tiles.filter(t => t.status === 'pending').length;
      const progress = totalTiles > 0 ? Math.round((completeTiles / totalTiles) * 100) : 0;
      return {
        player,
        completeTiles,
        pendingTiles,
        progress
      };
    }).sort((a, b) => b.progress - a.progress);
  }, [gameState.players]);

  return (
    <div className="min-h-screen overflow-x-hidden bg-background md:bg-background">
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
            <h3 className="font-semibold text-foreground">Leaderboard</h3>
          </div>
          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {leaderboard.map((entry, index) => (
              <button
                key={entry.player.id}
                onClick={() => setSelectedPlayerId(entry.player.id)}
                className={`grid w-full grid-cols-[2rem_minmax(0,1fr)_4rem] items-center gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-muted/40 ${
                  selectedPlayerId === entry.player.id ? 'bg-primary/10 ring-1 ring-primary/50' : ''
                }`}
              >
                <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                  index === 0 ? 'bg-yellow-500 text-black' :
                  index === 1 ? 'bg-gray-400 text-black' :
                  index === 2 ? 'bg-orange-600 text-white' :
                  'bg-muted text-muted-foreground'
                }`}>
                  {index + 1}
                </span>
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-2">
                    <p className="truncate text-sm font-medium text-foreground">{entry.player.name}</p>
                    {entry.player.isDiscordVerified && (
                      <DiscordVerifiedIcon username={entry.player.discordUsername} />
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                      <div 
                        className="h-full bg-primary rounded-full transition-all"
                        style={{ width: `${entry.progress}%` }}
                      />
                    </div>
                    <span className="text-xs text-muted-foreground">{entry.progress}%</span>
                  </div>
                </div>
                <div className="text-right text-xs text-muted-foreground">
                  <div><span className="text-green-400">{entry.completeTiles}</span>/9</div>
                  <div>{entry.pendingTiles} pending</div>
                </div>
              </button>
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
          {producers.map(player => (
            <button
              key={player.id}
              onClick={() => {
                setSelectedPlayerId(player.id);
                boardRefs[player.id]?.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }}
              className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-medium transition-colors ${
                selectedPlayerId === player.id 
                  ? 'bg-primary text-primary-foreground' 
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              {player.name}
            </button>
          ))}
        </div>

        <div className="relative">
          <div className="grid min-w-0 gap-4 md:grid-cols-2">
            {producers.map((player) => (
              <div ref={boardRefs[player.id]} key={player.id} className={cn('min-w-0', selectedPlayerId === player.id && 'rounded-lg ring-2 ring-primary')}>
                <BingoBoard
                  playerId={player.id}
                  playerName={player.name}
                  isDiscordVerified={player.isDiscordVerified}
                  discordUsername={player.discordUsername}
                  boardData={player.board}
                  isInteractive={false}
                />
              </div>
            ))}
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
          winnerName={players.find(p => p.id === gameState.winner)?.name || 'Unknown'}
          score={players.find(p => p.id === gameState.winner)?.scoreInfo?.score}
          eloDeltas={gameState.eloDeltas}
          isVisible={true}
        />
      )}

      {/* Game Over Screen (shown only when finished without a winner) */}
      {gameState.status === 'finished' && !gameState.winner && (
        <GameOverScreen
          isVisible={true}
          onReturnToLobby={() => window.location.href = '/'}
          onPlayAgain={() => window.location.href = '/'}
          totalScore={players[0]?.scoreInfo?.score}
        />
      )}
    </div>
  );
}
