import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { RoomLeaderboard } from '@/components/game/RoomLeaderboard';
import { useGame } from '@/context/useGame';

export default function RoomLeaderboardPage() {
  const { id: roomId } = useParams<{ id: string }>();
  const { gameState } = useGame();
  const producers = Object.values(gameState.players || {}).filter((player) => !player.isSpectator);

  return (
    <div className="min-h-screen bg-[#0F0F23] p-4">
      <header className="mb-6 border-b border-[#7C3AED]/20 bg-[#0F0F23]/80 pb-4">
        <div className="container mx-auto flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground md:text-3xl">Room Leaderboard</h1>
            <p className="text-sm text-muted-foreground">Round {gameState.currentRound || 1}</p>
          </div>
          <Button asChild variant="outline" className="w-full sm:w-auto">
            <Link to={`/room/${roomId}`}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Room
            </Link>
          </Button>
        </div>
      </header>

      <main className="container mx-auto max-w-4xl">
        <RoomLeaderboard producers={producers} />
      </main>
    </div>
  );
}
