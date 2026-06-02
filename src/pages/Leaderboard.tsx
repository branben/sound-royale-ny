import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Trophy, Search, Loader2, Flame, TrendingUp, Swords, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Player, GenrePerformance } from '@/types/game';
import { gameApi } from '@/services/api';
import { TitleBadge } from '@/components/game/TitleBadge';
import { toast } from 'sonner';
import { PlayerProfileModal } from '@/components/game/PlayerProfileModal';
import { transitions, stagger, hover } from '@/lib/motion';

interface PlayerWithGenrePerformance extends Player {
  genrePerformance: GenrePerformance[];
}

const titlePriority: Record<NonNullable<Player['currentTitle']>, number> = {
  SWEEPER: 3,
  JACKPOT: 2,
  CHECKED_IN: 1,
  NONE: 0,
};

const rankStyles: Record<number, { ring: string; glow: string; badge: string }> = {
  1: { ring: 'ring-2 ring-yellow-500/60', glow: 'bg-yellow-500/10', badge: 'text-yellow-400' },
  2: { ring: 'ring-2 ring-gray-400/50', glow: 'bg-gray-400/8', badge: 'text-gray-300' },
  3: { ring: 'ring-2 ring-amber-700/50', glow: 'bg-amber-700/8', badge: 'text-amber-600' },
};

export default function Leaderboard() {
  const [players, setPlayers] = useState<PlayerWithGenrePerformance[]>([]);
  const [filteredPlayers, setFilteredPlayers] = useState<PlayerWithGenrePerformance[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);

  useEffect(() => {
    loadLeaderboard();
  }, []);

  useEffect(() => {
    if (searchQuery.trim() === '') {
      setFilteredPlayers(players);
    } else {
      const query = searchQuery.toLowerCase();
      setFilteredPlayers(
        players.filter(p => p.name.toLowerCase().includes(query))
      );
    }
  }, [searchQuery, players]);

  const loadLeaderboard = async () => {
    setIsLoading(true);
    try {
      const allPlayers = await gameApi.getAllPlayers();

      const playersWithGenrePerformance = await Promise.all(
        allPlayers.map(async (player) => {
          try {
            const genrePerformance = await gameApi.getGenrePerformance(player.id);
            return { ...player, genrePerformance };
          } catch {
            return { ...player, genrePerformance: [] };
          }
        })
      );

      const sorted = playersWithGenrePerformance.sort((a, b) => {
        const eloDelta = (b.eloRating ?? 1200) - (a.eloRating ?? 1200);
        if (eloDelta !== 0) return eloDelta;
        const titleDelta = titlePriority[b.currentTitle ?? 'NONE'] - titlePriority[a.currentTitle ?? 'NONE'];
        if (titleDelta !== 0) return titleDelta;
        return a.name.localeCompare(b.name);
      });
      setPlayers(sorted);
      setFilteredPlayers(sorted);
    } catch (error) {
      toast.error('Failed to load leaderboard');
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const handlePlayerClick = (player: Player) => {
    setSelectedPlayer(player);
  };

  const handleCloseProfile = () => {
    setSelectedPlayer(null);
  };

  const topGenres = (perf: GenrePerformance[]) => {
    return perf
      .filter(g => g.total_rounds > 0)
      .sort((a, b) => b.win_rate - a.win_rate)
      .slice(0, 3);
  };

  return (
    <div className="min-h-dvh bg-background px-4 py-6 text-foreground">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold font-['Righteous'] text-foreground">
              Leaderboard
            </h1>
            <p className="text-sm text-muted-foreground">Top producers ranked by ELO rating</p>
          </div>
          <Button asChild variant="outline" className="w-full sm:w-auto">
            <Link to="/">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Lobby
            </Link>
          </Button>
        </header>

        <div className="flex items-center gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-card border-border"
            />
          </div>
        </div>

        {isLoading ? (
          <div className="flex min-h-64 items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <motion.div
            variants={stagger.container}
            initial="hidden"
            animate="visible"
            className="flex flex-col divide-y divide-border/50 rounded-xl border border-border/30 bg-card/40 overflow-hidden"
          >
            <AnimatePresence mode="popLayout">
              {filteredPlayers.map((player, index) => {
                const rank = index + 1;
                const style = rankStyles[rank];
                const genres = topGenres(player.genrePerformance);
                const isTop3 = rank <= 3;

                return (
                  <motion.div
                    key={player.id}
                    variants={{
                      hidden: { opacity: 0, x: -16 },
                      visible: { opacity: 1, x: 0 },
                      exit: { opacity: 0, x: 16 },
                    }}
                    transition={transitions.smooth}
                    layout
                    whileHover={{ backgroundColor: 'rgba(34, 211, 238, 0.04)' }}
                    className="group relative flex items-center gap-4 px-4 py-3 sm:px-6 sm:py-4 cursor-pointer"
                    onClick={() => handlePlayerClick(player)}
                  >
                    {isTop3 && style && (
                      <div className={`absolute inset-0 ${style.glow} pointer-events-none`} />
                    )}

                    <div className={cn(
                      'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold',
                      isTop3 && style ? `${style.ring} ${style.badge} bg-card` : 'bg-muted/60 text-muted-foreground'
                    )}>
                      {rank}
                    </div>

                    <Avatar className={cn(
                      'h-10 w-10 border-2 shrink-0',
                      isTop3 ? 'border-primary/60' : 'border-border'
                    )}>
                      <AvatarFallback className="bg-primary/20 text-primary font-bold text-xs">
                        {getInitials(player.name)}
                      </AvatarFallback>
                    </Avatar>

                    <div className="flex-1 min-w-0">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="truncate font-semibold text-foreground group-hover:text-primary transition-colors">
                          {player.name}
                        </span>
                        <TitleBadge title={player.currentTitle} compact />
                        {player.isSpectator && (
                          <Badge variant="outline" className="border-muted-foreground/30 text-muted-foreground text-[10px] px-1.5 py-0">
                            Spectator
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-0.5">
                        {genres.length > 0 && (
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Flame className="h-3 w-3 text-primary/60" />
                            {genres.map((g, i) => (
                              <span key={g.genre} className="flex items-center gap-0.5">
                                {i > 0 && <span className="text-border">/</span>}
                                <span className="text-foreground/70">{g.genre}</span>
                                <span className="text-primary font-medium" data-testid={`genre-grade-${g.genre}`}>{g.grade}</span>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="hidden sm:flex items-center gap-6 shrink-0">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Swords className="h-3.5 w-3.5" />
                        <span className="font-medium text-foreground">{player.eloWins ?? 0}<span className="text-muted-foreground">W</span></span>
                        <span className="text-border">/</span>
                        <span className="font-medium text-foreground">{player.eloLosses ?? 0}<span className="text-muted-foreground">L</span></span>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <TrendingUp className="h-3.5 w-3.5" />
                        <span className="font-medium text-foreground">{player.eloMatches ?? 0}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className={cn(
                        'font-bold tabular-nums',
                        isTop3 && style ? style.badge : 'text-primary'
                      )}>
                        {player.eloRating ?? 1200}
                      </span>
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">ELO</span>
                    </div>

                    <ChevronRight className="h-4 w-4 text-muted-foreground/0 group-hover:text-muted-foreground transition-colors shrink-0" />
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </motion.div>
        )}

        {!isLoading && filteredPlayers.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <Trophy className="h-12 w-12 mx-auto mb-4 text-primary/50" />
            <p>No players found</p>
          </div>
        )}
      </div>

      {selectedPlayer && (
        <PlayerProfileModal
          player={selectedPlayer}
          isOpen={!!selectedPlayer}
          onClose={handleCloseProfile}
          scoreInfo={selectedPlayer.scoreInfo}
        />
      )}
    </div>
  );
}
