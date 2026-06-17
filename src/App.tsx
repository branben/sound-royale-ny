import React, { lazy, Suspense } from "react";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useParams } from "react-router-dom";
import { GameProvider, GameRefreshProvider } from "./context/GameContext";

// Eagerly loaded — initial lobby route must render immediately
import Lobby from "./pages/Lobby";

// Lazy-loaded routes — split into separate chunks for faster initial load
const Room = lazy(() => import("./pages/Room"));
const Index = lazy(() => import("./pages/Index"));
const Producer = lazy(() => import("./pages/Producer"));
const ThemeAdmin = lazy(() => import("./pages/ThemeAdmin"));
const PlayerAdmin = lazy(() => import("./pages/PlayerAdmin"));
const Leaderboard = lazy(() => import("./pages/Leaderboard"));
const DiscordCallback = lazy(() => import("./pages/DiscordCallback"));
const NotFound = lazy(() => import("./pages/NotFound"));

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
          <Suspense fallback={null}>
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
          </Suspense>
        </BrowserRouter>
      </GameRefreshProvider>
    </TooltipProvider>
  </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
