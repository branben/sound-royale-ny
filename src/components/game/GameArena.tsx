import React from 'react';
import { GameInfo } from './GameInfo';

interface GameArenaProps {
  roomId: string;
  currentPlayerName?: string;
}

export const GameArena: React.FC<GameArenaProps> = ({ roomId, currentPlayerName }) => {
  return (
    <div className="w-full h-full flex flex-col">
      {/* Game Arena Container */}
      <div className="flex-1 items-center justify-center bg-card rounded-lg p-8 mb-6">
        <div className="text-2xl font-bold text-foreground">
          Game Arena
        </div>
        <div className="text-sm text-muted-foreground mt-2">
          {currentPlayerName && (
            <span>Playing as: {currentPlayerName}</span>
          )}
        </div>
      </div>

      {/* Placeholder for VS display */}
      <div className="flex-1 flex-1 items-center justify-center bg-card rounded-lg p-8 mb-6">
        <div className="text-lg font-semibold text-foreground">
          VS Display Area
        </div>
      </div>
    </div>
  );
};

export default GameArena;