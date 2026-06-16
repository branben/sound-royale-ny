import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Users, Loader2 } from 'lucide-react';

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
    <div className="space-y-3 animate-in fade-in slide-in-from-bottom-2">
      <div className="space-y-2">
        <Input
          data-testid="room-code-input"
          type="text"
          inputMode="numeric"
          placeholder="0000"
          value={roomCode}
          onChange={onCodeChange}
          className="text-center text-4xl font-mono tracking-[0.5em] h-16 bg-card/50 border-primary/30 focus:border-primary focus:ring-2 focus:ring-ring transition-all duration-200"
          maxLength={4}
        />
        <p className="text-xs text-foreground/50 text-center">
          Enter 4-digit room code
        </p>
      </div>

      <Button
        data-testid="join-room-button"
        onClick={onJoin}
        disabled={roomCode.length !== 4 || isLoading}
        className="w-full h-12 text-lg font-semibold"
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
        <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-sm text-center">
          {error}
        </div>
      )}

      <button
        onClick={onBack}
        className="w-full text-sm text-foreground/50 hover:text-foreground transition-colors"
      >
        &larr; Back
      </button>
    </div>
  );
}
