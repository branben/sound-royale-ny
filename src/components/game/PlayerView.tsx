import { useState, useEffect } from 'react';
import { BingoBoard } from '@/components/game/BingoBoard';
import { UploadDrawer } from '@/components/game/UploadDrawer';
import { TurnTimer } from '@/components/game/TurnTimer';
import { TurnIndicator } from '@/components/game/TurnIndicator';
import { ScoreDisplay } from '@/components/game/ScoreDisplay';
import { VictoryCelebration } from '@/components/game/VictoryCelebration';
import { BingoNotification } from '@/components/game/BingoNotification';
import { toast } from 'sonner';
import { Tile } from '@/types/game';
import { useGame } from '@/context/GameContext';
import { gameApi } from '@/services/api';
import { Wifi, WifiOff } from 'lucide-react';

interface PlayerViewProps {
  roomId: string;
  playerName?: string;
}

export function PlayerView({ roomId, playerName }: PlayerViewProps) {
  const { gameState, setGameState } = useGame();
  const [selectedTile, setSelectedTile] = useState<{ tile: Tile } | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
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

  const handleTileClick = (tileId: string) => {
    if (!playerData) return;
    
    const tile = playerData.tiles.find((t) => t.id === tileId);
    if (tile && tile.status === 'empty') {
      setSelectedTile({ tile });
      setSelectedFile(null);
      setIsDrawerOpen(true);
    }
  };

  const handleUpload = async (audioUrl: string) => {
    if (!selectedTile || !selectedFile) return;
    
    try {
      const updatedTiles = playerData.tiles.map(t => 
        t.id === selectedTile.tile.id 
          ? { ...t, status: 'pending', audioUrl: audioUrl }
          : t
      );
      
      const updatedPlayerData = {
        ...playerData,
        tiles: updatedTiles
      };
      
      setGameState(prev => ({
        ...prev,
        players: {
          ...prev.players,
          [playerData.id]: updatedPlayerData
        }
      }));
      
      await gameApi.submitTile(selectedTile.tile.id, selectedFile);
      
      toast.success('Audio uploaded successfully!');
      setSelectedTile(null);
      setSelectedFile(null);
      setIsDrawerOpen(false);
    } catch (error) {
      toast.error('Failed to upload audio. Please try again.');
      console.error('Tile upload error:', error);
    }
  };

  const handleTimeUp = () => {
    toast.info('Time\'s up! Moving to next turn...');
  };

  // Monitor bingo achievements for current player
  useEffect(() => {
    if (!playerData || !gameState.bingoAchievements) return;

    const currentPlayerBingo = gameState.bingoAchievements.find(
      achievement => achievement.playerId === playerData.id
    );

    if (currentPlayerBingo && !showBingoNotification) {
      setIsDoubleBingo(currentPlayerBingo.isDoubleBingo);
      setShowBingoNotification(true);
    }
  }, [gameState.bingoAchievements, playerData, showBingoNotification]);

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
    const isConnected = playerData.isConnected ?? false;
    return (
      <div className={`flex items-center gap-1 text-xs ${isConnected ? 'text-green-500' : 'text-gray-500'}`}>
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
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold">{playerData.name}</h3>
            <ConnectionStatus />
          </div>
        </div>

        {/* Score Display */}
        <ScoreDisplay
          scoreInfo={playerData.scoreInfo || null}
          playerName={playerData.name}
          isCurrentPlayer={true}
          hasWon={gameState.status === 'finished' && gameState.winner === playerData.id}
        />

        {(gameState.status === 'playing' && gameState.currentTurnPlayerId && playerData.id === gameState.currentTurnPlayerId) && (
          <div>
            <TurnTimer 
              duration={gameState.turnDuration || 120}
              isActive={true}
              onTimeUp={handleTimeUp}
            />
            <TurnIndicator 
              currentPlayer={playerData}
              activePlayerId={gameState.currentTurnPlayerId}
              activeGenre={gameState.activeGenre}
            />
          </div>
        )}
      </div>

      {/* Game Board Column */}
      <div className="lg:col-span-2">
        <BingoBoard
          playerId={playerData.id}
          playerName={playerData.name}
          boardData={{
            tiles: playerData.tiles || []
          }}
          onTileClick={handleTileClick}
          isInteractive={gameState.currentTurnPlayerId === playerData.id}
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
    </div>
  );
}