// QODO TEST: Sound Royale Anti-patterns to detect

import React, { useState, useContext } from 'react';

// ❌ ANTI-PATTERN 1: Direct state mutation (should use setGameState)
const corruptGameState = (gameState, playerId) => {
  gameState.players[playerId].board.tiles[0].status = 'complete'; // Direct mutation!
  return gameState;
};

// ❌ ANTI-PATTERN 2: PlayerSecret exposure (security risk)
const leakSecrets = (playerSecret) => {
  console.log(`Secret: ${playerSecret}`); // Security vulnerability!
  return { playerSecret }; // Exposing secret in response
};

// ❌ ANTI-PATTERN 3: Direct context access instead of hooks
const BadComponent = () => {
  const gameState = useContext(GameContext); // Should use useGameState hook
  return <div>{gameState.players.length}</div>;
};

// ❌ ANTI-PATTERN 4: Missing error handling
const riskyApiCall = async (url) => {
  const response = await fetch(url); // No try-catch!
  return response.json();
};

// ✅ CORRECT PATTERNS
const GoodComponent = () => {
  const { gameState, setGameState } = useGameState(); // Correct hook usage
  
  const handleTileClick = (tileId) => {
    setGameState(prev => ({
      ...prev,
      players: prev.players.map(player => ({
        ...player,
        board: {
          ...player.board,
          tiles: player.board.tiles.map(tile => 
            tile.id === tileId ? { ...tile, status: 'complete' } : tile
          )
        }
      }))
    })); // Immutable update pattern
  };
  
  return <div>Proper state management</div>;
};