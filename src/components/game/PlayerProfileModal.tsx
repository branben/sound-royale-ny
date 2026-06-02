import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { motion, AnimatePresence } from 'framer-motion';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Wifi, WifiOff, Trophy, TrendingUp, TrendingDown, Minus, Award } from 'lucide-react';
import { Player, ScoreInfo, GenrePerformance } from '@/types/game';
import { gameApi } from '@/services/api';
import { PlayerStatsRadar } from './PlayerStatsRadar';
import { TitleBadge } from './TitleBadge';
import { DiscordVerifiedIcon } from './DiscordVerifiedIcon';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { transitions, variants, stagger } from '@/lib/motion';

interface PlayerProfileModalProps {
  player: Player;
  isOpen: boolean;
  onClose: () => void;
  scoreInfo?: ScoreInfo | null;
  roomGenres?: string[];
}

export const PlayerProfileModal: React.FC<PlayerProfileModalProps> = ({
  player,
  isOpen,
  onClose,
  scoreInfo,
  roomGenres,
}) => {
  const [genrePerformance, setGenrePerformance] = useState<GenrePerformance[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showContent, setShowContent] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setShowContent(false);
      return;
    }

    let isActive = true;
    setIsLoading(true);
    setGenrePerformance([]);

    gameApi.getGenrePerformance(player.id)
      .then(data => {
        if (isActive) setGenrePerformance(data);
      })
      .catch(() => {
        if (isActive) toast.error('Failed to load genre performance');
      })
      .finally(() => {
        if (isActive) {
          setIsLoading(false);
          // Trigger content entrance after data loads
          requestAnimationFrame(() => setShowContent(true));
        }
      });

    return () => { isActive = false; };
  }, [isOpen, player.id]);

  useEffect(() => {
    if (isOpen) {
      // Small delay for the backdrop to appear first
      const t = setTimeout(() => setShowContent(true), 50);
      return () => clearTimeout(t);
    }
  }, [isOpen]);

  const initials = player.name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const winRate = player.eloMatches && player.eloMatches > 0
    ? Math.round(((player.eloWins ?? 0) / player.eloMatches) * 100)
    : 0;

  const isConnected = player.isConnected ?? true;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent
        data-testid="player-profile-modal"
        className="max-h-[90dvh] max-w-[calc(100vw-2rem)] overflow-y-auto border-border bg-background/95 backdrop-blur-xl sm:max-w-md p-0 gap-0"
      >
        {/* Animated backdrop overlay */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="absolute inset-0 bg-black/20 pointer-events-none rounded-lg"
        />

        {/* Header — always visible */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...transitions.smooth, delay: 0.05 }}
          className="relative px-6 pt-6 pb-4"
        >
          <DialogHeader className="text-left space-y-4">
            <div className="flex items-center gap-4">
              <Avatar className="h-14 w-14 border-2 border-primary/50 shrink-0">
                <AvatarFallback className="bg-primary/20 text-primary font-bold">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  <DialogTitle className="truncate text-xl text-foreground">{player.name}</DialogTitle>
                  <DiscordVerifiedIcon username={player.discordUsername} />
                </div>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <TitleBadge title={player.currentTitle} />
                  {player.isHost && (
                    <span className="inline-flex items-center gap-1 rounded border border-yellow-500/40 bg-yellow-500/15 px-2 py-0.5 text-[10px] font-medium text-yellow-300">
                      <Trophy className="h-3 w-3" />
                      Host
                    </span>
                  )}
                  {player.isSpectator && (
                    <span className="inline-flex items-center rounded border border-muted-foreground/30 bg-muted/50 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                      Spectator
                    </span>
                  )}
                  <span className={cn(
                    'inline-flex items-center gap-1 text-xs',
                    isConnected ? 'text-green-400' : 'text-red-400'
                  )}>
                    {isConnected ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
                    {isConnected ? 'Online' : 'Offline'}
                  </span>
                </div>
              </div>
            </div>
          </DialogHeader>
        </motion.div>

        {/* Scrollable content with staggered entrance */}
        <div className="relative px-6 pb-6 space-y-4 overflow-y-auto">
          <AnimatePresence>
            {showContent && (
              <motion.div
                variants={stagger.containerSlow}
                initial="hidden"
                animate="visible"
                className="space-y-4"
              >
                {/* ELO + Record — compact stat row */}
                <motion.div variants={variants.slideUp}>
                  <div className="flex items-center gap-4 rounded-lg border border-border/50 bg-card/50 p-4">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-primary">{player.eloRating ?? 1200}</div>
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wider">ELO</div>
                    </div>
                    <div className="h-8 w-px bg-border/50" />
                    <div className="flex-1 grid grid-cols-3 gap-3 text-center">
                      <div>
                        <div className="text-lg font-bold text-foreground">{player.eloWins ?? 0}</div>
                        <div className="text-[10px] text-muted-foreground">Wins</div>
                      </div>
                      <div>
                        <div className="text-lg font-bold text-foreground">{player.eloLosses ?? 0}</div>
                        <div className="text-[10px] text-muted-foreground">Losses</div>
                      </div>
                      <div>
                        <div className="text-lg font-bold text-foreground">{player.eloMatches ?? 0}</div>
                        <div className="text-[10px] text-muted-foreground">Matches</div>
                      </div>
                    </div>
                    <div className="text-center">
                      <div className={cn(
                        'text-lg font-bold',
                        winRate >= 50 ? 'text-green-400' : 'text-red-400'
                      )}>{winRate}%</div>
                      <div className="text-[10px] text-muted-foreground">Win Rate</div>
                    </div>
                  </div>
                </motion.div>

                {/* Current score — only if playing */}
                {scoreInfo && (
                  <motion.div variants={variants.slideUp}>
                    <div className="flex items-center gap-3 rounded-lg border border-yellow-500/20 bg-yellow-500/5 p-4">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-yellow-500/15">
                        <Award className="h-5 w-5 text-yellow-400" />
                      </div>
                      <div className="flex-1">
                        <div className="text-xs text-muted-foreground">Current Match Score</div>
                        <div className="text-2xl font-bold text-yellow-400">{scoreInfo.score}</div>
                      </div>
                      {scoreInfo.lines.length > 0 && (
                        <span className="rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                          {scoreInfo.lines.length} Line{scoreInfo.lines.length > 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                  </motion.div>
                )}

                {/* Genre Performance Radar — the "cool graph" */}
                <motion.div variants={variants.slideUp}>
                  {isLoading ? (
                    <div className="flex items-center justify-center p-12">
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                        className="h-6 w-6 rounded-full border-2 border-primary/30 border-t-primary"
                      />
                    </div>
                  ) : genrePerformance.length > 0 ? (
                    <PlayerStatsRadar player={player} genrePerformance={genrePerformance} roomGenres={roomGenres} />
                  ) : (
                    <div className="rounded-lg border border-border/30 bg-card/30 p-6 text-center">
                      <TrendingUp className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
                      <p className="text-xs text-muted-foreground">No match history yet</p>
                      <p className="text-[10px] text-muted-foreground/60 mt-1">Genre performance will appear after the first round</p>
                    </div>
                  )}
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </DialogContent>
    </Dialog>
  );
};
