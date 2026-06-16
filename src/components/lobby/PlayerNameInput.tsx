import React from 'react';
import { Input } from '@/components/ui/input';

interface PlayerNameInputProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export function PlayerNameInput({ value, onChange, disabled }: PlayerNameInputProps) {
  return (
    <div className="space-y-2">
      <Input
        data-testid="player-name-input"
        type="text"
        placeholder="Enter your name"
        value={value}
        onChange={(e) => onChange(e.target.value.slice(0, 20))}
        className="text-center text-xl h-12 bg-card/50 border-primary/30 focus:border-primary focus:ring-2 focus:ring-ring transition-all duration-200"
        maxLength={20}
        disabled={disabled}
      />
    </div>
  );
}
