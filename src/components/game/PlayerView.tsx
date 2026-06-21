import { memo, useState, forwardRef } from 'react';
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
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';

interface PlayerViewProps {
  roomId: string;
  playerName?: string;
  bingoBoardRef?: React.ForwardedRef<HTMLDivElement>;
}

export const PlayerView = memo(
  forwardRef<HTMLDivElement, PlayerViewProps>(function PlayerView(
    { roomId, playerName, bingoBoardRef },
    ref,
  ) {
    const { gameState, setGameState } = useGame();
    const playerColors = usePlayerColors(gameState.players ?? {});
    const [selectedTile, setSelectedTile] = useState<{ tile: Tile } | null>(null);
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);
    const [showBingoNotification, setShowBingoNotification] = useState(false);
    const [isDoubleBingo, setIsDoubleBingo] = useState(false);

    const players = gameState.players ? Object.values(gameState.players) : [];
    const currentPlayer = playerName
      ? players.find((player) => player.name === playerName)
      : players.find((player) => player.name && !player.name.startsWith('Spectator '));

    const playerData = currentPlayer
      ? {
          ...currentPlayer,
          tiles: currentPlayer.board?.tiles || [],
        }
      : null;

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
        const updatedTiles = playerData.tiles.map((t) =>
          t.id === selectedTile.tile.id
            ? { ...t, status: 'pending' as const, audioUrl: audioUrl }
            : t,
        );

        setGameState((prev) => {
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

    const handleBingoNotificationComplete = () => {
      setShowBingoNotification(false);
    };

    if (!playerData) {
      return (
        <div className="text-center py-8">
          <p className="text-zinc-400">Failed to load player data</p>
        </div>
      );
    }

    const ConnectionStatus = () => {
      const isConnected = playerData.isConnected;
      return (
        <div
          data-testid="connection-status"
          className={`flex items-center gap-1 text-xs ${isConnected ? 'text-green-500' : 'text-zinc-500'}`}
        >
          <span
            className={`h-2 w-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}
          />
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

    const playerAccentClasses =
      currentPlayerColorIndex !== undefined && currentPlayerColorIndex < PLAYER_ACCENT.length
        ? PLAYER_ACCENT[currentPlayerColorIndex]
        : 'bg-primary/15 text-primary';

    const playerTextAccent =
      currentPlayerColorIndex !== undefined
        ? `text-player-${currentPlayerColorIndex + 1}`
        : 'text-primary';

    const playerBorderAccent =
      currentPlayerColorIndex !== undefined
        ? `border-player-${currentPlayerColorIndex + 1}`
        : 'border-primary';

    return (
      <div ref={ref} className="flex flex-col gap-3">
        {/* Desktop: horizontal player bar */}
        <div className="hidden lg:flex items-center gap-3 rounded-lg bg-zinc-900 px-4 py-3">
          <div
            className={`flex h-9 w-9 items-center justify-center rounded-full ${playerAccentClasses}`}
          >
            <Music className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-zinc-100 truncate">{playerData.name}</p>
              <TitleBadge title={playerData.currentTitle} compact />
              <ConnectionStatus />
            </div>
          </div>
          <ScoreDisplay
            scoreInfo={playerData.scoreInfo || null}
            playerName={playerData.name}
            isCurrentPlayer={true}
            hasWon={gameState.status === 'finished' && gameState.winner === playerData.id}
            eloRating={playerData.eloRating}
            showPlayerName={false}
          />
          {gameState.status === 'playing' && gameState.roundState?.currentTileGenre && (
            <p className="text-xs text-zinc-400">
              Upload for{' '}
              <span className={`font-semibold ${playerTextAccent}`}>
                {gameState.roundState.currentTileGenre}
              </span>
            </p>
          )}
        </div>

        {/* Mobile: accordion */}
        <div className="lg:hidden">
          <Accordion type="single" collapsible>
            <AccordionItem value="player-info" className="border-none">
              <AccordionTrigger className="rounded-lg bg-zinc-800 px-4 py-3 hover:bg-zinc-700 hover:translate-x-0.5 transition-all duration-150">
                <div className="flex items-center gap-3">
                  <div className={`flex h-8 w-8 items-center justify-center rounded-full ${playerAccentClasses}`}>
                    <Music className="h-4 w-4" />
                  </div>
                  <span className="text-sm font-semibold text-zinc-100">{playerData.name}</span>
                  <span className="ml-auto text-xs text-zinc-400 tabular-nums">
                    {playerData.scoreInfo?.score ?? 0} pts
                  </span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="rounded-b-lg bg-zinc-900 px-4 py-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <TitleBadge title={playerData.currentTitle} compact />
                    <ConnectionStatus />
                  </div>
                  {gameState.status === 'playing' && gameState.roundState?.currentTileGenre && (
                    <p className="text-xs text-zinc-400">
                      Upload for{' '}
                      <span className={`font-semibold ${playerTextAccent}`}>
                        {gameState.roundState.currentTileGenre}
                      </span>
                    </p>
                  )}
                </div>
                <div className="mt-2">
                  <ScoreDisplay
                    scoreInfo={playerData.scoreInfo || null}
                    playerName={playerData.name}
                    isCurrentPlayer={true}
                    hasWon={gameState.status === 'finished' && gameState.winner === playerData.id}
                    eloRating={playerData.eloRating}
                    showPlayerName={false}
                  />
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>

        {/* Board — full width */}
        <BingoBoard
          ref={bingoBoardRef}
          playerId={playerData.id}
          playerName={playerData.name}
          isDiscordVerified={playerData.isDiscordVerified}
          discordUsername={playerData.discordUsername}
          boardData={{
            tiles: playerData.tiles || [],
          }}
          onTileClick={handleTileClick}
          isInteractive={gameState.status === 'playing' && !currentPlayer?.isSpectator}
          isTileInteractive={(tileId) => {
            const tile = playerData.tiles.find((entry) => entry.id === tileId);
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

        <BingoNotification
          isVisible={showBingoNotification}
          isDoubleBingo={isDoubleBingo}
          onComplete={handleBingoNotificationComplete}
        />

        {gameState.status === 'finished' && gameState.winner && (
          <WinnerAnnouncement
            winnerName={players.find((p) => p.id === gameState.winner)?.name || 'Unknown'}
            score={players.find((p) => p.id === gameState.winner)?.scoreInfo?.score}
            eloDeltas={gameState.eloDeltas}
            isVisible={true}
          />
        )}

        {gameState.status === 'finished' && !gameState.winner && (
          <GameOverScreen
            isVisible={true}
            onReturnToLobby={() => (window.location.href = '/')}
            onPlayAgain={() => (window.location.href = '/')}
            totalScore={playerData.scoreInfo?.score}
          />
        )}
      </div>
    );
  }),
);
