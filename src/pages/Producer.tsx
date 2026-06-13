import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GameProvider } from '@/context/GameContext';
import { useGame } from '@/context/useGame';
import { BingoBoard } from '@/components/game/BingoBoard';
import { UploadDrawer } from '@/components/game/UploadDrawer';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Eye } from 'lucide-react';
import { Tile } from '@/types/game';
import { usePlayerColors } from '@/hooks/usePlayerColors';

function ProducerContent() {
  const navigate = useNavigate();
  const { gameState, setTileAudio } = useGame();
  const playerColors = usePlayerColors(gameState.players);
  const [selectedTile, setSelectedTile] = useState<Tile | null>(null);
  
  // Current producer (mock: player_1)
  const currentPlayerId = 'player_1';
  const player = gameState.players[currentPlayerId];

  const handleTileClick = (tileId: string) => {
    const tile = player.board.tiles.find(t => t.id === tileId);
    if (tile && tile.status !== 'complete') {
      setSelectedTile(tile);
    }
  };

  const handleUploadComplete = (audioUrl: string) => {
    if (selectedTile) {
      setTileAudio(currentPlayerId, selectedTile.id, audioUrl);
      setSelectedTile(null);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Background effects */}
      {/* Header */}
      <header className="relative z-10 flex items-center justify-between p-4 border-b border-border bg-background">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/')}
          className="gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Leave
        </Button>
        
        <div className="text-center">
          <h1 className="text-lg font-bold text-foreground">Your Board</h1>
          <p className="text-xs text-muted-foreground">{player.name}</p>
        </div>
        
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate('/spectator')}
          className="gap-2"
        >
          <Eye className="h-4 w-4" />
          Spectate
        </Button>
      </header>

      {/* Main content - centered board */}
      <main className="relative z-10 flex-1 flex items-center justify-center p-4 md:p-8">
        <div className="w-full max-w-md">
          <BingoBoard
            playerId={currentPlayerId}
            playerName={player.name}
            isDiscordVerified={player.isDiscordVerified}
            discordUsername={player.discordUsername}
            boardData={player.board}
            onTileClick={handleTileClick}
            isInteractive={true}
            className="shadow-2xl"
            playerColorIndex={playerColors.get(currentPlayerId) ?? 0}
          />
          
          {/* Instructions */}
          <p className="mt-4 text-center text-sm text-muted-foreground">
            Tap a tile to upload your beat
          </p>
        </div>
      </main>

      {/* Upload Drawer */}
      <UploadDrawer
        isOpen={!!selectedTile}
        onClose={() => setSelectedTile(null)}
        tile={selectedTile}
        onUpload={handleUploadComplete}
      />
    </div>
  );
}

export default function Producer() {
  const isE2E = import.meta.env.VITE_E2E_TESTING === 'true';
  const navigate = useNavigate();

  if (!isE2E) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="text-center space-y-4">
          <h1 className="text-xl font-semibold text-foreground">Producer view is E2E-only</h1>
          <p className="text-sm text-muted-foreground">
            Join a room from the Lobby to play as a producer.
          </p>
          <Button onClick={() => navigate('/')} variant="outline">
            Back to Lobby
          </Button>
        </div>
      </div>
    );
  }

  return (
    <GameProvider>
      <ProducerContent />
    </GameProvider>
  );
}
