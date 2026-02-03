import React from 'react';

interface VSIndicatorProps {
  isPlayerTurn: boolean;
  currentTurn: 'player1' | 'player2';
}

export const VSIndicator: React.FC<VSIndicatorProps> = ({ isPlayerTurn, currentTurn }) => {
  return (
    <div className="flex items-center justify-center p-2">
      <div className={`w-4 h-4 rounded-full border-2 ${isPlayerTurn ? 'border-green-500 bg-green-500' : 'border-gray-300 bg-gray-100'}`}>
        <span className={`text-xs font-semibold ${isPlayerTurn ? 'text-green-700' : 'text-gray-500'}`}>
          {isPlayerTurn ? 'Your Turn' : `Waiting for ${currentTurn === 'player1' ? 'Player 2' : 'Player 1'}`}
        </span>
      </div>
    </div>
  );
};

export default VSIndicator;