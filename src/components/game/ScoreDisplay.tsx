import React, { useEffect, useRef } from 'react';
import { Trophy, Zap, Target, Star, TrendingUp } from 'lucide-react';
import { motion, useMotionValue, useTransform, animate } from 'framer-motion';
import { transitions, hover } from '@/lib/motion';

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

function CountUp({ value, className }: { value: number; className?: string }) {
  const motionVal = useMotionValue(value);
  const rounded = useTransform(motionVal, (v) => Math.round(v));
  const prevRef = useRef(value);
  useEffect(() => {
    animate(motionVal, value, { duration: 0.6, ease: 'easeOut' });
    prevRef.current = value;
  }, [value, motionVal]);
  return <motion.span className={className}>{rounded}</motion.span>;
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
  showPlayerName = true,
}) => {
  const eloRatingDisplay =
    eloRating !== undefined ? (
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={transitions.spring}
        className="flex items-center justify-center gap-2 mb-3 px-2 py-1 bg-primary/10 rounded border border-primary/30"
        data-testid="elo-rating"
      >
        <TrendingUp className="h-3 w-3 text-primary" />
        <span className="text-sm font-semibold text-primary">ELO: {eloRating}</span>
      </motion.div>
    ) : null;

  if (!scoreInfo) {
    return (
      <div className="bg-card rounded-lg p-4 border border-border">
        {showPlayerName && (
          <div className="text-center text-muted-foreground font-medium">{playerName}</div>
        )}
        {eloRatingDisplay}
        <div className="text-center text-sm text-muted-foreground">No score yet</div>
      </div>
    );
  }

  const hasMultiLineBonus = scoreInfo.bonuses.some((b) => b.type === 'multi_line');
  const hasSpeedBonus = scoreInfo.bonuses.some((b) => b.type === 'speed');

  return (
    <div
      data-testid="score-display"
      data-victory-celebration={hasWon ? 'true' : undefined}
      className={`
        bg-card rounded-lg p-4 border border-border transition-colors duration-200 cursor-pointer
        ${isCurrentPlayer ? 'border-primary' : 'border-border'}
        ${hasWon ? 'border-yellow-500/50' : ''}
        ${onPlayerClick ? 'hover:border-primary/50' : ''}
      `}
      onClick={onPlayerClick}
    >
      {/* Player Name with Winner Badge */}
      <div className="flex items-center justify-between mb-3">
        {showPlayerName && (
          <div
            className={`
            font-medium
            ${isCurrentPlayer ? 'text-blue-400' : 'text-gray-300'}
            ${hasWon ? 'text-yellow-400 font-bold' : ''}
            ${onPlayerClick ? 'hover:text-primary transition-colors' : ''}
          `}
          >
            {playerName}
            {onPlayerClick && <span className="text-xs text-muted-foreground ml-1">→</span>}
          </div>
        )}
        {hasWon && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={transitions.springBouncy}
            className="flex items-center gap-1 text-yellow-400"
          >
            <Trophy className="w-4 h-4" />
            <span className="text-xs font-bold">WINNER</span>
          </motion.div>
        )}
      </div>

      {/* ELO Rating Display (conditional) */}
      {eloRatingDisplay}

      {/* ELO Delta Badge (conditional) */}
      {eloDelta !== undefined && hasWon && (
        <div className="flex items-center justify-center gap-1 mb-3" data-testid="elo-delta">
          <span
            className={`text-sm font-bold ${eloDelta >= 0 ? 'text-green-400' : 'text-red-400'}`}
          >
            {eloDelta >= 0 ? '+' : ''}
            {eloDelta}
          </span>
        </div>
      )}

      {/* Main Score */}
      <div className="text-center mb-4">
        <CountUp
          value={scoreInfo.score}
          className={`text-3xl font-bold ${hasWon ? 'text-yellow-400' : 'text-white'}`}
        />
        <div className="text-xs text-muted-foreground">points</div>
      </div>

      {/* Score Breakdown */}
      <div className="space-y-2 mb-4">
        {/* Base Score */}
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Target className="w-3 h-3" />
            <span>Base Score</span>
          </div>
          <span className="text-gray-300 font-medium">{scoreInfo.base_score}</span>
        </div>

        {/* Bonus Breakdown */}
        {scoreInfo.bonuses.map((bonus, index) => (
          <motion.div
            key={index}
            initial={{ x: 10, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: index * 0.1, ...transitions.smooth }}
            className="flex items-center justify-between text-sm"
          >
            <div className="flex items-center gap-2 text-muted-foreground">
              {bonus.type === 'multi_line' && <Zap className="w-3 h-3 text-purple-400" />}
              {bonus.type === 'speed' && <Star className="w-3 h-3 text-green-400" />}
              <span className="capitalize">{bonus.type.replace('_', ' ')} Bonus</span>
            </div>
            <span className="text-green-400 font-medium">+{bonus.points}</span>
          </motion.div>
        ))}
      </div>

      {/* Completed Lines Display */}
      <div className="border-t border-border pt-3">
        <div className="text-xs text-muted-foreground mb-2">Completed Lines:</div>
        <div className="flex flex-wrap gap-1">
          {scoreInfo.lines.length === 0 ? (
            <div className="text-xs text-muted-foreground">None yet</div>
          ) : (
            scoreInfo.lines.map((line, index) => (
              <div
                key={index}
                className="w-6 h-6 rounded bg-primary/10 border border-primary/30 flex items-center justify-center"
                title={`${line.type} line: positions ${line.positions.join(', ')}`}
              >
                <div className="text-xs font-bold text-primary">
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
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={transitions.spring}
            className="px-2 py-1 bg-primary/10 rounded text-xs text-primary border border-primary/30"
          >
            Multi-Line
          </motion.div>
        )}
        {hasSpeedBonus && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={transitions.spring}
            className="px-2 py-1 bg-green-500/20 rounded text-xs text-green-400 border border-green-500/30"
          >
            Speed
          </motion.div>
        )}
        {scoreInfo.lines.length >= 2 && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={transitions.spring}
            className="px-2 py-1 bg-yellow-500/20 rounded text-xs text-yellow-400 border border-yellow-500/30"
          >
            Dominating
          </motion.div>
        )}
      </div>
    </div>
  );
};
