import { GameProvider } from '@/context/GameContext';
import { SpectatorView } from '@/components/game/SpectatorView';

const Index = () => {
  return (
    <GameProvider>
      <SpectatorView />
    </GameProvider>
  );
};

export default Index;
