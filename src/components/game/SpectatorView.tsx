import { useState } from 'react';
import { useGame } from '@/context/GameContext';
import { BingoBoard } from './BingoBoard';
import { UploadDrawer } from './UploadDrawer';
import { Tile } from '@/types/game';
import { Crown, Zap, Users } from 'lucide-react';

export function SpectatorView() {
  const { gameState, setTileAudio, updateTileStatus } = useGame();
  const [selectedTile, setSelectedTile] = useState<{ playerId: string; tile: Tile } | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const players = Object.values(gameState.players);

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
    <div className="min-h-screen bg-background">
      {/* Header */}
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

      {/* Main Content - Split Screen */}
      <main className="container mx-auto p-4 md:p-8">
        <div className="mb-6 text-center">
          <h2 className="text-2xl font-bold text-foreground md:text-3xl">Battle Arena</h2>
          <p className="text-muted-foreground">Watch the producers compete in real-time</p>
        </div>

        {/* VS Indicator for larger screens */}
        <div className="relative">
          <div className="hidden md:absolute md:left-1/2 md:top-1/2 md:z-10 md:flex md:-translate-x-1/2 md:-translate-y-1/2 md:items-center md:justify-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-primary/50 bg-card/80 shadow-lg shadow-primary/20 backdrop-blur-md">
              <span className="text-xl font-bold text-primary">VS</span>
            </div>
          </div>

          {/* Boards Grid */}
          <div className="grid gap-6 md:grid-cols-2 md:gap-8 lg:gap-12">
            {players.map((player) => (
              <BingoBoard
                key={player.id}
                playerId={player.id}
                playerName={player.name}
                boardData={player.board}
                onTileClick={(tileId) => handleTileClick(player.id, tileId)}
                isInteractive={true}
              />
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

      {/* Upload Drawer */}
      <UploadDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        tile={selectedTile?.tile || null}
        onUpload={handleUpload}
      />
    </div>
  );
}
