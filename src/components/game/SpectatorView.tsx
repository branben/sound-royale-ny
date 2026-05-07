import { useState, useMemo, createRef } from 'react';
import { useGame } from '@/context/useGame';
import { useUser } from '@/context/UserContext';
import { BingoBoard } from './BingoBoard';
import { VotingPanel } from './VotingPanel';
import { WinnerAnnouncement } from './WinnerAnnouncement';
import { GameOverScreen } from './GameOverScreen';
import { Player } from '@/types/game';
import { cn } from '@/lib/utils';
import { Crown, Zap, Users, Trophy, Clock, PlayCircle } from 'lucide-react';

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

  const getGamePhase = () => {
    switch (gameState.status) {
      case 'lobby':
        return { label: 'Waiting in Lobby', color: 'text-yellow-400', bg: 'bg-yellow-400/20' };
      case 'playing':
        return { label: 'Game in Progress', color: 'text-green-400', bg: 'bg-green-400/20' };
      case 'finished':
        return { label: 'Game Finished', color: 'text-purple-400', bg: 'bg-purple-400/20' };
      default:
        return { label: 'Unknown', color: 'text-gray-400', bg: 'bg-gray-400/20' };
    }
  };

  const gamePhase = getGamePhase();

  return (
    <div className="min-h-screen overflow-x-hidden bg-background md:bg-background">
      {/* Header */}
      <header className="hidden border-b border-border/30 bg-card/30 backdrop-blur-md md:block">
        <div className="container mx-auto flex max-w-full flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/20">
              <Crown className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-bold text-foreground">Sound Royale</h1>
              <p className="text-sm text-muted-foreground">Round {gameState.currentRound}</p>
            </div>
          </div>

          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center sm:justify-end">
            <div className={`flex min-w-0 items-center gap-2 rounded-full px-3 py-1.5 ${gamePhase.bg}`}>
              <Clock className={`h-4 w-4 ${gamePhase.color}`} />
              <span className={`truncate text-sm font-medium ${gamePhase.color}`}>{gamePhase.label}</span>
            </div>
            <div className="flex min-w-0 items-center gap-2 rounded-full bg-muted/30 px-3 py-1.5">
              <Users className="h-4 w-4 text-muted-foreground" />
              <span className="truncate text-sm text-muted-foreground">{producers.length} Producers</span>
            </div>
            <div className="flex min-w-0 items-center gap-2 rounded-full bg-primary/20 px-3 py-1.5">
              <Zap className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium text-primary">LIVE</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content - Split Screen */}
      <main className="container mx-auto max-w-full px-0 py-2 md:p-8">
        <div className="mb-6 hidden flex-col gap-3 sm:flex-row sm:items-center sm:justify-between md:flex">
          <div className="min-w-0">
            <h2 className="text-2xl font-bold text-foreground md:text-3xl">Battle Arena</h2>
            <p className="text-muted-foreground">Watch the producers compete in real-time</p>
          </div>
          <button data-testid="request-to-play" className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 sm:w-auto">
            <PlayCircle className="h-4 w-4" />
            Request to Play
          </button>
        </div>

        <div className="mb-6 hidden rounded-xl border border-border/30 bg-card/50 p-4 backdrop-blur-sm md:block">
          <div className="flex items-center gap-2 mb-3">
            <Trophy className="h-5 w-5 text-yellow-500" />
            <h3 className="font-semibold text-foreground">Leaderboard</h3>
          </div>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {leaderboard.map((entry, index) => (
              <button
                key={entry.player.id}
                onClick={() => setSelectedPlayerId(entry.player.id)}
                className={`flex w-full items-center gap-3 rounded-lg p-2 text-left transition-colors hover:bg-muted/50 ${
                  selectedPlayerId === entry.player.id ? 'bg-primary/10 ring-1 ring-primary' : ''
                }`}
              >
                <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                  index === 0 ? 'bg-yellow-500 text-black' :
                  index === 1 ? 'bg-gray-400 text-black' :
                  index === 2 ? 'bg-orange-600 text-white' :
                  'bg-muted text-muted-foreground'
                }`}>
                  {index + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{entry.player.name}</p>
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
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <span className="text-green-400">{entry.completeTiles}</span>
                  <span>/</span>
                  <span className="text-yellow-400">{entry.pendingTiles}</span>
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
              className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
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
          <div className="hidden md:absolute md:left-1/2 md:top-1/2 md:z-10 md:flex md:-translate-x-1/2 md:-translate-y-1/2 md:items-center md:justify-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-primary/50 bg-card/80 shadow-lg shadow-primary/20 backdrop-blur-md">
              <span className="text-xl font-bold text-primary">VS</span>
            </div>
          </div>

          <div className="grid min-w-0 gap-6 md:grid-cols-2 md:gap-8 lg:gap-12">
            {producers.map((player) => (
              <div ref={boardRefs[player.id]} key={player.id} className={cn('min-w-0', selectedPlayerId === player.id && 'rounded-lg ring-2 ring-primary')}>
                <BingoBoard
                  playerId={player.id}
                  playerName={player.name}
                  boardData={player.board}
                  isInteractive={false}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Mobile VS indicator */}
        <div className="my-4 flex items-center justify-center md:hidden">
          <div className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-primary/50 bg-card/80 shadow-lg shadow-primary/20 backdrop-blur-md">
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
