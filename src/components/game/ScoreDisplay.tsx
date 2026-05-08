import React from 'react';
import { Trophy, Zap, Target, Star, TrendingUp } from 'lucide-react';

interface ScoreInfo {
  score: number;
  base_score: number;
  bonuses: Array<{
    type: string;
    points: number;
  }>;
  lines: Array<{
    type: string;
    positions: number[];
  }>;
}

interface ScoreDisplayProps {
  scoreInfo: ScoreInfo | null;
  playerName: string;
  isCurrentPlayer: boolean;
  hasWon?: boolean;
  onPlayerClick?: () => void;
  eloRating?: number;
  eloDelta?: number;
  showPlayerName?: boolean;
}

export const ScoreDisplay: React.FC<ScoreDisplayProps> = ({
  scoreInfo,
  playerName,
  isCurrentPlayer,
  hasWon = false,
  onPlayerClick,
  eloRating,
  eloDelta,
  showPlayerName = true
}) => {
  const eloRatingDisplay = eloRating !== undefined ? (
    <div className="flex items-center justify-center gap-2 mb-3 px-2 py-1 bg-[#7C3AED]/10 rounded border border-[#7C3AED]/30" data-testid="elo-rating">
      <TrendingUp className="h-3 w-3 text-[#7C3AED]" />
      <span className="text-sm font-semibold text-[#7C3AED]">ELO: {eloRating}</span>
    </div>
  ) : null;

  if (!scoreInfo) {
    return (
      <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-4 border border-gray-700/50">
        {showPlayerName && (
          <div className="text-center text-gray-400 font-medium">
            {playerName}
          </div>
        )}
        {eloRatingDisplay}
        <div className="text-center text-sm text-gray-500">
          No score yet
        </div>
      </div>
    );
  }

  const hasMultiLineBonus = scoreInfo.bonuses.some(b => b.type === 'multi_line');
  const hasSpeedBonus = scoreInfo.bonuses.some(b => b.type === 'speed');

  return (
    <div 
      data-testid="score-display"
      data-victory-celebration={hasWon ? 'true' : undefined}
      className={`
        bg-gray-800/50 backdrop-blur-sm rounded-lg p-4 border transition-all duration-300 cursor-pointer
        ${isCurrentPlayer ? 'border-blue-500/50 shadow-blue-500/20' : 'border-gray-700/50'}
        ${hasWon ? 'border-yellow-500/70 shadow-yellow-500/30 animate-pulse' : ''}
        ${onPlayerClick ? 'hover:border-[#7C3AED]/50 hover:shadow-[#7C3AED]/20' : ''}
      `}
      onClick={onPlayerClick}
    >
      {/* Player Name with Winner Badge */}
      <div className="flex items-center justify-between mb-3">
        {showPlayerName && (
          <div className={`
            font-medium
            ${isCurrentPlayer ? 'text-blue-400' : 'text-gray-300'}
            ${hasWon ? 'text-yellow-400 font-bold' : ''}
            ${onPlayerClick ? 'hover:text-[#7C3AED] transition-colors' : ''}
          `}>
            {playerName}
            {onPlayerClick && <span className="text-xs text-gray-500 ml-1">→</span>}
          </div>
        )}
        {hasWon && (
          <div className="flex items-center gap-1 text-yellow-400">
            <Trophy className="w-4 h-4" />
            <span className="text-xs font-bold">WINNER</span>
          </div>
        )}
      </div>

      {/* ELO Rating Display (conditional) */}
      {eloRatingDisplay}

      {/* ELO Delta Badge (conditional) */}
      {eloDelta !== undefined && hasWon && (
        <div className="flex items-center justify-center gap-1 mb-3" data-testid="elo-delta">
          <span className={`text-sm font-bold ${eloDelta >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {eloDelta >= 0 ? '+' : ''}{eloDelta}
          </span>
        </div>
      )}

      {/* Main Score */}
      <div className="text-center mb-4">
        <div className={`
          text-3xl font-bold
          ${hasWon ? 'text-yellow-400' : 'text-white'}
        `}>
          {scoreInfo.score}
        </div>
        <div className="text-xs text-gray-400">points</div>
      </div>

      {/* Score Breakdown */}
      <div className="space-y-2 mb-4">
        {/* Base Score */}
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2 text-gray-400">
            <Target className="w-3 h-3" />
            <span>Base Score</span>
          </div>
          <span className="text-gray-300 font-medium">
            {scoreInfo.base_score}
          </span>
        </div>

        {/* Bonus Breakdown */}
        {scoreInfo.bonuses.map((bonus, index) => (
          <div key={index} className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2 text-gray-400">
              {bonus.type === 'multi_line' && <Zap className="w-3 h-3 text-purple-400" />}
              {bonus.type === 'speed' && <Star className="w-3 h-3 text-green-400" />}
              <span className="capitalize">
                {bonus.type.replace('_', ' ')} Bonus
              </span>
            </div>
            <span className="text-green-400 font-medium">
              +{bonus.points}
            </span>
          </div>
        ))}
      </div>

      {/* Completed Lines Display */}
      <div className="border-t border-gray-700 pt-3">
        <div className="text-xs text-gray-400 mb-2">Completed Lines:</div>
        <div className="flex flex-wrap gap-1">
          {scoreInfo.lines.length === 0 ? (
            <div className="text-xs text-gray-500">None yet</div>
          ) : (
            scoreInfo.lines.map((line, index) => (
              <div 
                key={index}
                className="w-6 h-6 rounded bg-gradient-to-br from-blue-500/30 to-purple-500/30 border border-blue-400/50 flex items-center justify-center"
                title={`${line.type} line: positions ${line.positions.join(', ')}`}
              >
                <div className="text-xs font-bold text-blue-300">
                  {line.type === 'row' && '—'}
                  {line.type === 'column' && '|'}
                  {line.type === 'diagonal' && '\\'}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Visual Indicators */}
      <div className="mt-3 flex gap-2">
        {hasMultiLineBonus && (
          <div className="px-2 py-1 bg-purple-500/20 rounded text-xs text-purple-400 border border-purple-500/30">
            Multi-Line
          </div>
        )}
        {hasSpeedBonus && (
          <div className="px-2 py-1 bg-green-500/20 rounded text-xs text-green-400 border border-green-500/30">
            Speed
          </div>
        )}
        {scoreInfo.lines.length >= 2 && (
          <div className="px-2 py-1 bg-yellow-500/20 rounded text-xs text-yellow-400 border border-yellow-500/30">
            Dominating
          </div>
        )}
      </div>
    </div>
  );
};
