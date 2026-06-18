import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Users, Loader2, ArrowLeft } from 'lucide-react';

interface JoinRoomFormProps {
  roomCode: string;
  isLoading: boolean;
  error: string | null;
  onCodeChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onJoin: () => void;
  onBack: () => void;
}

export function JoinRoomForm({
  roomCode,
  isLoading,
  error,
  onCodeChange,
  onJoin,
  onBack,
}: JoinRoomFormProps) {
  return (
    <div className="space-y-5 animate-in fade-in slide-in-from-bottom-2">
      <div className="space-y-3">
        <label className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground text-center block">
          Room Code
        </label>
        <Input
          data-testid="room-code-input"
          type="text"
          inputMode="numeric"
          placeholder="0000"
          value={roomCode}
          onChange={onCodeChange}
          className="text-center text-5xl font-mono tracking-[0.4em] h-20 bg-background/50 border-2 border-muted-foreground/30 focus:border-primary focus:ring-2 focus:ring-ring transition-all duration-200 font-bold"
          maxLength={4}
        />
        <p className="text-xs text-muted-foreground text-center">
          Enter the 4-digit code from the host
        </p>
      </div>

      <Button
        data-testid="join-room-button"
        onClick={onJoin}
        disabled={roomCode.length !== 4 || isLoading}
        className="w-full h-14 text-lg font-bold bg-primary hover:bg-primary/90 shadow-lg hover:shadow-xl transition-all duration-200"
        size="lg"
      >
        {isLoading ? (
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        ) : (
          <Users className="mr-2 h-5 w-5" />
        )}
        {isLoading ? 'Joining...' : 'Join Room'}
      </Button>

      {error && (
        <div className="p-3 rounded-lg bg-destructive/10 border-2 border-destructive/30 text-destructive text-sm text-center font-medium">
          {error}
        </div>
      )}

      <Button
        onClick={onBack}
        variant="ghost"
        size="sm"
        className="w-full text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to Lobby
      </Button>
    </div>
  );
}
