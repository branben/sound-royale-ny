import { useState, useMemo, useRef, createRef } from 'react';
import { Link } from 'react-router-dom';
import { useGame } from '@/context/useGame';
import { useUser } from '@/context/UserContext';
import { BingoBoard } from './BingoBoard';
import { UploadDrawer } from './UploadDrawer';
import { VotingPanel } from './VotingPanel';
import { WinnerAnnouncement } from './WinnerAnnouncement';
import { RoundIndicator } from './RoundIndicator';
import { GameOverScreen } from './GameOverScreen';
import { RoomLeaderboard } from './RoomLeaderboard';
import { Tile } from '@/types/game';
import { Crown, Zap, Users, ArrowUpCircle, Clock, PlayCircle, Trophy } from 'lucide-react';

interface SpectatorViewProps {
  embedded?: boolean;
}

export function SpectatorView({ embedded = false }: SpectatorViewProps) {
  const { gameState, setTileAudio, updateTileStatus } = useGame();
  const { userSession } = useUser();
  const [selectedTile, setSelectedTile] = useState<{ playerId: string; tile: Tile } | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);

  const players = Object.values(gameState.players);
  const producers = players.filter(p => !p.isSpectator);
  const spectators = players.filter(p => p.isSpectator);
  const isCurrentUserSpectator = spectators.some(p => p.id === userSession.playerId);

  const boardRefs = useMemo(() => {
    return producers.reduce((acc, player) => {
      acc[player.id] = createRef<HTMLDivElement>();
      return acc;
    }, {} as Record<string, React.RefObject<HTMLDivElement>>);
  }, [producers]);

  const roomCode = gameState.roomCode || gameState.gameId;

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

  const handleTileClick = (playerId: string, tileId: string) => {
    const player = gameState.players[playerId];
    const tile = player.board.tiles.find(t => t.id === tileId);
    if (tile && tile.status === 'empty') {
      setSelectedTile({ playerId, tile });
      setIsDrawerOpen(true);
    }
  };

  const handleUpload = (audioUrl: string) => {
    if (selectedTile) {
      updateTileStatus(selectedTile.playerId, selectedTile.tile.id, 'pending');
      // Simulate upload delay
      setTimeout(() => {
        setTileAudio(selectedTile.playerId, selectedTile.tile.id, audioUrl);
      }, 2000);
    }
  };

  return (
    <div className={embedded ? 'min-w-0' : 'min-h-screen bg-background'}>
      {/* Header */}
      {!embedded && (
      <header className="border-b border-border/30 bg-card/30 backdrop-blur-md">
        <div className="container mx-auto flex items-center justify-between px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/20">
              <Crown className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">Sound Royale</h1>
              <p className="text-sm text-muted-foreground">Round {gameState.currentRound}</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className={`flex items-center gap-2 rounded-full px-3 py-1.5 ${gamePhase.bg}`}>
              <Clock className={`h-4 w-4 ${gamePhase.color}`} />
              <span className={`text-sm font-medium ${gamePhase.color}`}>{gamePhase.label}</span>
            </div>
            <div className="flex items-center gap-2 rounded-full bg-muted/30 px-3 py-1.5">
              <Users className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">{players.length} Players</span>
            </div>
            <div className="flex items-center gap-2 rounded-full bg-primary/20 px-3 py-1.5">
              <Zap className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium text-primary">LIVE</span>
            </div>
          </div>
        </div>
      </header>
      )}

      {/* Main Content - Split Screen */}
      <main className={embedded ? 'min-w-0 space-y-6' : 'container mx-auto p-4 md:p-8'}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h2 className="text-2xl font-bold text-foreground md:text-3xl">Battle Arena</h2>
            <p className="text-muted-foreground">
              Round {gameState.currentRound} · Watch the producers compete in real-time
            </p>
          </div>
          <button data-testid="request-to-play" className="flex shrink-0 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90">
            <PlayCircle className="h-4 w-4" />
            Request to Play
          </button>
        </div>

        <div className="rounded-xl border border-border/30 bg-card/50 p-4 backdrop-blur-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-yellow-500" />
              <div>
                <h3 className="font-semibold text-foreground">Leaderboard</h3>
                <p className="text-sm text-muted-foreground">{producers.length} producers competing</p>
              </div>
            </div>
            <Link
              to={`/room/${roomCode}/leaderboard`}
              className="inline-flex items-center justify-center rounded-lg border border-primary/40 px-4 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/10"
            >
              View Full Leaderboard
            </Link>
          </div>
        </div>

        {/* Voting Panel - Only show for spectators */}
        {isCurrentUserSpectator && userSession.playerSecret && gameState.roundState && (
          <div className="mb-6">
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
          <div className="hidden 2xl:absolute 2xl:left-1/2 2xl:top-1/2 2xl:z-10 2xl:flex 2xl:-translate-x-1/2 2xl:-translate-y-1/2 2xl:items-center 2xl:justify-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-primary/50 bg-card/80 shadow-lg shadow-primary/20 backdrop-blur-md">
              <span className="text-xl font-bold text-primary">VS</span>
            </div>
          </div>

          <div className="grid min-w-0 gap-6 2xl:grid-cols-2 2xl:gap-8">
            {producers.map((player) => (
              <div ref={boardRefs[player.id]} key={player.id} className={selectedPlayerId === player.id ? 'ring-2 ring-primary rounded-lg' : ''}>
                <BingoBoard
                  playerId={player.id}
                  playerName={player.name}
                  boardData={player.board}
                  onTileClick={(tileId) => handleTileClick(player.id, tileId)}
                  isInteractive={true}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Mobile VS indicator */}
        <div className="my-4 flex items-center justify-center 2xl:hidden">
          <div className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-primary/50 bg-card/80 shadow-lg shadow-primary/20 backdrop-blur-md">
            <span className="text-lg font-bold text-primary">VS</span>
          </div>
        </div>
      </main>

      {/* Upload Drawer */}
      <UploadDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        tile={selectedTile?.tile || null}
        onUpload={handleUpload}
      />

      {/* Winner Announcement */}
      {gameState.status === 'finished' && gameState.winner && (
        <WinnerAnnouncement
          winnerName={players.find(p => p.id === gameState.winner)?.name || 'Unknown'}
          score={players.find(p => p.id === gameState.winner)?.scoreInfo?.score}
          eloDeltas={gameState.eloDeltas}
          isVisible={true}
        />
      )}

      {/* Round Indicator */}
      {gameState.status === 'playing' && (
        <RoundIndicator
          currentRound={gameState.currentRound || 1}
          isPreparing={false}
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
