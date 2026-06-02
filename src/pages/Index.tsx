import { useNavigate } from 'react-router-dom';
import { GameProvider } from '@/context/GameContext';
import { SpectatorView } from '@/components/game/SpectatorView';
import { Button } from '@/components/ui/button';

const Index = () => {
  const isE2E = import.meta.env.VITE_E2E_TESTING === 'true';
  const navigate = useNavigate();

  if (!isE2E) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="text-center space-y-4">
          <h1 className="text-xl font-semibold text-foreground">Spectator view is E2E-only</h1>
          <p className="text-sm text-muted-foreground">
            Join a room from the Lobby to spectate in real time.
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
      <SpectatorView />
    </GameProvider>
  );
};

export default Index;
