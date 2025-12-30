import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GameProvider, useGame } from '@/context/GameContext';
import { BingoBoard } from '@/components/game/BingoBoard';
import { UploadDrawer } from '@/components/game/UploadDrawer';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Eye } from 'lucide-react';
import { Tile } from '@/types/game';

function ProducerContent() {
  const navigate = useNavigate();
  const { gameState, setTileAudio } = useGame();
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
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/3 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/3 right-1/4 w-96 h-96 bg-accent/5 rounded-full blur-3xl" />
      </div>

      {/* Header */}
      <header className="relative z-10 flex items-center justify-between p-4 border-b border-border/30 bg-card/40 backdrop-blur-md">
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
            boardData={player.board}
            onTileClick={handleTileClick}
            isInteractive={true}
            className="shadow-2xl"
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
  return (
    <GameProvider>
      <ProducerContent />
    </GameProvider>
  );
}
