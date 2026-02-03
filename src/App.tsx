import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useParams } from "react-router-dom";
import Index from "./pages/Index";
import Lobby from "./pages/Lobby";
import Room from "./pages/Room";
import Producer from "./pages/Producer";
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
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </GameRefreshProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
