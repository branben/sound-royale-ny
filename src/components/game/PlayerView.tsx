import { memo, useState } from 'react';
import { BingoBoard } from '@/components/game/BingoBoard';
import { UploadDrawer } from '@/components/game/UploadDrawer';
import { ScoreDisplay } from '@/components/game/ScoreDisplay';
import { BingoNotification } from '@/components/game/BingoNotification';
import { WinnerAnnouncement } from '@/components/game/WinnerAnnouncement';
import { GameOverScreen } from '@/components/game/GameOverScreen';
import { TitleBadge } from '@/components/game/TitleBadge';
import { toast } from 'sonner';
import { Tile } from '@/types/game';
import { useGame } from '@/context/useGame';
import { gameApi } from '@/services/api';
import { usePlayerColors } from '@/hooks/usePlayerColors';
import { Wifi, WifiOff, Music } from 'lucide-react';

interface PlayerViewProps {
  roomId: string;
  playerName?: string;
}

export const PlayerView = memo(function PlayerView({ roomId, playerName }: PlayerViewProps) {
  const { gameState, setGameState } = useGame();
  const playerColors = usePlayerColors(gameState.players ?? {});
  const [selectedTile, setSelectedTile] = useState<{ tile: Tile } | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [showBingoNotification, setShowBingoNotification] = useState(false);
  const [isDoubleBingo, setIsDoubleBingo] = useState(false);

  const players = gameState.players ? Object.values(gameState.players) : [];
  const currentPlayer = playerName
    ? players.find(player => player.name === playerName)
    : players.find(player => player.name && !player.name.startsWith('Spectator '));

  const playerData = currentPlayer ? {
    ...currentPlayer,
    tiles: currentPlayer.board?.tiles || []
  } : null;

  const normalizeGenre = (value?: string) => {
    const normalized = value?.toLowerCase().replace(/[^a-z0-9]/g, '') ?? '';
    return normalized === 'rnb' ? 'rb' : normalized;
  };

  const currentRoundGenre = gameState.roundState?.currentTileGenre;
  const isCurrentRoundTile = (tile: Tile) =>
    !currentRoundGenre || normalizeGenre(tile.genre) === normalizeGenre(currentRoundGenre);

  const handleTileClick = (tileId: string) => {
    if (!playerData) return;
    
    const tile = playerData.tiles.find((t) => t.id === tileId);
    if (!tile || tile.status !== 'empty') {
      return;
    }

    if (!isCurrentRoundTile(tile)) {
      toast.info(`This round is for ${currentRoundGenre}. Pick the matching tile.`);
      return;
    }

    setSelectedTile({ tile });
    setIsDrawerOpen(true);
  };

  const handleUpload = async (audioUrl: string, audioFile: File) => {
    if (!selectedTile || !playerData) return;
    
    try {
      const updatedTiles = playerData.tiles.map(t => 
        t.id === selectedTile.tile.id 
          ? { ...t, status: 'pending' as const, audioUrl: audioUrl }
          : t
      );
      
      setGameState(prev => {
        const existingPlayer = prev.players[playerData.id];
        if (!existingPlayer) return prev;

        return {
          ...prev,
          players: {
            ...prev.players,
            [playerData.id]: {
              ...existingPlayer,
              board: {
                ...existingPlayer.board,
                tiles: updatedTiles,
              },
            },
          },
        };
      });
      
      await gameApi.submitTile(selectedTile.tile.id, audioFile, playerData.id);
      
      toast.success('Audio uploaded successfully!');
      setSelectedTile(null);
      setIsDrawerOpen(false);
    } catch (error) {
      toast.error('Failed to upload audio. Please try again.');
      console.error('Tile upload error:', error);
    }
  };

  const currentPlayerColorIndex = playerData ? playerColors.get(playerData.id) : undefined;

  const handleTimeUp = () => {
    toast.info('Time\'s up! Moving to next turn...');
  };

  const handleBingoNotificationComplete = () => {
    setShowBingoNotification(false);
  };


  if (!playerData) {
    return (
      <div className="text-center py-8">
        <p className="text-muted-foreground">Failed to load player data</p>
      </div>
    );
  }

  const ConnectionStatus = () => {
    const isConnected = playerData.isConnected;
    return (
      <div data-testid="connection-status" className={`flex items-center gap-1 text-xs ${isConnected ? 'text-green-500' : 'text-gray-500'}`}>
        <span className={`h-2 w-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></span>
        <span>{isConnected ? 'Online' : 'Offline'}</span>
      </div>
    );
  };

  const PLAYER_ACCENT = [
    'bg-player-1/15 text-player-1',
    'bg-player-2/15 text-player-2',
    'bg-player-3/15 text-player-3',
    'bg-player-4/15 text-player-4',
  ] as const;

  const playerAccentClasses = currentPlayerColorIndex !== undefined && currentPlayerColorIndex < PLAYER_ACCENT.length
    ? PLAYER_ACCENT[currentPlayerColorIndex]
    : 'bg-primary/15 text-primary';

  const playerTextAccent = currentPlayerColorIndex !== undefined
    ? `text-player-${currentPlayerColorIndex + 1}`
    : 'text-primary';

  return (
    <div className={`grid grid-cols-1 lg:grid-cols-[14rem_1fr] gap-6 ${!playerData.isConnected ? 'opacity-60' : ''}`}>
      {/* Player Info Column */}
      <div className="order-2 space-y-4 lg:order-1">
        <div className={`rounded-xl border border-border bg-card p-4 space-y-4 border-l-4 ${playerTextAccent.replace('text-', 'border-')}`}>
          <div className="flex items-center gap-2">
            <div className={`flex h-8 w-8 items-center justify-center rounded-full ${playerAccentClasses}`}>
              <Music className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xl font-bold text-foreground">{playerData.name}</p>
              <div className="flex items-center gap-2">
                <TitleBadge title={playerData.currentTitle} compact />
                <ConnectionStatus />
              </div>
            </div>
          </div>

          {gameState.status === 'playing' && gameState.roundState?.currentTileGenre && (
            <>
              <p className="text-base font-semibold text-muted-foreground">
                Your turn: Upload a beat for <span className={`${playerTextAccent} font-bold`}>{gameState.roundState.currentTileGenre}</span>
              </p>
              <div className="border-t border-border my-4" /> {/* Visual Separator */}
            </>
          )}

          <ScoreDisplay
            scoreInfo={playerData.scoreInfo || null}
            playerName={playerData.name}
            isCurrentPlayer={true}
            hasWon={gameState.status === 'finished' && gameState.winner === playerData.id}
            eloRating={playerData.eloRating}
            showPlayerName={false}
          />

        </div>
      </div>

      {/* Game Board Column */}
      <div className="order-1 lg:order-2">
          <BingoBoard
            playerId={playerData.id}
            playerName={playerData.name}
            isDiscordVerified={playerData.isDiscordVerified}
            discordUsername={playerData.discordUsername}
            boardData={{
              tiles: playerData.tiles || []
            }}
            onTileClick={handleTileClick}
            isInteractive={gameState.status === 'playing' && !currentPlayer?.isSpectator}
            isTileInteractive={(tileId) => {
              const tile = playerData.tiles.find(entry => entry.id === tileId);
              return !!tile && tile.status === 'empty' && isCurrentRoundTile(tile);
            }}
            playerColorIndex={currentPlayerColorIndex}
          />

        <UploadDrawer
          isOpen={isDrawerOpen}
          onClose={() => setIsDrawerOpen(false)}
          tile={selectedTile?.tile || null}
          onUpload={handleUpload}
        />
      </div>

      {/* Bingo Notification */}
      <BingoNotification
        isVisible={showBingoNotification}
        isDoubleBingo={isDoubleBingo}
        onComplete={handleBingoNotificationComplete}
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

      {/* Game Over Screen (shown only when finished without a winner) */}
      {gameState.status === 'finished' && !gameState.winner && (
        <GameOverScreen
          isVisible={true}
          onReturnToLobby={() => window.location.href = '/'}
          onPlayAgain={() => window.location.href = '/'}
          totalScore={playerData.scoreInfo?.score}
        />
      )}
    </div>
  );
});
