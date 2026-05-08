import { useState, useEffect } from 'react';
import { BingoBoard } from '@/components/game/BingoBoard';
import { UploadDrawer } from '@/components/game/UploadDrawer';
import { TurnIndicator } from '@/components/game/TurnIndicator';
import { ScoreDisplay } from '@/components/game/ScoreDisplay';
import { BingoNotification } from '@/components/game/BingoNotification';
import { WinnerAnnouncement } from '@/components/game/WinnerAnnouncement';
import { GameOverScreen } from '@/components/game/GameOverScreen';
import { TitleBadge } from '@/components/game/TitleBadge';
import { toast } from 'sonner';
import { Tile } from '@/types/game';
import { useGame } from '@/context/useGame';
import { gameApi } from '@/services/api';
import { Wifi, WifiOff, Music, Users } from 'lucide-react';

interface PlayerViewProps {
  roomId: string;
  playerName?: string;
}

export function PlayerView({ roomId, playerName }: PlayerViewProps) {
  const { gameState, setGameState } = useGame();
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
          ? { ...t, status: 'pending', audioUrl: audioUrl }
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
        {isConnected ? (
          <Wifi className="h-3 w-3" />
        ) : (
          <WifiOff className="h-3 w-3" />
        )}
        <span>{isConnected ? 'Online' : 'Offline'}</span>
      </div>
    );
  };

  return (
    <div className={`grid grid-cols-1 lg:grid-cols-3 gap-6 ${!playerData.isConnected ? 'opacity-60' : ''}`}>
      {/* Player Info Column */}
      <div className="order-2 space-y-4 lg:order-1">
        {/* Role Badge */}
        <div className="rounded-lg border border-[#7C3AED]/30 bg-[#111126]/90 backdrop-blur-xl p-4">
          <div className="flex items-center gap-3 mb-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#7C3AED]/20">
              <Music className="h-5 w-5 text-[#7C3AED]" />
            </div>
            <div>
              <div className="text-sm text-[#A78BFA] font-semibold uppercase tracking-wider">Role</div>
              <div className="text-lg font-bold text-white">Producer</div>
            </div>
          </div>
          {gameState.status === 'playing' && gameState.roundState?.currentTileGenre && (
            <div className="mt-3 pt-3 border-t border-[#7C3AED]/20">
              <p className="text-sm text-gray-300">
                Your turn: Upload a beat for <span className="text-[#7C3AED] font-semibold">{gameState.roundState.currentTileGenre}</span>
              </p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-semibold">Your Status</h3>
              <TitleBadge title={playerData.currentTitle} compact />
            </div>
            <ConnectionStatus />
          </div>
        </div>

        {/* Score Display */}
        <ScoreDisplay
          scoreInfo={playerData.scoreInfo || null}
          playerName={playerData.name}
          isCurrentPlayer={true}
          hasWon={gameState.status === 'finished' && gameState.winner === playerData.id}
          eloRating={playerData.eloRating}
          showPlayerName={false}
        />

        {gameState.status === 'playing' && (
          <div>
            <TurnIndicator 
              currentPlayer={playerData}
              activePlayerId={playerData.id}
              activeGenre={gameState.roundState?.currentTileGenre}
            />
          </div>
        )}
      </div>

      {/* Game Board Column */}
      <div className="order-1 lg:order-2 lg:col-span-2">
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
}
