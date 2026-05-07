import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Trophy, Search, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Player, GenrePerformance } from '@/types/game';
import { gameApi } from '@/services/api';
import { GenreHeatmap } from '@/components/game/GenreHeatmap';
import { TitleBadge } from '@/components/game/TitleBadge';
import { toast } from 'sonner';

interface PlayerWithHeatmap extends Player {
  genrePerformance: GenrePerformance[];
}

const titlePriority: Record<NonNullable<Player['currentTitle']>, number> = {
  SWEEPER: 3,
  JACKPOT: 2,
  CHECKED_IN: 1,
  NONE: 0,
};

export default function Leaderboard() {
  const [players, setPlayers] = useState<PlayerWithHeatmap[]>([]);
  const [filteredPlayers, setFilteredPlayers] = useState<PlayerWithHeatmap[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

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

      // Fetch genre performance for each player
      const playersWithHeatmap = await Promise.all(
        allPlayers.map(async (player) => {
          try {
            const genrePerformance = await gameApi.getGenrePerformance(player.id);
            return { ...player, genrePerformance };
          } catch {
            // If genre performance fails, return player with empty array
            return { ...player, genrePerformance: [] };
          }
        })
      );

      const sorted = playersWithHeatmap.sort((a, b) => {
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

  return (
    <div className="min-h-dvh bg-background px-4 py-6 text-foreground">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold font-['Righteous'] text-transparent bg-clip-text bg-gradient-to-r from-[#7C3AED] to-[#F43F5E]">
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
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              placeholder="Search by name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-[#111126] border-[#7C3AED]/30"
            />
          </div>
        </div>

        {isLoading ? (
          <div className="flex min-h-64 items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-[#7C3AED]" />
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredPlayers.map((player, index) => (
              <Card key={player.id} className="bg-[#0F0F23]/60 border-[#7C3AED]/30">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-[#7C3AED]/20 text-[#7C3AED] font-bold text-sm">
                      {index + 1}
                    </div>
                    <Avatar className="h-12 w-12 border-2 border-[#7C3AED]/50">
                      <AvatarFallback className="bg-[#7C3AED]/20 text-[#7C3AED] font-bold">
                        {getInitials(player.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex min-w-0 items-center gap-2">
                        <CardTitle className="truncate text-lg text-white">{player.name}</CardTitle>
                        <TitleBadge title={player.currentTitle} compact />
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        {player.isSpectator && (
                          <Badge variant="outline" className="border-gray-500/30 text-gray-400 text-xs">
                            Spectator
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-lg border border-[#7C3AED]/20 bg-[#111126]/70 p-2">
                      <div className="text-[10px] text-gray-400">ELO</div>
                      <div className="text-sm font-bold text-white">{player.eloRating ?? 1200}</div>
                    </div>
                    <div className="rounded-lg border border-[#7C3AED]/20 bg-[#111126]/70 p-2">
                      <div className="text-[10px] text-gray-400">W-L</div>
                      <div className="text-sm font-bold text-white">
                        {player.eloWins ?? 0}-{player.eloLosses ?? 0}
                      </div>
                    </div>
                    <div className="rounded-lg border border-[#7C3AED]/20 bg-[#111126]/70 p-2">
                      <div className="text-[10px] text-gray-400">Matches</div>
                      <div className="text-sm font-bold text-white">{player.eloMatches ?? 0}</div>
                    </div>
                  </div>
                  <GenreHeatmap genrePerformance={player.genrePerformance} compact />
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {!isLoading && filteredPlayers.length === 0 && (
          <div className="text-center py-12 text-gray-400">
            <Trophy className="h-12 w-12 mx-auto mb-4 text-[#7C3AED]/50" />
            <p>No players found</p>
          </div>
        )}
      </div>
    </div>
  );
}
