import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useParams } from "react-router-dom";
import Index from "./pages/Index";
import Lobby from "./pages/Lobby";
import Room from "./pages/Room";
import Producer from "./pages/Producer";
import ThemeAdmin from "./pages/ThemeAdmin";
import PlayerAdmin from "./pages/PlayerAdmin";
import Leaderboard from "./pages/Leaderboard";
import DiscordCallback from "./pages/DiscordCallback";
import NotFound from "./pages/NotFound";
import { GameProvider, GameRefreshProvider } from "./context/GameContext";

const queryClient = new QueryClient();

// Wrapper component to extract room ID and provide GameContext
const RoomWrapper = () => {
  const { id } = useParams<{ id: string }>();
  return (
    <GameProvider roomCode={id}>
      <Room />
    </GameProvider>
  );
};

const App = () => (
  <ErrorBoundary>
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <GameRefreshProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Lobby />} />
            <Route path="/room/:id" element={<RoomWrapper />} />
            <Route path="/spectator" element={<Index />} />
            <Route path="/producer" element={<Producer />} />
            <Route path="/admin/themes" element={<ThemeAdmin />} />
            <Route path="/admin/players" element={<PlayerAdmin />} />
            <Route path="/leaderboard" element={<Leaderboard />} />
            <Route path="/auth/discord/callback" element={<DiscordCallback />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </GameRefreshProvider>
    </TooltipProvider>
  </QueryClientProvider>
</ErrorBoundary>
);

export default App;
