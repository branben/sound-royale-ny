import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, BadgeCheck, Trophy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LeaderboardUser, leaderboardApi } from '@/services/api';

export default function GlobalLeaderboardPage() {
  const [leaders, setLeaders] = useState<LeaderboardUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    leaderboardApi.global()
      .then((response) => setLeaders(response.leaderboard))
      .catch((err) => console.error('Leaderboard fetch error:', err))
      .finally(() => setIsLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-background p-4">
      <header className="mb-6 border-b border-border bg-background/80 pb-4">
        <div className="container mx-auto flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground md:text-3xl">Verified Leaderboard</h1>
            <p className="text-sm text-muted-foreground">Ranked results from verified producers</p>
          </div>
          <Button asChild variant="outline" className="w-full sm:w-auto">
            <Link to="/">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Lobby
            </Link>
          </Button>
        </div>
      </header>

      <main className="container mx-auto max-w-4xl">
        <Card className="border-border/30 bg-card/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-yellow-500" />
              Top Verified Producers
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {isLoading && <p className="text-sm text-muted-foreground">Loading leaderboard...</p>}
            {!isLoading && leaders.length === 0 && (
              <p className="text-sm text-muted-foreground">No verified ranked results yet.</p>
            )}
            {leaders.map((leader, index) => (
              <div key={leader.id} className="flex items-center gap-3 rounded-lg p-3 hover:bg-muted/30">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-bold">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-center gap-2">
                    <p className="truncate font-medium text-foreground">{leader.display_name}</p>
                    <BadgeCheck className="h-4 w-4 shrink-0 text-green-500" />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {leader.elo_wins}W / {leader.elo_losses}L / {leader.elo_matches}M
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-primary">{leader.elo_rating}</p>
                  <p className="text-xs text-muted-foreground">ELO</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
